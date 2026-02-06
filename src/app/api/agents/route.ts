import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import type { Agent, CreateAgentRequest } from '@/lib/types';
import {
  isNonEmptyString, isValidAgentStatus, isValidId,
  badRequest, created,
} from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    let agents: Agent[];
    if (workspaceId) {
      agents = queryAll<Agent>(`SELECT * FROM agents WHERE workspace_id = ? ORDER BY is_master DESC, name ASC`, [workspaceId]);
    } else {
      agents = queryAll<Agent>(`SELECT * FROM agents ORDER BY is_master DESC, name ASC`);
    }
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateAgentRequest & { workspace_id?: string; status?: string } = await request.json();
    if (!isNonEmptyString(body.name)) {
      return badRequest('Name is required and must be a non-empty string');
    }
    if (!isNonEmptyString(body.role)) {
      return badRequest('Role is required and must be a non-empty string');
    }
    if (body.status !== undefined && !isValidAgentStatus(body.status)) {
      return badRequest('Invalid agent status');
    }

    const workspaceId = body.workspace_id || 'default';
    if (body.workspace_id !== undefined && !isValidId(body.workspace_id)) {
      return badRequest('Invalid workspace_id');
    }
    // Verify workspace exists
    const workspace = queryOne<{ id: string }>('SELECT id FROM workspaces WHERE id = ?', [workspaceId]);
    if (!workspace) {
      return badRequest('Workspace not found');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    transaction(() => {
      run(
        `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, body.name.trim(), body.role.trim(), body.description || null,
          body.avatar_emoji || '🤖', body.is_master ? 1 : 0,
          workspaceId,
          body.soul_md || null, body.user_md || null, body.agents_md || null,
          now, now,
        ]
      );

      run(
        `INSERT INTO events (id, type, agent_id, message, created_at) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_joined', id, `${body.name.trim()} joined the team`, now]
      );
    });

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    return created(agent);
  } catch (error) {
    console.error('Failed to create agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
