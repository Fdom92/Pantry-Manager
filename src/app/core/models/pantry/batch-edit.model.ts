export type BatchEditFilter = 'noFoodType' | 'noCategory';
export type BatchEditAction = 'setFoodType' | 'setCategory';

export interface BatchEditFlowConfig {
  filter: BatchEditFilter;
  action?: BatchEditAction;
}
