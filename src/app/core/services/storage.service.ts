import { Injectable } from '@angular/core';
import { createLocalDB } from '@core/database/pouchdb.config';
import { BaseDoc } from '@core/models/base-doc.model';

@Injectable({ providedIn: 'root' })
export class StorageService<T extends BaseDoc> {
  private db: PouchDB.Database<T>;

  constructor() {
    this.db = createLocalDB('pantry-db');
  }

  async save(doc: T) {
    const existing = await this.db.get(doc._id).catch(() => null);
    if (existing) {
      doc._rev = existing._rev;
      doc.createdAt = existing.createdAt ?? doc.createdAt ?? Date.now();
    } else {
      doc.createdAt = doc.createdAt ?? Date.now();
    }
    doc.updatedAt = Date.now();
    return this.db.put(doc);
  }

  async get(id: string) {
    return this.db.get(id);
  }

  async remove(id: string) {
    const doc = await this.db.get(id);
    return this.db.remove(doc);
  }

  async all(type?: string) {
    if (!type) {
      const result = await this.db.allDocs({ include_docs: true });
      return result.rows.map(r => r.doc!);
    }
    const result = await this.db.find({ selector: { type } });
    return result.docs;
  }
}
