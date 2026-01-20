import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LlmClientError, LlmCompletionRequest, LlmCompletionResponse } from '@core/models';
import { firstValueFrom, timeout as rxTimeout } from 'rxjs';
import { environment } from 'src/environments/environment';
import { RevenuecatService } from '../upgrade/revenuecat.service';

/**
 * Thin gateway around the backend LLM endpoint so agents don't need to know about HTTP.
 */
@Injectable({
  providedIn: 'root',
})
export class LlmClientService {
  private readonly http = inject(HttpClient);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly endpoint = environment.agentApiUrl ?? '';
  private readonly requestTimeoutMs = 30000;
  private readonly transientStatusCodes = new Set([502, 503, 504]);
  private readonly maxTransientRetries = 2;
  private readonly transientRetryDelayMs = 600;

  async complete(payload: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.endpoint) {
      throw new Error('[LlmClientService] agentApiUrl is empty');
    }

    let attempt = 0;
    let lastError: LlmClientError | null = null;

    while (attempt <= this.maxTransientRetries) {
      try {
        const response = await firstValueFrom(
          this.http
            .post<{ content?: string; message?: { content?: string } }>(
              this.endpoint,
              {
                system: payload.system,
                messages: payload.messages,
                tools: [],
              },
              {
                headers: this.buildProHeaders(),
              }
            )
            .pipe(rxTimeout(this.requestTimeoutMs))
        );

        const content = response?.content ?? response?.message?.content ?? '';
        return { content };
      } catch (err) {
        const normalized = this.normalizeHttpError(err);
        lastError = normalized;
        if (this.shouldRetry(normalized, attempt)) {
          attempt += 1;
          console.warn('[LlmClientService] complete retrying', {
            attempt,
            status: normalized.status,
          });
          await this.delay(this.transientRetryDelayMs * attempt);
          continue;
        }
        throw normalized;
      }
    }

    throw lastError ?? this.buildDefaultError();
  }

  private buildProHeaders(): Record<string, string> | undefined {
    const userId = this.revenuecat.getUserId();
    if (!userId) {
      return undefined;
    }
    return {
      'x-user-id': userId,
    };
  }

  private shouldRetry(error: LlmClientError, attempt: number): boolean {
    if (attempt >= this.maxTransientRetries) {
      return false;
    }
    if (error.timeout) {
      return true;
    }
    if (typeof error.status === 'number' && this.transientStatusCodes.has(error.status)) {
      return true;
    }
    return false;
  }

  private normalizeHttpError(err: unknown): LlmClientError {
    const defaultMessage = 'Agent request failed';
    let normalized: LlmClientError;
    if (err instanceof Error) {
      normalized = err as LlmClientError;
      if (!normalized.message) {
        normalized.message = defaultMessage;
      }
    } else if (typeof err === 'string') {
      normalized = new Error(err) as LlmClientError;
    } else {
      normalized = new Error(defaultMessage) as LlmClientError;
    }

    const status =
      (err as HttpErrorResponse)?.status ??
      (err as { status?: number })?.status ??
      (err as { statusCode?: number })?.statusCode ??
      (err as { response?: { status?: number } })?.response?.status ??
      null;
    if (typeof status === 'number') {
      normalized.status = status;
    }
    if ((err as any)?.name === 'TimeoutError') {
      normalized.timeout = true;
    }
    return normalized;
  }

  private buildDefaultError(): LlmClientError {
    return new Error('Agent request failed') as LlmClientError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
