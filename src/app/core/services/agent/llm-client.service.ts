import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LlmCompletionRequest, LlmCompletionResponse } from '@core/models';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

/**
 * Thin gateway around the backend LLM endpoint so agents don't need to know about HTTP.
 */
@Injectable({
  providedIn: 'root',
})
export class LlmClientService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = environment.agentApiUrl ?? '';

  async complete(payload: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.endpoint) {
      throw new Error('[LlmClientService] agentApiUrl is empty');
    }

    const response = await firstValueFrom(
      this.http.post<{ content?: string; message?: { content?: string } }>(this.endpoint, {
        system: payload.system,
        messages: payload.messages,
        tools: [],
      })
    );

    const content = response?.content ?? response?.message?.content ?? '';
    return { content };
  }
}
