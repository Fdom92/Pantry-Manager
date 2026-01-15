import { BaseDoc } from '@core/models';
import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';

PouchDB.plugin(PouchDBFind);

export function createLocalDB<T extends BaseDoc>(name: string): PouchDB.Database<T> {
  return new PouchDB<T>(name, { auto_compaction: true });
}
