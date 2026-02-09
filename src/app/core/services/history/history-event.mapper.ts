import type { PantryEvent } from '@core/models/events';

export type HistoryEventKind = 'added' | 'consumed' | 'expired' | 'edited' | 'deleted' | 'imported';

export type HistoryEventMeta = {
  kind: HistoryEventKind;
  icon: string;
  subtitleKey: string;
  showQuantity: boolean;
  signedQuantity: boolean;
};

export type HistoryFilterKey = 'all' | 'added' | 'consumed' | 'edited' | 'expired' | 'deleted' | 'imported';

export type HistoryFilterDefinition = {
  key: HistoryFilterKey;
  labelKey: string;
  icon: string;
  colorClass: string;
  eventType?: PantryEvent['eventType'];
};

export const HISTORY_FILTER_DEFINITIONS: HistoryFilterDefinition[] = [
  { key: 'all', labelKey: 'history.filters.all', icon: 'layers-outline', colorClass: 'chip--all' },
  { key: 'added', labelKey: 'history.filters.added', icon: 'add-circle-outline', colorClass: 'chip--added', eventType: 'ADD' },
  { key: 'consumed', labelKey: 'history.filters.consumed', icon: 'remove-circle-outline', colorClass: 'chip--consumed', eventType: 'CONSUME' },
  { key: 'edited', labelKey: 'history.filters.edited', icon: 'create-outline', colorClass: 'chip--edited', eventType: 'EDIT' },
  { key: 'expired', labelKey: 'history.filters.expired', icon: 'alert-circle-outline', colorClass: 'chip--expired', eventType: 'EXPIRE' },
  { key: 'deleted', labelKey: 'history.filters.deleted', icon: 'trash-outline', colorClass: 'chip--deleted', eventType: 'DELETE' },
  { key: 'imported', labelKey: 'history.filters.imported', icon: 'cloud-upload-outline', colorClass: 'chip--imported', eventType: 'IMPORT' },
];

const EVENT_META_BY_TYPE: Record<PantryEvent['eventType'], HistoryEventMeta> = {
  ADD: {
    kind: 'added',
    icon: 'add-circle-outline',
    subtitleKey: 'history.eventTypes.added',
    showQuantity: true,
    signedQuantity: true,
  },
  CONSUME: {
    kind: 'consumed',
    icon: 'remove-circle-outline',
    subtitleKey: 'history.eventTypes.consumed',
    showQuantity: true,
    signedQuantity: true,
  },
  EDIT: {
    kind: 'edited',
    icon: 'create-outline',
    subtitleKey: 'history.event.editedTitle',
    showQuantity: false,
    signedQuantity: false,
  },
  EXPIRE: {
    kind: 'expired',
    icon: 'alert-circle-outline',
    subtitleKey: 'history.eventTypes.expired',
    showQuantity: true,
    signedQuantity: false,
  },
  DELETE: {
    kind: 'deleted',
    icon: 'trash-outline',
    subtitleKey: 'history.eventTypes.deleted',
    showQuantity: true,
    signedQuantity: true,
  },
  IMPORT: {
    kind: 'imported',
    icon: 'cloud-upload-outline',
    subtitleKey: 'history.eventTypes.imported',
    showQuantity: true,
    signedQuantity: false,
  },
};

export function getHistoryEventMeta(event: PantryEvent): HistoryEventMeta {
  return EVENT_META_BY_TYPE[event.eventType] ?? EVENT_META_BY_TYPE.EDIT;
}
