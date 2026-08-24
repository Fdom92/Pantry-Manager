// No unit tests currently exercise NotificationSchedulerService's production
// paths (scheduleAll, cancelAll, scheduleProjectedNotifications,
// scheduleStreakMilestone, handleNotificationTap, evaluateWinnerNow). The one
// existing spec here covered the dev-only fireDefinitionInFiveSeconds method,
// which moved to DevNotificationsService — see
// src/app/core/services/dev/dev-notifications.service.spec.ts.
