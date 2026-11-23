/**
 * Persistent memory: structured facts + simple key-value + conversation summaries.
 * Vector store can be swapped for LanceDB / Chroma later; SQLite is the durable base.
 */
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import path from "node:path";
import fs from "node:fs";
import { MemoryFact } from "../types.js";

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const p = dbPath || process.env.MEMORY_DB_PATH || "./data/memory.sqlite";
    fs.mkdirSync(path.dirname(p), { recursive: true });
    this.db = new Database(p);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);

      CREATE TABLE IF NOT EXISTS blackboard (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        title TEXT,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        agent_id TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    `);
  }

  upsertFact(key: string, value: string, source: string, confidence = 1.0): MemoryFact {
    const now = Date.now();
    const existing = this.db.prepare("SELECT id FROM facts WHERE key = ?").get(key) as
      | { id: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          "UPDATE facts SET value = ?, source = ?, confidence = ?, updated_at = ? WHERE id = ?"
        )
        .run(value, source, confidence, now, existing.id);
      return {
        id: existing.id,
        key,
        value,
        source,
        confidence,
        createdAt: now,
        updatedAt: now,
      };
    }

    const id = uuid();
    this.db
      .prepare(
        "INSERT INTO facts (id, key, value, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, key, value, source, confidence, now, now);
    return { id, key, value, source, confidence, createdAt: now, updatedAt: now };
  }

  getFact(key: string): MemoryFact | null {
    const row = this.db.prepare("SELECT * FROM facts WHERE key = ?").get(key) as any;
    if (!row) return null;
    return {
      id: row.id,
      key: row.key,
      value: row.value,
      source: row.source,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  searchFacts(query: string, limit = 20): MemoryFact[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM facts WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC LIMIT ?"
      )
      .all(`%${query}%`, `%${query}%`, limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      source: row.source,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  listFacts(limit = 100): MemoryFact[] {
    const rows = this.db
      .prepare("SELECT * FROM facts ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      source: row.source,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  setBlackboard(key: string, value: unknown, updatedBy: string) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO blackboard (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), updatedBy, now);
  }

  getBlackboard(key: string): unknown | null {
    const row = this.db.prepare("SELECT value FROM blackboard WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  getAllBlackboard(): Record<string, unknown> {
    const rows = this.db.prepare("SELECT key, value FROM blackboard").all() as {
      key: string;
      value: string;
    }[];
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        out[r.key] = r.value;
      }
    }
    return out;
  }

  close() {
    this.db.close();
  }
}

export const memory = new MemoryStore();
