import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { evaluateStreak, GRACE_TOKENS_INITIAL, type StreakTransition } from '@core/domain/retention/streak.domain';
import type { StreakState } from '@core/models/retention/streak.model';
import { STORAGE_KEYS } from '@core/constants';
import { Subject } from 'rxjs';
import { StorageService } from '../shared/storage.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';

@Injectable({ providedIn: 'root' })
export class StreakStateService {
  private readonly storage = inject(StorageService) as StorageService<StreakState>;
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<StreakState | null>(null);
  readonly state = this._state.asReadonly();
  readonly currentStreak = computed(() => this._state()?.currentStreak ?? 0);
  readonly longestStreak = computed(() => this._state()?.longestStreak ?? 0);
  readonly milestonesReached = computed(() => this._state()?.milestonesReached ?? []);
  readonly graceTokens = computed(() => {
    const state = this._state();
    return state ? (state.graceTokens ?? GRACE_TOKENS_INITIAL) : GRACE_TOKENS_INITIAL;
  });

  readonly transition$ = new Subject<StreakTransition>();

  constructor() {
    const history = inject(HistoryEventManagerService);
    history.mutation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.onMutationLogged());
  }

  async bootstrap(): Promise<void> {
    const loaded = await this.loadDoc();
    this._state.set(loaded);
    const today = this.todayLocalISO();
    const evaluation = evaluateStreak(loaded, today, false);
    if (evaluation.next && evaluation.next !== loaded) {
      const persisted = await this.persistDoc(evaluation.next);
      this._state.set(persisted);
    }
    for (const t of evaluation.transitions) this.transition$.next(t);
  }

  async onMutationLogged(): Promise<void> {
    const current = this._state();
    const today = this.todayLocalISO();
    const evaluation = evaluateStreak(current, today, true);
    if (evaluation.next && evaluation.next !== current) {
      const persisted = await this.persistDoc(evaluation.next);
      this._state.set(persisted);
    }
    for (const t of evaluation.transitions) this.transition$.next(t);
  }

  private todayLocalISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async loadDoc(): Promise<StreakState | null> {
    return this.storage.get(STORAGE_KEYS.STREAK_DOC_ID) as Promise<StreakState | null>;
  }

  private async persistDoc(doc: StreakState): Promise<StreakState> {
    return this.storage.save(doc) as Promise<StreakState>;
  }
}
