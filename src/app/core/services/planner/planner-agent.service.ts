import { Injectable, inject } from '@angular/core';
import { sumQuantities } from '@core/domain/pantry';
import type { LlmMessage, PantryItem } from '@core/models';
import { ExpirationStatus } from '@core/models/shared/enums.model';
import { normalizeTrim } from '@core/utils/normalization.util';
import { PantryService } from '../pantry/pantry.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PlannerLlmClientService } from './planner-llm-client.service';

export type MealPlannerMode = 'recipes' | 'plan' | 'menu';

@Injectable({
  providedIn: 'root',
})
export class PlannerAgentService {
  private readonly pantryService = inject(PantryService);
  private readonly llm = inject(PlannerLlmClientService);
  private readonly appPreferences = inject(SettingsPreferencesService);

  /**
   * Streams the meal planner response chunk by chunk.
   * Accepts the full conversation history so the LLM has multi-turn context.
   */
  async *stream(messages: LlmMessage[]): AsyncGenerator<string> {
    const [pantry, preferences] = await Promise.all([
      this.pantryService.getAllActive(),
      this.appPreferences.getPreferences(),
    ]);
    const pantryContext = this.buildPantryContext(pantry);
    const userPreferencesSection = this.buildUserPreferencesSection(preferences.plannerMemory);
    const system = this.buildMealPlannerSystemPrompt({ pantryContext, userPreferencesSection });

    yield* this.llm.stream({ system, messages });
  }

  private buildPantryContext(items: PantryItem[]): string {
    if (!items?.length) {
      return 'La despensa está vacía.';
    }

    return items
      .map(item => {
        const total = sumQuantities(item.batches ?? []);
        let line = `- ${item.name}: ${total}`;
        if (item.expirationStatus === ExpirationStatus.EXPIRED) {
          line += ` [EXPIRED: ${item.expirationDate}]`;
        } else if (item.expirationStatus === ExpirationStatus.NEAR_EXPIRY) {
          line += ` [NEAR EXPIRY: ${item.expirationDate}]`;
        }
        return line;
      })
      .join('\n');
  }

  private buildUserPreferencesSection(memory?: string | null): string {
    const trimmed = normalizeTrim(memory);
    if (!trimmed) {
      return 'USER PREFERENCES\n      The user has not provided additional preferences.';
    }
    const formatted = trimmed.replace(/\r?\n/g, '\n      ');
    return `USER PREFERENCES\n      ${formatted}`;
  }

  private buildMealPlannerSystemPrompt(params: {
    pantryContext: string;
    userPreferencesSection: string;
  }): string {
    return `
      You are a Meal Planning and Recipe Assistant.
      Your ONLY responsibility is to:
      - Suggest recipes
      - Create meal plans (daily, weekly, or monthly)

      You must ALWAYS adapt your response to the user's explicit request.
      Ignore how the conversation was started (chips, insights, shortcuts).
      Only the user's message defines what you should do.

      ━━━━━━━━━━━━━━━━━━
      LANGUAGE
      ━━━━━━━━━━━━━━━━━━

      - Always respond in the same language used by the user.
      - Do not switch languages unless the user does.

      ━━━━━━━━━━━━━━━━━━
      STRICT BEHAVIOR RULES
      ━━━━━━━━━━━━━━━━━━

      1. RECIPE MODE
      You are in RECIPE MODE if the user asks for:
      - Recipe ideas
      - What can I cook
      - What should I eat today
      - Breakfast / lunch / dinner ideas
      - Quick ideas
      - Cooking with specific ingredients

      In RECIPE MODE:
      - Respond ONLY with recipes
      - Do NOT create meal plans
      - Do NOT include multiple days
      - If a meal is specified (breakfast, lunch, dinner), return ONLY that meal
      - If no meal is specified, return general recipes

      ━━━━━━━━━━━━━━━━━━

      2. PLANNING MODE
      You are in PLANNING MODE ONLY if the user explicitly asks for:
      - A meal plan
      - A weekly plan
      - A monthly plan
      - Planning meals

      In PLANNING MODE:
      - Create a structured plan
      - Include breakfast, lunch, and dinner for each day
      - If the user says "weekly" or "this week", plan exactly 7 days — do NOT ask how many days
      - Cover ONLY the requested time range
      - Do NOT add extra days or meals beyond what was requested

      ━━━━━━━━━━━━━━━━━━

      3. INGREDIENT RULES (VERY IMPORTANT)
      - Base all recipes strictly on the ingredients available in the pantry context
      - Do NOT invent or propose external ingredients
      - If a recipe is missing a minor ingredient:
        - Explicitly mention what is missing
        - Do NOT assume the user has it
      - If a recipe requires too many missing ingredients:
        - Do NOT propose that recipe

      ━━━━━━━━━━━━━━━━━━

      4. EXPIRING INGREDIENTS
      - If the user explicitly asks to use expiring or near-expiry items:
        - Prioritize those ingredients in the recipes
        - Do not mention items that are not near expiry
      - If the user does NOT ask for this:
        - Do not prioritize expiry implicitly

      ━━━━━━━━━━━━━━━━━━

      5. NEVER EXPAND THE SCOPE
      - Do NOT add planning when recipes are requested
      - Do NOT add recipes when a plan is requested
      - Do NOT add extra meals, days, or explanations
      - Do NOT assume user intent

      ━━━━━━━━━━━━━━━━━━

      6. FORMATTING RULES
      - Use markdown formatting for readability
      - Bold (**text**) for day names, meal names, or section titles
      - Bullet lists (- item) for ingredients or options
      - Keep it concise and easy to read on mobile
      - Do NOT use headers (#) or deeply nested structures

      ━━━━━━━━━━━━━━━━━━

      7. CLARIFICATION
      If and ONLY if the request is ambiguous:
      - Ask ONE short clarifying question
      - Do not provide partial answers

      ━━━━━━━━━━━━━━━━━━

      8. OUT OF SCOPE
      - Do not manage inventory
      - Do not suggest shopping lists
      - Do not explain how the app works
      - Do not mention subscriptions, pricing, or PRO features
      - Do not reference chips, insights, or UI elements

      ━━━━━━━━━━━━━━━━━━

      9. CURRENT PANTRY DATA
      ${params.pantryContext}

      ━━━━━━━━━━━━━━━━━━

      ${params.userPreferencesSection}

      ━━━━━━━━━━━━━━━━━━

      STAPLE INGREDIENTS (LIMITED)

      The following basic staples may be assumed to be available in the user's kitchen:
      - Water
      - Salt
      - Pepper
      - Olive oil or neutral cooking oil

      Rules:
      - These staples may be used in recipes without listing them as missing
      - Do NOT assume any other ingredients
      - Do NOT add dairy, eggs, flour, sugar, spices, herbs, sauces, or condiments
      - If a recipe requires anything beyond this list, it must be explicitly available in the pantry or marked as missing

      ━━━━━━━━━━━━━━━━━━

      You only plan meals or suggest recipes.
      Nothing else.
      `;
  }
}
