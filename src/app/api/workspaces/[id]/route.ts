import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isNonEmptyString, badRequest, notFound, conflict } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDb();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? OR slug = ?').get(id, id);
    if (!workspace) return notFound('Workspace');
    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Failed to fetch workspace:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, description, icon } = body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (!existing) return notFound('Workspace');

    if (name !== undefined && !isNonEmptyString(name)) {
      return badRequest('Name must be a non-empty string');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      updates.push('slug = ?');
      values.push(slug);
    }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }

    if (updates.length === 0) return badRequest('No fields to update');

    updates.push("updated_at = datetime('now')");
    values.push(id);

    try {
      db.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '';
      const errCode = (err as Record<string, unknown>)?.code;
      if (errCode === 'SQLITE_CONSTRAINT_UNIQUE' || errMsg.includes('UNIQUE constraint failed')) {
        return conflict('A workspace with this name already exists');
      }
      throw err;
    }

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Failed to update workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDb();
    if (id === 'default') return badRequest('Cannot delete the default workspace');

    const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (!existing) return notFound('Workspace');

    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ?').get(id) as { count: number };
    const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?').get(id) as { count: number };

    if (taskCount.count > 0 || agentCount.count > 0) {
      return badRequest('Cannot delete workspace with existing tasks or agents');
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
