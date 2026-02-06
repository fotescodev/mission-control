import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskDeliverable } from '@/lib/types';
import { isNonEmptyString, isValidDeliverableType, badRequest } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const deliverables = db.prepare(
      `SELECT * FROM task_deliverables WHERE task_id = ? ORDER BY created_at DESC`
    ).all(taskId) as TaskDeliverable[];
    return NextResponse.json(deliverables);
  } catch (error) {
    console.error('Error fetching deliverables:', error);
    return NextResponse.json({ error: 'Failed to fetch deliverables' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { deliverable_type, title, path, description } = body;

    if (!isValidDeliverableType(deliverable_type)) {
      return badRequest('Invalid or missing deliverable_type (must be file, url, or artifact)');
    }
    if (!isNonEmptyString(title)) {
      return badRequest('Title is required and must be a non-empty string');
    }

    const db = getDb();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, deliverable_type, title, path || null, description || null);

    const deliverable = db.prepare(`SELECT * FROM task_deliverables WHERE id = ?`).get(id) as TaskDeliverable;

    broadcast({ type: 'deliverable_added', payload: deliverable });

    return NextResponse.json(deliverable, { status: 201 });
  } catch (error) {
    console.error('Error creating deliverable:', error);
    return NextResponse.json({ error: 'Failed to create deliverable' }, { status: 500 });
  }
}
