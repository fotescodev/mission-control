import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schema } from './schema';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'mission-control.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const isNewDb = !fs.existsSync(DB_PATH);

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);

    if (isNewDb) {
      // Seed default workspace
      db.prepare(
        `INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon) VALUES (?, ?, ?, ?, ?)`
      ).run('default', 'Default Workspace', 'default', 'Default workspace', '🏠');

      console.log('[DB] New database created at:', DB_PATH);
    }

    // Migrations for existing databases
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('dispatch_mode')) {
      db.exec('ALTER TABLE tasks ADD COLUMN dispatch_mode TEXT DEFAULT NULL');
      db.exec('ALTER TABLE tasks ADD COLUMN dispatch_metadata TEXT DEFAULT NULL');
      console.log('[DB] Migrated: added dispatch_mode, dispatch_metadata to tasks');
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}
