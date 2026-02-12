import { AgentEntryContext, type QuickPrompt } from '@core/models/agent';

export const USER_PROMPT_MAX_LENGTH = 500;
export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  {
    id: 'cook-today',
    labelKey: 'agent.quickStart.today',
    context: AgentEntryContext.PLANNING,
  },
  {
    id: 'quick-ideas',
    labelKey: 'agent.quickStart.quickIdeas',
    context: AgentEntryContext.RECIPES,
  },
  {
    id: 'weekly-plan',
    labelKey: 'agent.quickStart.weeklyPlan',
    context: AgentEntryContext.PLANNING,
  },
  {
    id: 'use-expiring',
    labelKey: 'agent.quickStart.useExpiring',
    context: AgentEntryContext.INSIGHTS,
  },
  {
    id: 'decide-for-me',
    labelKey: 'agent.quickStart.decideForMe',
    context: AgentEntryContext.PLANNING,
  },
  {
    id: 'custom-question',
    labelKey: 'agent.quickStart.customPrompt',
    behavior: 'composer',
  },
] as const;
