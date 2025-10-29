export interface BaseDoc {
  _id: string;
  _rev?: string;
  type: string;
  createdAt?: number;
  updatedAt?: number;
}
