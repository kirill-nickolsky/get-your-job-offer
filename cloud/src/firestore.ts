import { Firestore } from '@google-cloud/firestore';
import { config } from './config';

type DocumentData = Record<string, unknown>;

export interface DocSnapshotLike {
  id: string;
  exists: boolean;
  data(): DocumentData | undefined;
}

export interface QuerySnapshotLike {
  docs: DocSnapshotLike[];
}

export interface DocRefLike {
  id: string;
  get(): Promise<DocSnapshotLike>;
  set(data: DocumentData, options?: { merge?: boolean }): Promise<void>;
}

export interface CollectionRefLike {
  doc(id: string): DocRefLike;
  where(field: string, op: '==', value: unknown): { get(): Promise<QuerySnapshotLike> };
  get(): Promise<QuerySnapshotLike>;
}

export interface DbLike {
  collection(name: string): CollectionRefLike;
  runTransaction<T>(fn: (tx: {
    get(ref: DocRefLike): Promise<DocSnapshotLike>;
    set(ref: DocRefLike, data: DocumentData, options?: { merge?: boolean }): void;
  }) => Promise<T>): Promise<T>;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function mergeDocuments(current: DocumentData, incoming: DocumentData): DocumentData {
  return Object.assign({}, current, incoming);
}

function toDocSnapshot(id: string, value: DocumentData | undefined): DocSnapshotLike {
  return {
    id: id,
    exists: value !== undefined,
    data: function() {
      return value === undefined ? undefined : cloneValue(value);
    }
  };
}

class MemoryDocRef implements DocRefLike {
  private collectionName: string;
  readonly id: string;
  private store: Map<string, Map<string, DocumentData>>;

  constructor(store: Map<string, Map<string, DocumentData>>, collectionName: string, id: string) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get(): Promise<DocSnapshotLike> {
    const collection = this.store.get(this.collectionName);
    const value = collection ? collection.get(this.id) : undefined;
    return toDocSnapshot(this.id, value);
  }

  async set(data: DocumentData, options?: { merge?: boolean }): Promise<void> {
    const collection = getOrCreateCollection(this.store, this.collectionName);
    const current = collection.get(this.id);
    const nextValue = options && options.merge && current
      ? mergeDocuments(current, cloneValue(data))
      : cloneValue(data);
    collection.set(this.id, nextValue);
  }
}

class MemoryCollectionRef implements CollectionRefLike {
  private store: Map<string, Map<string, DocumentData>>;
  private name: string;

  constructor(store: Map<string, Map<string, DocumentData>>, name: string) {
    this.store = store;
    this.name = name;
  }

  doc(id: string): DocRefLike {
    return new MemoryDocRef(this.store, this.name, id);
  }

  where(field: string, op: '==', value: unknown): { get(): Promise<QuerySnapshotLike> } {
    const self = this;
    return {
      get: async function(): Promise<QuerySnapshotLike> {
        if (op !== '==') {
          throw new Error('Only == is supported in memory backend');
        }
        const collection = self.store.get(self.name) || new Map<string, DocumentData>();
        const docs: DocSnapshotLike[] = [];
        collection.forEach(function(doc, id) {
          if (doc[field] === value) {
            docs.push(toDocSnapshot(id, doc));
          }
        });
        return { docs: docs };
      }
    };
  }

  async get(): Promise<QuerySnapshotLike> {
    const collection = this.store.get(this.name) || new Map<string, DocumentData>();
    const docs: DocSnapshotLike[] = [];
    collection.forEach(function(doc, id) {
      docs.push(toDocSnapshot(id, doc));
    });
    return { docs: docs };
  }
}

class MemoryDb implements DbLike {
  private store: Map<string, Map<string, DocumentData>> = new Map();

  collection(name: string): CollectionRefLike {
    return new MemoryCollectionRef(this.store, name);
  }

  async runTransaction<T>(fn: (tx: {
    get(ref: DocRefLike): Promise<DocSnapshotLike>;
    set(ref: DocRefLike, data: DocumentData, options?: { merge?: boolean }): void;
  }) => Promise<T>): Promise<T> {
    const operations: Array<Promise<void>> = [];
    const result = await fn({
      get: async function(ref: DocRefLike) {
        return ref.get();
      },
      set: function(ref: DocRefLike, data: DocumentData, options?: { merge?: boolean }) {
        operations.push(ref.set(data, options));
      }
    });
    await Promise.all(operations);
    return result;
  }
}

class FirestoreDocRef implements DocRefLike {
  readonly id: string;
  private ref: FirebaseFirestore.DocumentReference;

