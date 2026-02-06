import { NextRequest, NextResponse } from 'next/server';
import { run, queryOne, queryAll, transaction } from '@/lib/db';
import { runClaudeCode } from '@/lib/claude-code/runner';
import { isValidCwd, isValidModel, isStringArray, isValidId, badRequest, conflict } from '@/lib/validation';
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
      useTeam = false,
      teammateIds = [],   // agent IDs for team mode
    } = body;

    // Validate model
    if (!isValidModel(model)) {
      return badRequest('Invalid model. Allowed: haiku, sonnet, opus');
    }

    // Validate cwd if provided
    if (cwd !== undefined && !isValidCwd(cwd)) {
      return badRequest('Invalid cwd. Must be an absolute path without traversal into sensitive directories.');
    }

    // Validate teammateIds
    if (!isStringArray(teammateIds, 10)) {
      return badRequest('teammateIds must be an array of strings with at most 10 entries');
    }
    if (teammateIds.length > 0 && !teammateIds.every((id: string) => isValidId(id))) {
      return badRequest('One or more teammate IDs have invalid format');
    }

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
      return badRequest('Task has no assigned agent. Assign an agent before dispatching.');
    }

    // Fetch the assigned agent (team lead) — needed for name/role before claiming
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );
    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Resolve teammates for team mode (validate existence + build list before claiming)
    let teammates: Array<{ id: string; name: string; role: string; description?: string }> = [];
    if (useTeam && teammateIds.length > 0) {
      const placeholders = teammateIds.map(() => '?').join(',');
      const teamAgents = queryAll<Agent>(
        `SELECT * FROM agents WHERE id IN (${placeholders})`,
        teammateIds
      );
      // Verify all requested teammate IDs actually exist
      if (teamAgents.length !== teammateIds.length) {
        return badRequest('One or more teammate IDs are invalid');
      }
      teammates = teamAgents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
      }));
    }

    // Atomic: claim the task + agent in one transaction to prevent race conditions
    const now = new Date().toISOString();
    let claimError: string | null = null;
    try {
      transaction(() => {
        const taskClaim = run(
          `UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ? AND status != 'in_progress' AND status != 'done'`,
          [now, id]
        );
        if (!taskClaim.changes) {
          throw new Error('TASK_UNAVAILABLE');
        }

        const agentClaim = run(
          `UPDATE agents SET status = 'working', updated_at = ? WHERE id = ? AND status = 'standby'`,
          [now, task.assigned_agent_id]
        );
        if (!agentClaim.changes) {
          throw new Error('AGENT_BUSY');
        }

        // If team mode, claim all teammates atomically too
        if (useTeam && teammateIds.length > 0) {
          for (const teammateId of teammateIds) {
            const teammateClaim = run(
              `UPDATE agents SET status = 'working', updated_at = ? WHERE id = ? AND status = 'standby'`,
              [now, teammateId]
            );
            if (!teammateClaim.changes) {
              throw new Error('TEAMMATE_BUSY');
            }
          }
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'TASK_UNAVAILABLE') {
        claimError = 'Task is already in progress or completed.';
      } else if (msg === 'AGENT_BUSY') {
        claimError = `${agent.name} is already working on another task.`;
      } else if (msg === 'TEAMMATE_BUSY') {
        claimError = 'One or more teammates are already working.';
      } else {
        throw err; // unexpected error, rethrow
      }
    }

    if (claimError) {
      return conflict(claimError);
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
