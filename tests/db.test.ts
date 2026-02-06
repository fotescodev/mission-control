import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, closeDb, queryAll, queryOne, run, transaction } from '@/lib/db';

describe('database layer', () => {
  beforeEach(() => {
    // Close and reopen for a fresh in-memory database
    closeDb();
  });

  describe('getDb', () => {
    it('creates database with schema', () => {
      const db = getDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const names = tables.map(t => t.name);
      expect(names).toContain('workspaces');
      expect(names).toContain('agents');
      expect(names).toContain('tasks');
      expect(names).toContain('events');
      expect(names).toContain('conversations');
      expect(names).toContain('messages');
    });

    it('seeds default workspace on first init', () => {
      const ws = queryOne<{ id: string; name: string }>(
        'SELECT id, name FROM workspaces WHERE id = ?', ['default']
      );
      expect(ws).toBeDefined();
      expect(ws!.id).toBe('default');
      expect(ws!.name).toBe('Default Workspace');
    });

    it('sets journal mode (WAL on disk, memory for in-memory)', () => {
      const db = getDb();
      const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      // In-memory databases use 'memory' journal mode; on-disk uses 'wal'
      expect(['wal', 'memory']).toContain(result.journal_mode);
    });

    it('enables foreign keys', () => {
      const db = getDb();
      const result = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);
    });

    it('includes dispatch columns in tasks table', () => {
      const db = getDb();
      const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      const colNames = cols.map(c => c.name);
      expect(colNames).toContain('dispatch_mode');
      expect(colNames).toContain('dispatch_metadata');
    });
  });

  describe('queryAll', () => {
    it('returns all matching rows', () => {
      run(
        `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
      );
      run(
        `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a2', 'Agent2', 'role2', '🧠', 'standby', 'default', '2024-01-01', '2024-01-01']
      );

      const agents = queryAll<{ id: string; name: string }>('SELECT id, name FROM agents ORDER BY id');
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('Agent1');
      expect(agents[1].name).toBe('Agent2');
    });

    it('returns empty array when no matches', () => {
      const result = queryAll('SELECT * FROM agents WHERE id = ?', ['nonexistent']);
      expect(result).toEqual([]);
    });
  });

  describe('queryOne', () => {
    it('returns single matching row', () => {
      run(
        `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
      );

      const agent = queryOne<{ id: string; name: string }>('SELECT * FROM agents WHERE id = ?', ['a1']);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Agent1');
    });

    it('returns undefined when no match', () => {
      const result = queryOne('SELECT * FROM agents WHERE id = ?', ['nonexistent']);
      expect(result).toBeUndefined();
    });
  });

  describe('run', () => {
    it('inserts rows and returns changes count', () => {
      const result = run(
        `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
      );
      expect(result.changes).toBe(1);
    });

    it('updates rows and returns changes count', () => {
      run(
        `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
      );

      const result = run('UPDATE agents SET name = ? WHERE id = ?', ['Updated', 'a1']);
      expect(result.changes).toBe(1);

      const agent = queryOne<{ name: string }>('SELECT name FROM agents WHERE id = ?', ['a1']);
      expect(agent!.name).toBe('Updated');
    });

    it('returns 0 changes when no rows match', () => {
      const result = run('UPDATE agents SET name = ? WHERE id = ?', ['x', 'nonexistent']);
      expect(result.changes).toBe(0);
    });
  });

  describe('transaction', () => {
    it('commits all operations atomically', () => {
      transaction(() => {
        run(
          `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
        );
        run(
          `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['a2', 'Agent2', 'role2', '🧠', 'standby', 'default', '2024-01-01', '2024-01-01']
        );
      });

      const agents = queryAll('SELECT * FROM agents');
      expect(agents).toHaveLength(2);
    });

    it('rolls back on error', () => {
      try {
        transaction(() => {
          run(
            `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
          );
          throw new Error('Intentional rollback');
        });
      } catch {
        // Expected
      }

      const agents = queryAll('SELECT * FROM agents');
      expect(agents).toHaveLength(0);
    });

    it('returns value from the transaction function', () => {
      const result = transaction(() => {
        run(
          `INSERT INTO agents (id, name, role, avatar_emoji, status, workspace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['a1', 'Agent1', 'role1', '🤖', 'standby', 'default', '2024-01-01', '2024-01-01']
        );
        return 'done';
      });
      expect(result).toBe('done');
    });
  });
});
