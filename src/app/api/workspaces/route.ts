import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Workspace, WorkspaceStats, TaskStatus } from '@/lib/types';
import { isNonEmptyString, badRequest, conflict, created } from '@/lib/validation';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(request: NextRequest) {
  const includeStats = request.nextUrl.searchParams.get('stats') === 'true';

  try {
    const db = getDb();

    if (includeStats) {
      const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY name').all() as Workspace[];

      const stats: WorkspaceStats[] = workspaces.map(workspace => {
        const taskCounts = db.prepare(
          `SELECT status, COUNT(*) as count FROM tasks WHERE workspace_id = ? GROUP BY status`
        ).all(workspace.id) as { status: TaskStatus; count: number }[];

        const counts: WorkspaceStats['taskCounts'] = {
          planning: 0, inbox: 0, assigned: 0, in_progress: 0,
          testing: 0, review: 0, done: 0, total: 0,
        };
        taskCounts.forEach(tc => { counts[tc.status] = tc.count; counts.total += tc.count; });

        const agentCount = db.prepare(
          'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?'
        ).get(workspace.id) as { count: number };

        return {
          id: workspace.id, name: workspace.name, slug: workspace.slug,
          icon: workspace.icon, taskCounts: counts, agentCount: agentCount.count,
        };
      });

      return NextResponse.json(stats);
    }

    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY name').all();
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, icon } = body;

    if (!isNonEmptyString(name)) {
      return badRequest('Name is required and must be a non-empty string');
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const slug = generateSlug(name);

    try {
      db.prepare(`INSERT INTO workspaces (id, name, slug, description, icon) VALUES (?, ?, ?, ?, ?)`)
        .run(id, name.trim(), slug, description || null, icon || '📁');
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.message?.includes('UNIQUE constraint failed')) {
        return conflict('A workspace with this name already exists');
      }
      throw err;
    }

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return created(workspace);
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}
