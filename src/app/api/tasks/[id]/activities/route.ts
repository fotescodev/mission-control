import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskActivity } from '@/lib/types';
import { isNonEmptyString, badRequest } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();

    const activities = db.prepare(`
      SELECT a.*, ag.name as agent_name, ag.avatar_emoji as agent_avatar_emoji
      FROM task_activities a
      LEFT JOIN agents ag ON a.agent_id = ag.id
      WHERE a.task_id = ?
      ORDER BY a.created_at DESC
    `).all(taskId) as any[];

    const result: TaskActivity[] = activities.map((row: any) => ({
      id: row.id,
      task_id: row.task_id,
      agent_id: row.agent_id,
      activity_type: row.activity_type,
      message: row.message,
      metadata: row.metadata,
      created_at: row.created_at,
      agent: row.agent_id ? { id: row.agent_id, name: row.agent_name, avatar_emoji: row.agent_avatar_emoji } : undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { activity_type, message, agent_id, metadata } = body;

    if (!isNonEmptyString(activity_type)) {
      return badRequest('activity_type is required and must be a non-empty string');
    }
    if (!isNonEmptyString(message)) {
      return badRequest('message is required and must be a non-empty string');
    }

    const db = getDb();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, agent_id || null, activity_type, message, metadata ? JSON.stringify(metadata) : null);

    const activity = db.prepare(`
      SELECT a.*, ag.name as agent_name, ag.avatar_emoji as agent_avatar_emoji
      FROM task_activities a LEFT JOIN agents ag ON a.agent_id = ag.id WHERE a.id = ?
    `).get(id) as any;

    const result: TaskActivity = {
      id: activity.id,
      task_id: activity.task_id,
      agent_id: activity.agent_id,
      activity_type: activity.activity_type,
      message: activity.message,
      metadata: activity.metadata,
      created_at: activity.created_at,
      agent: activity.agent_id ? { id: activity.agent_id, name: activity.agent_name, avatar_emoji: activity.agent_avatar_emoji } : undefined,
    };

    broadcast({ type: 'activity_logged', payload: result });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating activity:', error);
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
  }
}
