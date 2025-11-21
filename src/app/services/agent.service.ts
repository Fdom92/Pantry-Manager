import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly baseUrl = 'http://localhost:3000/agent';

  constructor(private readonly http: HttpClient) {}

  sendMessage(message: string) {
    return this.http.post(`${this.baseUrl}/process`, { message });
  }
}
