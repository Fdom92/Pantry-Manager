export interface BaseDoc {
  readonly _id: string;
  _rev?: string;
  readonly type: string;
  readonly createdAt: string;
  updatedAt: string;
}
