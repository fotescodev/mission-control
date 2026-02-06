import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task, UpdateTaskRequest, Agent, DispatchMode } from '@/lib/types';

/** Row type returned from task + agent JOIN query */
interface TaskRow extends Task {
  assigned_agent_name?: string;
  assigned_agent_emoji?: string;
}
import {
  isNonEmptyString, isValidPriority, isValidTaskStatus,
  normalizeOptionalString, badRequest, notFound,
} from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = queryOne<TaskRow>(
      `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id WHERE t.id = ?`,
      [id]
    );
    if (!task) return notFound('Task');
    const { assigned_agent_name, assigned_agent_emoji, ...rest } = task;
    return NextResponse.json({
      ...rest,
      assigned_agent: task.assigned_agent_id
        ? { id: task.assigned_agent_id, name: assigned_agent_name, avatar_emoji: assigned_agent_emoji }
        : undefined,
    });
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateTaskRequest = await request.json();

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) return notFound('Task');

    // Validate enum fields before use
    if (body.title !== undefined && !isNonEmptyString(body.title)) {
      return badRequest('Title must be a non-empty string');
    }
    if (body.status !== undefined && !isValidTaskStatus(body.status)) {
      return badRequest('Invalid task status');
    }
    if (body.priority !== undefined && !isValidPriority(body.priority)) {
      return badRequest('Invalid priority');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(normalizeOptionalString(body.description)); }
    if (body.priority !== undefined) { updates.push('priority = ?'); values.push(body.priority); }
    if (body.due_date !== undefined) { updates.push('due_date = ?'); values.push(normalizeOptionalString(body.due_date)); }
    if (body.dispatch_mode !== undefined) { updates.push('dispatch_mode = ?'); values.push(body.dispatch_mode); }
    if (body.dispatch_metadata !== undefined) { updates.push('dispatch_metadata = ?'); values.push(body.dispatch_metadata); }

    if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(body.assigned_agent_id);
    }

    const statusChanged = body.status !== undefined && body.status !== existing.status;
    if (statusChanged) {
      updates.push('status = ?');
      values.push(body.status);
    }

    if (updates.length === 0) return badRequest('No updates provided');

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    transaction(() => {
      run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

      if (statusChanged) {
        const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
        run(
          `INSERT INTO events (id, type, task_id, message, created_at) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${body.status}`, now]
        );
      }

      if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing.assigned_agent_id && body.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', body.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );
        }
      }
    });

    const updated = queryOne<TaskRow>(
      `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id WHERE t.id = ?`,
      [id]
    );

    if (updated) {
      const { assigned_agent_name: agName, assigned_agent_emoji: agEmoji, ...taskRest } = updated;
      const result = {
        ...taskRest,
        assigned_agent: updated.assigned_agent_id
          ? { id: updated.assigned_agent_id, name: agName, avatar_emoji: agEmoji }
          : undefined,
      };
      broadcast({ type: 'task_updated', payload: result });
      return NextResponse.json(result);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) return notFound('Task');

    transaction(() => {
      run('DELETE FROM events WHERE task_id = ?', [id]);
      run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);
      run('DELETE FROM tasks WHERE id = ?', [id]);
    });

    broadcast({ type: 'task_deleted', payload: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
