import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
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
    } = body;

    // Fetch the task
    const task = queryOne<Task>(
      'SELECT * FROM tasks WHERE id = ?',
      [id]
    );
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Task must have an assigned agent
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

    // Fetch the assigned agent
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );
    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Don't dispatch if agent is already working
    if (agent.status === 'working') {
      return NextResponse.json(
        { error: `${agent.name} is already working on another task.` },
        { status: 409 }
      );
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
    }).catch((error) => {
      console.error(`[Dispatch] Claude Code failed for task ${id}:`, error);
    });

    // Return immediately — the task will be updated asynchronously
    return NextResponse.json({
      success: true,
      message: `${agent.name} has been dispatched to work on "${task.title}" using Claude Code (${model}).`,
      taskId: id,
      agentId: agent.id,
    });
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json({ error: 'Failed to dispatch task' }, { status: 500 });
  }
}
