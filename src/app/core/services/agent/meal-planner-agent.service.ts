import { Injectable, inject } from '@angular/core';
import { AgentEntryContext } from '@core/models/agent';
import { PantryItem } from '@core/models/inventory';
import { AgentConversationStore } from './agent-conversation.store';
import { LlmClientService } from './llm-client.service';
import { PantryService } from '../pantry.service';
import { LanguageService } from '../language.service';

export type MealPlannerMode = 'recipes' | 'plan' | 'menu';

@Injectable({
  providedIn: 'root',
})
export class MealPlannerAgentService {
  private readonly pantryService = inject(PantryService);
  private readonly llm = inject(LlmClientService);
  private readonly languageService = inject(LanguageService);
  private readonly conversationStore = inject(AgentConversationStore);

  async run(params: { mode: MealPlannerMode; days?: number }): Promise<string> {
    const pantry = await this.pantryService.getAll();
    const pantryContext = this.buildPantryContext(pantry);
    const locale = this.languageService.getCurrentLocale();
    const entryContext = this.conversationStore.getEntryContext();

    const system = [
      'Eres un asistente experto en planificación de comidas y recetas.',
      '',
      'Contexto del usuario:',
      pantryContext,
      '',
      'Reglas:',
      '- Usa PRIORITARIAMENTE los ingredientes disponibles',
      '- Evita proponer ingredientes externos',
      '- Si falta algo, indícalo claramente',
      '- Prioriza ingredientes que caduquen antes',
      '- No expliques reglas internas',
      '- Responde de forma clara y práctica',
      `- Idioma: ${locale}`,
    ].join('\n');

    const userPrompt = this.buildUserPrompt(params, entryContext);

    const response = await this.llm.complete({
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    return response.content;
  }

  private buildUserPrompt(params: { mode: MealPlannerMode; days?: number }, context: AgentEntryContext): string {
    let base: string;
    switch (params.mode) {
      case 'recipes':
        base = 'Propón 2-3 recetas usando solo la despensa disponible.';
        break;
      case 'plan':
        base = `Planifica comidas para ${params.days ?? 3} días.`;
        break;
      case 'menu':
        base = `Crea un menú ${params.days && params.days > 7 ? 'mensual' : 'semanal'} equilibrado.`;
        break;
      default:
        base = 'Propón ideas de comidas con la despensa disponible.';
        break;
    }
    const contextHint = this.describeEntryContext(context);
    return contextHint ? `${base} ${contextHint}` : base;
  }

  private describeEntryContext(context: AgentEntryContext): string {
    switch (context) {
      case AgentEntryContext.RECIPES:
        return 'Prioriza recetas rápidas y creativas.';
      case AgentEntryContext.INSIGHTS:
        return 'Usa primero los productos que caducan pronto o estan en riesgo.';
      case AgentEntryContext.INSIGHTS_RECIPES:
        return 'Ofrece sugerencias muy concretas basadas en un hallazgo reciente.';
      case AgentEntryContext.PLANNING:
      default:
        return '';
    }
  }

  private buildPantryContext(items: PantryItem[]): string {
    if (!items?.length) {
      return 'La despensa está vacía.';
    }

    return items
      .map(item => {
        const total = (item.locations ?? []).reduce((sum, loc) => {
          const batches = loc.batches ?? [];
          return (
            sum +
            batches.reduce((batchSum, batch) => batchSum + Number(batch.quantity ?? 0), 0)
          );
        }, 0);
        return `- ${item.name}: ${total}`;
      })
      .join('\n');
  }
}