  constructor(ref: FirebaseFirestore.DocumentReference) {
    this.ref = ref;
    this.id = ref.id;
  }

  async get(): Promise<DocSnapshotLike> {
    const snapshot = await this.ref.get();
    return {
      id: snapshot.id,
      exists: snapshot.exists,
      data: function() {
        return snapshot.data() as DocumentData | undefined;
      }
    };
  }

  async set(data: DocumentData, options?: { merge?: boolean }): Promise<void> {
    if (options) {
      await this.ref.set(data, options as FirebaseFirestore.SetOptions);
      return;
    }
    await this.ref.set(data);
  }

  unwrap(): FirebaseFirestore.DocumentReference {
    return this.ref;
  }
}

class FirestoreCollectionRef implements CollectionRefLike {
  private ref: FirebaseFirestore.CollectionReference;

  constructor(ref: FirebaseFirestore.CollectionReference) {
    this.ref = ref;
  }

  doc(id: string): DocRefLike {
    return new FirestoreDocRef(this.ref.doc(id));
  }

  where(field: string, op: '==', value: unknown): { get(): Promise<QuerySnapshotLike> } {
    const query = this.ref.where(field, op, value);
    return {
      get: async function(): Promise<QuerySnapshotLike> {
        const snapshot = await query.get();
        return {
          docs: snapshot.docs.map(function(doc) {
            return {
              id: doc.id,
              exists: doc.exists,
              data: function() {
                return doc.data() as DocumentData | undefined;
              }
            };
          })
        };
      }
    };
  }

  async get(): Promise<QuerySnapshotLike> {
    const snapshot = await this.ref.get();
    return {
      docs: snapshot.docs.map(function(doc) {
        return {
          id: doc.id,
          exists: doc.exists,
          data: function() {
            return doc.data() as DocumentData | undefined;
          }
        };
      })
    };
  }
}

class FirestoreDbAdapter implements DbLike {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  collection(name: string): CollectionRefLike {
    return new FirestoreCollectionRef(this.db.collection(name));
  }

  async runTransaction<T>(fn: (tx: {
    get(ref: DocRefLike): Promise<DocSnapshotLike>;
    set(ref: DocRefLike, data: DocumentData, options?: { merge?: boolean }): void;
  }) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async function(transaction) {
      return fn({
        get: async function(ref: DocRefLike) {
          return ref.get();
        },
        set: function(ref: DocRefLike, data: DocumentData, options?: { merge?: boolean }) {
          const firestoreRef = (ref as FirestoreDocRef).unwrap();
          if (options) {
            transaction.set(firestoreRef, data, options as FirebaseFirestore.SetOptions);
            return;
          }
          transaction.set(firestoreRef, data);
        }
      });
    });
  }
}

function getOrCreateCollection(
  store: Map<string, Map<string, DocumentData>>,
  name: string
): Map<string, DocumentData> {
  const existing = store.get(name);
  if (existing) {
    return existing;
  }
  const created = new Map<string, DocumentData>();
  store.set(name, created);
  return created;
}

let db: DbLike = config.dataBackend === 'memory'
  ? new MemoryDb()
  : new FirestoreDbAdapter(new Firestore());

export function getDb(): DbLike {
  return db;
}

export function resetMemoryDb(): void {
  if (config.dataBackend === 'memory') {
    db = new MemoryDb();
  }
}

export function sourceConfigsCollection(): CollectionRefLike {
  return db.collection('source_configs');
}

export function scrapeRunsCollection(): CollectionRefLike {
  return db.collection('scrape_runs');
}

export function scrapeCommandsCollection(): CollectionRefLike {
  return db.collection('scrape_commands');
}

export function jobsCollection(): CollectionRefLike {
  return db.collection('jobs');
}

export function rateTasksCollection(): CollectionRefLike {
  return db.collection('rate_tasks');
}

export function notificationsCollection(): CollectionRefLike {
  return db.collection('notifications');
}

export function jobEventsCollection(): CollectionRefLike {
  return db.collection('job_events');
}

export function botUsersCollection(): CollectionRefLike {
  return db.collection('bot_users');
}

export function applyActionsCollection(): CollectionRefLike {
  return db.collection('apply_actions');
}

export function dailyStatsCacheCollection(): CollectionRefLike {
  return db.collection('daily_stats_cache');
}

export function runtimeCountersCollection(): CollectionRefLike {
  return db.collection('runtime_counters');
}
