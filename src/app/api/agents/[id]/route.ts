import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import type { Agent, UpdateAgentRequest } from '@/lib/types';
import { isValidAgentStatus, isNonEmptyString, badRequest, notFound } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) return notFound('Agent');
    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateAgentRequest = await request.json();

    const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!existing) return notFound('Agent');

    // Validate enum and string fields
    if (body.status !== undefined && !isValidAgentStatus(body.status)) {
      return badRequest('Invalid agent status');
    }
    if (body.name !== undefined && !isNonEmptyString(body.name)) {
      return badRequest('Name must be a non-empty string');
    }
    if (body.role !== undefined && !isNonEmptyString(body.role)) {
      return badRequest('Role must be a non-empty string');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.role !== undefined) { updates.push('role = ?'); values.push(body.role.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (body.avatar_emoji !== undefined) { updates.push('avatar_emoji = ?'); values.push(body.avatar_emoji); }

    const statusChanged = body.status !== undefined && body.status !== existing.status;
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.is_master !== undefined) { updates.push('is_master = ?'); values.push(body.is_master ? 1 : 0); }
    if (body.soul_md !== undefined) { updates.push('soul_md = ?'); values.push(body.soul_md); }
    if (body.user_md !== undefined) { updates.push('user_md = ?'); values.push(body.user_md); }
    if (body.agents_md !== undefined) { updates.push('agents_md = ?'); values.push(body.agents_md); }

    if (updates.length === 0) return badRequest('No updates provided');

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    transaction(() => {
      run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, values);

      if (statusChanged) {
        run(
          `INSERT INTO events (id, type, agent_id, message, created_at) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'agent_status_changed', id, `${existing.name} is now ${body.status}`, now]
        );
      }
    });

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to update agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!existing) return notFound('Agent');

    transaction(() => {
      run('DELETE FROM events WHERE agent_id = ?', [id]);
      run('DELETE FROM messages WHERE sender_agent_id = ?', [id]);
      run('DELETE FROM conversation_participants WHERE agent_id = ?', [id]);
      run('UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?', [id]);
      run('UPDATE tasks SET created_by_agent_id = NULL WHERE created_by_agent_id = ?', [id]);
      run('UPDATE task_activities SET agent_id = NULL WHERE agent_id = ?', [id]);
      run('DELETE FROM agents WHERE id = ?', [id]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}
