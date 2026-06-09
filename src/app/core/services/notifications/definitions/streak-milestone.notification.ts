import { NOTIFICATION_IDS } from '@core/constants';
import type { ScheduledNotificationInput } from '../notification.plugin';

export function buildStreakMilestoneNotification(
  streak: number,
  translate: (key: string, params?: Record<string, unknown>) => string,
): ScheduledNotificationInput {
  const fireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id: NOTIFICATION_IDS.STREAK_MILESTONE,
    title: translate('notifications.streakMilestone.title'),
    body: translate('notifications.streakMilestone.body', { streak }),
    scheduleAt: fireAt,
    extra: { kind: 'streak_milestone', streak },
  };
}
