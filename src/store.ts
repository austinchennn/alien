import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { now, type EventRecord } from "./domain.js";
export class Store {
  db: DatabaseSync;
  bus = new EventEmitter();
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dir, "alien.sqlite"));
    try {
      chmodSync(join(dir, "alien.sqlite"), 0o600);
    } catch {}
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,task TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_task ON events(task,seq);`);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT payload FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? (JSON.parse(String(row.payload)) as T) : undefined;
  }
  list<T>(kind: string): T[] {
    return this.db
      .prepare("SELECT payload FROM records WHERE kind=? ORDER BY updated DESC")
      .all(kind)
      .map((r) => JSON.parse(String(r.payload)) as T);
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated",
      )
      .run(kind, id, JSON.stringify(value), now());
  }
  remove(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(taskId: string, type: string, data: unknown): EventRecord {
    const createdAt = now();
    const result = this.db
      .prepare("INSERT INTO events(task,type,payload,created) VALUES(?,?,?,?)")
      .run(taskId, type, JSON.stringify(data), createdAt);
    const event = {
      seq: Number(result.lastInsertRowid),
      taskId,
      type,
      data,
      createdAt,
    };
    this.bus.emit("event", event);
    return event;
  }
  events(taskId: string, after = 0): EventRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM events WHERE task=? AND seq>? ORDER BY seq LIMIT 2000",
      )
      .all(taskId, after)
      .map((r) => ({
        seq: Number(r.seq),
        taskId: String(r.task),
        type: String(r.type),
        data: JSON.parse(String(r.payload)),
        createdAt: String(r.created),
      }));
  }
  close() {
    this.db.close();
  }
}
