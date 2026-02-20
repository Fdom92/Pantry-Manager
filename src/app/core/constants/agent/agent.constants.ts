import { AgentEntryContext, type QuickPrompt } from '@core/models/agent';

export const USER_PROMPT_MAX_LENGTH = 500;
export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  {
    id: 'cook-today',
    labelKey: 'agent.quickStart.today',
    promptKey: 'agent.quickStart.todayPrompt',
    context: AgentEntryContext.PLANNING,
  },
  {
    id: 'weekly-plan',
    labelKey: 'agent.quickStart.weeklyPlan',
    promptKey: 'agent.quickStart.weeklyPlanPrompt',
    context: AgentEntryContext.PLANNING,
  },
  {
    id: 'use-expiring',
    labelKey: 'agent.quickStart.useExpiring',
    promptKey: 'agent.quickStart.useExpiringPrompt',
    context: AgentEntryContext.INSIGHTS,
  },
  {
    id: 'surprise-me',
    labelKey: 'agent.quickStart.surpriseMe',
    promptKey: 'agent.quickStart.surpriseMePrompt',
    context: AgentEntryContext.RECIPES,
  },
  {
    id: 'custom-question',
    labelKey: 'agent.quickStart.customPrompt',
    behavior: 'composer',
  },
] as const;
