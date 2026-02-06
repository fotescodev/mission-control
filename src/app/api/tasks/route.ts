import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task, CreateTaskRequest, Agent } from '@/lib/types';

/** Row type returned from task + agent JOIN query */
interface TaskRow extends Task {
  assigned_agent_name?: string;
  assigned_agent_emoji?: string;
  created_by_agent_name?: string;
}
import {
  isNonEmptyString, isValidPriority, isValidTaskStatus, isValidId,
  normalizeOptionalString, badRequest, created, clampInt,
} from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const workspaceId = searchParams.get('workspace_id');
    const limit = clampInt(searchParams.get('limit'), 200, 1, 500);

    let sql = `
      SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name
      FROM tasks t
      LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
      LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      const validStatuses = statuses.filter(s => isValidTaskStatus(s));
      if (validStatuses.length === 1) {
        sql += ' AND t.status = ?';
        params.push(validStatuses[0]);
      } else if (validStatuses.length > 1) {
        sql += ` AND t.status IN (${validStatuses.map(() => '?').join(',')})`;
        params.push(...validStatuses);
      }
    }
    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(limit);

    const tasks = queryAll<TaskRow>(sql, params);

    const transformedTasks = tasks.map((task) => {
      const { assigned_agent_name, assigned_agent_emoji, created_by_agent_name, ...rest } = task;
      return {
        ...rest,
        assigned_agent: task.assigned_agent_id
          ? { id: task.assigned_agent_id, name: assigned_agent_name, avatar_emoji: assigned_agent_emoji }
          : undefined,
      };
    });

    return NextResponse.json(transformedTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest & { workspace_id?: string; status?: string; business_id?: string } = await request.json();

    if (!isNonEmptyString(body.title)) {
      return badRequest('Title is required and must be a non-empty string');
    }
    if (body.status !== undefined && !isValidTaskStatus(body.status)) {
      return badRequest('Invalid task status');
    }
    if (body.priority !== undefined && !isValidPriority(body.priority)) {
      return badRequest('Invalid priority');
    }
    if (body.workspace_id !== undefined && !isValidId(body.workspace_id)) {
      return badRequest('Invalid workspace_id');
    }

    const description = normalizeOptionalString(body.description);
    const due_date = normalizeOptionalString(body.due_date);
    const assigned_agent_id = normalizeOptionalString(body.assigned_agent_id);
    const created_by_agent_id = normalizeOptionalString(body.created_by_agent_id);

    const id = uuidv4();
    const now = new Date().toISOString();

    transaction(() => {
      run(
        `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, body.title.trim(), description,
          body.status || 'inbox', body.priority || 'normal',
          assigned_agent_id, created_by_agent_id,
          body.workspace_id || 'default', body.business_id || 'default',
          due_date, now, now,
        ]
      );

      let eventMessage = `New task: ${body.title.trim()}`;
      if (created_by_agent_id) {
        const creator = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [created_by_agent_id]);
        if (creator) eventMessage = `${creator.name} created task: ${body.title.trim()}`;
      }

      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), 'task_created', created_by_agent_id, id, eventMessage, now]
      );
    });

    const newTask = queryOne<TaskRow>(
      `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id WHERE t.id = ?`,
      [id]
    );

    if (newTask) {
      const { assigned_agent_name, assigned_agent_emoji, ...rest } = newTask;
      const result = {
        ...rest,
        assigned_agent: newTask.assigned_agent_id
          ? { id: newTask.assigned_agent_id, name: assigned_agent_name, avatar_emoji: assigned_agent_emoji }
          : undefined,
      };
      broadcast({ type: 'task_created', payload: result });
      return created(result);
    }

    return created(newTask);
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
