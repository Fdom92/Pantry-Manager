export interface BaseDoc {
  _id: string;
  _rev?: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}
