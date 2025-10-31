import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb-browser';
import PouchFind from 'pouchdb-find';
import { BaseDoc } from '@core/models';
import { APP_DB_NAME } from '@core/constants/app.constants';

PouchDB.plugin(PouchFind);

type PouchResponse = PouchDB.Core.Response;

@Injectable({
  providedIn: 'root',
})
export class StorageService<T extends BaseDoc> {
  private db: PouchDB.Database<T>;

  constructor() {
    // auto_compaction reduces database size; tweak if needed
    this.db = new PouchDB<T>(APP_DB_NAME, { auto_compaction: true });
  }

  /**
   * save - public alias for upsert (create/update).
   * Updates when it exists; otherwise creates it.
   * Returns the document with the updated _rev.
   */
  async save(doc: T): Promise<T> {
    return this.upsert(doc);
  }

  /**
   * upsert - internal create or update with timestamps
   */
  async upsert(doc: T): Promise<T> {
    const now = new Date().toISOString();

    try {
      const existing = await this.db.get(doc._id).catch((err: any) => {
        if (err?.status === 404) return undefined;
        throw err;
      });

      const newDoc: T = {
        ...doc,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        _rev: existing?._rev,
      } as T;

      const res: PouchResponse = await this.db.put(newDoc as any);
      return { ...newDoc, _rev: res.rev } as T;
    } catch (err) {
      console.error('[StorageService] upsert error', err);
      throw err;
    }
  }

  /**
   * get - fetch by id (null when it does not exist).
   */
  async get(id: string): Promise<T | null> {
    try {
      return await this.db.get(id);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  /**
   * remove - delete by id (app-level soft deletes can wrap this).
   */
  async remove(id: string): Promise<boolean> {
    try {
      const doc = await this.db.get(id);
      await this.db.remove(doc);
      return true;
    } catch (err) {
      console.error('[StorageService] remove error', err);
      return false;
    }
  }

  /**
   * all - returns every document or filters by type.
   * If type is omitted, returns all docs (include_docs).
   */
  async all(type?: string): Promise<T[]> {
    if (!type) {
      const result = await this.db.allDocs<T>({ include_docs: true });
      return result.rows.map(r => r.doc!).filter(Boolean);
    }

    // Use find to search by type (ensure the index exists)
    await this.ensureIndex([ 'type' ]);
    const res = await this.db.find({ selector: { type } });
    return res.docs;
  }

  /**
   * listByType - helper for specific services.
   */
  protected async listByType(type: string): Promise<T[]> {
    return this.all(type);
  }

  /**
   * findByField - query by any indexed field.
   */
  async findByField<K extends keyof T>(field: K, value: T[K]): Promise<T[]> {
    try {
      await this.ensureIndex([ field as string ]);
      const result = await this.db.find({
        selector: { [field as string]: value },
      });
      return result.docs;
    } catch (err) {
      console.error('[StorageService] findByField error', err);
      return [];
    }
  }

  /**
   * ensureIndex - creates the index if it does not exist.
   */
  async ensureIndex(fields: string[]): Promise<void> {
    try {
      await this.db.createIndex({ index: { fields } });
    } catch (err) {
      // Some errors appear when the index already exists; log and ignore them
      console.warn('[StorageService] ensureIndex warning', err);
    }
  }

  /**
   * clearAll - wipe the database (handy during development).
   */
  async clearAll(): Promise<void> {
    await this.db.destroy();
    this.db = new PouchDB<T>(APP_DB_NAME, { auto_compaction: true });
  }

  /**
   * watchChanges - subscribe to live DB changes.
   */
  watchChanges(onChange: (doc: T) => void): PouchDB.Core.Changes<T> {
    const feed = this.db.changes<T>({
      since: 'now',
      live: true,
      include_docs: true,
    })
    .on('change', change => {
      if (change.doc) onChange(change.doc);
    })
    .on('error', err => {
      console.error('[StorageService] changes feed error', err);
    });

    return feed;
  }

  async bulkSave(docs: T[]): Promise<T[]> {
    const now = new Date().toISOString();
    const prepared = docs.map(doc => ({
      ...doc,
      createdAt: doc.createdAt ?? now,
      updatedAt: now,
    })) as T[];

    const res = await this.db.bulkDocs(prepared as any);
    return prepared.map((d, i) => ({ ...d, _rev: res[i].rev } as T));
  }

  async count(type?: string): Promise<number> {
    const docs = await this.all(type);
    return docs.length;
  }

  async search(text: string, fields: (keyof T)[]): Promise<T[]> {
    if (!text.trim()) return [];
    const docs = await this.all();
    const lower = text.toLowerCase();
    return docs.filter(doc =>
      fields.some(f => String(doc[f] ?? '').toLowerCase().includes(lower))
    );
  }

  async exists(id: string): Promise<boolean> {
    const doc = await this.get(id);
    return !!doc;
  }
}
