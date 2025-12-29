import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LlmCompletionRequest, LlmCompletionResponse } from '@core/models';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { RevenuecatService } from '../revenuecat.service';

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

  async complete(payload: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.endpoint) {
      throw new Error('[LlmClientService] agentApiUrl is empty');
    }

    const response = await firstValueFrom(
      this.http.post<{ content?: string; message?: { content?: string } }>(
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
    );

    const content = response?.content ?? response?.message?.content ?? '';
    return { content };
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
}
