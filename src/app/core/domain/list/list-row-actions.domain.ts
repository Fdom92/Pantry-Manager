/**
 * The shopping list has one interaction rule: a row's button is its primary
 * action (buy), tapping the row opens a menu with the rest. This table is the
 * only place that decides what that menu holds. It replaced three swipe
 * gestures in two directions and a hidden section with no way back.
 */
export type ListRowKind = 'auto' | 'manual' | 'bought' | 'hidden';
export type ListRowAction = 'hide' | 'unbasic' | 'remove' | 'restore' | 'unhide';

export interface ListRowActionSpec {
  action: ListRowAction;
  destructive: boolean;
}

const ROW_ACTIONS: Record<ListRowKind, readonly ListRowActionSpec[]> = {
  auto: [
    { action: 'hide', destructive: false },
    { action: 'unbasic', destructive: false },
  ],
  manual: [{ action: 'remove', destructive: true }],
  bought: [{ action: 'restore', destructive: false }],
  hidden: [
    { action: 'unhide', destructive: false },
    { action: 'unbasic', destructive: false },
  ],
};

export function listRowActions(kind: ListRowKind): readonly ListRowActionSpec[] {
  return ROW_ACTIONS[kind];
}
