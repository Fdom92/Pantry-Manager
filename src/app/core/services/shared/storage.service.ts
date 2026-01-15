import { Injectable } from '@angular/core';
import { APP_DB_NAME } from '@core/constants';
import { BaseDoc } from '@core/models/shared';
import { createDocumentId } from '@core/utils';
import PouchDB from 'pouchdb-browser';
import PouchFind from 'pouchdb-find';

PouchDB.plugin(PouchFind);

type PouchResponse = PouchDB.Core.Response;

@Injectable({
  providedIn: 'root',
})
export class StorageService<T extends BaseDoc> {
  // Data
  private db: PouchDB.Database<T>;
  private readonly LIST_CHUNK_SIZE = 250;
  // Getter
  protected get database(): PouchDB.Database<T> {
    return this.db;
  }

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
    const withId = this.ensureDocumentId(doc);
    const docId = withId._id;
    const now = new Date().toISOString();

    try {
      const existing = await this.db.get(docId).catch((err: any) => {
        if (err?.status === 404) return undefined;
        throw err;
      });

      if (!existing && withId._rev) {
        console.warn(`[StorageService] Dropping unexpected _rev for new doc`, { _id: docId, _rev: withId._rev });
      }

      if (existing && withId._rev && withId._rev !== existing._rev) {
        console.warn(
          `[StorageService] _rev mismatch detected before upsert`,
          { _id: docId, incomingRev: withId._rev, storedRev: existing._rev }
        );
      }

      const newDoc: T = {
        ...withId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        _rev: existing?._rev,
      } as T;

      const res: PouchResponse = await this.db.put(newDoc as any);
      return { ...newDoc, _rev: res.rev } as T;
    } catch (err) {
      if ((err as any)?.status === 409) {
        console.warn('[StorageService] Conflict while saving document', { _id: docId, error: err });
      }
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

    await this.ensureIndex(['type']);
    const docs: T[] = [];
    let skip = 0;

    // Stream the entire result set in deterministic batches so callers never hit an artificial cap.
    while (true) {
      const res = await this.db.find({
        selector: { type },
        skip,
        limit: this.LIST_CHUNK_SIZE,
      });
      docs.push(...res.docs);
      if (res.docs.length < this.LIST_CHUNK_SIZE) {
        break;
      }
      skip += res.docs.length;
    }

    return docs;
  }

  /**
   * listByType - helper for specific services.
   */
  protected async listByType(type: string): Promise<T[]> {
    return this.all(type);
  }

  /**
   * countByType - returns the number of documents for the requested type without fetching full docs.
   */
  protected async countByType(type: string): Promise<number> {
    await this.ensureIndex(['type']);
    let total = 0;
    let skip = 0;

    while (true) {
      const res = await this.db.find({
        selector: { type },
        fields: ['_id'],
        skip,
        limit: this.LIST_CHUNK_SIZE,
      });
      const batch = res.docs.length;
      total += batch;
      if (batch < this.LIST_CHUNK_SIZE) {
        break;
      }
      skip += batch;
    }

    return total;
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
    const prepared = docs.map(doc => {
      const withId = this.ensureDocumentId(doc);
      return {
        ...withId,
        createdAt: withId.createdAt ?? now,
        updatedAt: now,
        _rev: withId._rev,
      } as T;
    });

    const duplicateIds = this.findDuplicateIds(prepared);
    if (duplicateIds.length) {
      console.warn('[StorageService] bulkSave detected duplicate IDs', duplicateIds);
    }

    const res = await this.db.bulkDocs(prepared as any);
    return prepared.map((doc, index) => {
      const outcome = res[index] as PouchDB.Core.Response & { error?: string };
      if (outcome?.error) {
        console.error('[StorageService] bulkSave error for document', { _id: doc._id, error: outcome });
        return doc;
      }
      return { ...doc, _rev: outcome.rev } as T;
    });
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

  private ensureDocumentId(doc: T): T {
    const rawId = (doc?._id ?? '').trim();
    if (rawId) {
      if (rawId !== doc._id) {
        return { ...doc, _id: rawId } as T;
      }
      return doc;
    }

    const typePrefix = ((doc as any)?.type ?? 'doc').toString().split(':')[0] || 'doc';
    const generatedId = createDocumentId(typePrefix);
    console.warn('[StorageService] Generated missing _id for document', { generatedId, type: (doc as any)?.type });
    return { ...doc, _id: generatedId } as T;
  }

  private findDuplicateIds(docs: T[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const doc of docs) {
      const id = doc._id;
      if (seen.has(id)) {
        duplicates.add(id);
      } else {
        seen.add(id);
      }
    }
    return Array.from(duplicates);
  }
}
