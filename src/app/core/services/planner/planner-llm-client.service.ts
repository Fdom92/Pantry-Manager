import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LlmClientError, LlmCompletionRequest } from '@core/models';
import { firstValueFrom, timeout as rxTimeout } from 'rxjs';
import { environment } from 'src/environments/environment';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

/**
 * Thin gateway around the backend LLM endpoint so agents don't need to know about HTTP.
 */
@Injectable({
  providedIn: 'root',
})
export class PlannerLlmClientService {
  private readonly http = inject(HttpClient);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.agentApiUrl ?? '';
  private readonly requestTimeoutMs = 20000; // 20s - before backend (18s) times out

  /**
   * Streams the LLM response as SSE chunks via native fetch + ReadableStream.
   * Yields text pieces as they arrive from the backend.
   */
  async *stream(payload: LlmCompletionRequest): AsyncGenerator<string> {
    if (!this.endpoint) {
      throw new Error('[PlannerLlmClientService] agentApiUrl is empty');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const userId = this.revenuecat.getUserId();
    if (userId) headers['x-user-id'] = userId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ system: payload.system, messages: payload.messages }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('COLD_START_TIMEOUT') as LlmClientError;
        timeoutErr.timeout = true;
        throw timeoutErr;
      }
      throw this.normalizeError(err);
    }

    if (!response.ok) {
      throw Object.assign(new Error('Agent request failed'), { status: response.status });
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          let parsed: any;
          try { parsed = JSON.parse(data); } catch { continue; }

          if (parsed.t) yield parsed.t;
          if (parsed.error) {
            throw Object.assign(
              new Error('Stream error'),
              { status: parsed.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 500 }
            );
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }

  /**
   * Preheat backend to avoid cold start on first user request.
   * Called silently when app opens (if user is PRO).
   */
  async preheatBackend(): Promise<void> {
    if (!this.endpoint) {
      return;
    }

    try {
      const healthUrl = this.endpoint.replace('/agent/process', '/health');
      await firstValueFrom(
        this.http.get(healthUrl).pipe(rxTimeout(5000))
      );
      console.info('[PlannerLlmClientService] Backend preheated successfully');
    } catch {
      console.debug('[PlannerLlmClientService] Backend preheat failed (expected on cold start)');
    }
  }

  private normalizeError(err: unknown): LlmClientError {
    const defaultMessage = 'Agent request failed';
    let normalized: LlmClientError;
    if (err instanceof Error) {
      normalized = err as LlmClientError;
      if (!normalized.message) normalized.message = defaultMessage;
    } else if (typeof err === 'string') {
      normalized = new Error(err) as LlmClientError;
    } else {
      normalized = new Error(defaultMessage) as LlmClientError;
    }
    return normalized;
  }
}
