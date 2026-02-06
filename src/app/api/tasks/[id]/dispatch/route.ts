import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import { runClaudeCode } from '@/lib/claude-code/runner';
import type { Task, Agent } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse optional overrides from request body
    const body = await request.json().catch(() => ({}));
    const {
      model = 'sonnet',
      maxTurns = 25,
      cwd,
      allowedTools,
      useTeam = false,
      teammateIds = [],   // agent IDs for team mode
    } = body;

    // Fetch the task
    const task = queryOne<Task>(
      'SELECT * FROM tasks WHERE id = ?',
      [id]
    );
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Task must have an assigned agent (team lead for team mode)
    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent. Assign an agent before dispatching.' },
        { status: 400 }
      );
    }

    // Don't dispatch tasks already in progress
    if (task.status === 'in_progress') {
      return NextResponse.json(
        { error: 'Task is already in progress.' },
        { status: 409 }
      );
    }

    // Fetch the assigned agent (team lead)
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );
    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Don't dispatch if lead agent is already working
    if (agent.status === 'working') {
      return NextResponse.json(
        { error: `${agent.name} is already working on another task.` },
        { status: 409 }
      );
    }

    // Resolve teammates for team mode
    let teammates: Array<{ id: string; name: string; role: string; description?: string }> = [];
    if (useTeam && teammateIds.length > 0) {
      const placeholders = teammateIds.map(() => '?').join(',');
      const teamAgents = queryAll<Agent>(
        `SELECT * FROM agents WHERE id IN (${placeholders})`,
        teammateIds
      );
      teammates = teamAgents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
      }));

      // Check that no teammate is already working
      const busyTeammates = teamAgents.filter(a => a.status === 'working');
      if (busyTeammates.length > 0) {
        return NextResponse.json(
          { error: `${busyTeammates.map(a => a.name).join(', ')} ${busyTeammates.length > 1 ? 'are' : 'is'} already working.` },
          { status: 409 }
        );
      }
    }

    // Build the prompt from task details
    let prompt = `# Task: ${task.title}\n\n`;
    if (task.description) {
      prompt += `## Description\n${task.description}\n\n`;
    }
    if (task.priority && task.priority !== 'normal') {
      prompt += `**Priority:** ${task.priority.toUpperCase()}\n\n`;
    }
    prompt += `Complete this task thoroughly. When finished, provide a clear summary of what was accomplished.`;

    // Build system prompt from agent's SOUL.md + context
    let systemPrompt = `You are ${agent.name}, ${agent.role}.`;
    if (agent.description) {
      systemPrompt += ` ${agent.description}`;
    }
    if (agent.soul_md) {
      systemPrompt += `\n\n## Your Soul (Personality & Guidelines)\n${agent.soul_md}`;
    }
    if (agent.agents_md) {
      systemPrompt += `\n\n## Team Awareness\n${agent.agents_md}`;
    }
    if (agent.user_md) {
      systemPrompt += `\n\n## User Context\n${agent.user_md}`;
    }

    // Fire and forget — run Claude in background
    runClaudeCode({
      prompt,
      systemPrompt,
      model,
      maxTurns,
      cwd: cwd || process.cwd(),
      allowedTools,
      taskId: id,
      agentId: agent.id,
      agentName: agent.name,
      useTeam,
      teammates,
    }).catch((error) => {
      console.error(`[Dispatch] Claude Code failed for task ${id}:`, error);
    });

    // Build response
    const modeLabel = useTeam ? 'Agent Team' : 'Claude Code';
    const teamInfo = useTeam && teammates.length > 0
      ? ` Team: ${agent.name} (lead) + ${teammates.map(t => t.name).join(', ')}.`
      : '';

    return NextResponse.json({
      success: true,
      message: `${agent.name} has been dispatched to work on "${task.title}" using ${modeLabel} (${model}).${teamInfo}`,
      taskId: id,
      agentId: agent.id,
      mode: useTeam ? 'team' : 'solo',
      teammates: useTeam ? teammates.map(t => ({ id: t.id, name: t.name })) : undefined,
    });
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json({ error: 'Failed to dispatch task' }, { status: 500 });
  }
}
