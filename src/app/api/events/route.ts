import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, run } from '@/lib/db';
import type { Event } from '@/lib/types';

/** Row type returned from event + agent/task JOIN query */
interface EventRow extends Event {
  agent_name?: string;
  agent_emoji?: string;
  task_title?: string;
}
import { isNonEmptyString, isValidEventType, clampInt, badRequest, created } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampInt(searchParams.get('limit'), 50, 1, 200);

    const events = queryAll<EventRow>(
      `SELECT e.*, a.name as agent_name, a.avatar_emoji as agent_emoji, t.title as task_title
       FROM events e
       LEFT JOIN agents a ON e.agent_id = a.id
       LEFT JOIN tasks t ON e.task_id = t.id
       ORDER BY e.created_at DESC LIMIT ?`,
      [limit]
    );

    const transformedEvents = events.map((event) => {
      const { agent_name, agent_emoji, task_title, ...rest } = event;
      return {
        ...rest,
        agent: event.agent_id ? { id: event.agent_id, name: agent_name, avatar_emoji: agent_emoji } : undefined,
        task: event.task_id ? { id: event.task_id, title: task_title } : undefined,
      };
    });

    return NextResponse.json(transformedEvents);
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isValidEventType(body.type)) {
      return badRequest('Invalid or missing event type');
    }
    if (!isNonEmptyString(body.message)) {
      return badRequest('Message is required and must be a non-empty string');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, body.type, body.agent_id || null, body.task_id || null, body.message.trim(), body.metadata ? JSON.stringify(body.metadata) : null, now]
    );

    return created({ id, type: body.type, message: body.message.trim(), created_at: now });
  } catch (error) {
    console.error('Failed to create event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
