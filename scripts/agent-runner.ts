#!/usr/bin/env npx tsx
/**
 * Standalone Agent Runner
 *
 * Polls Mission Control for tasks in "assigned" status,
 * then dispatches them to Claude Code automatically.
 *
 * Usage:
 *   npx tsx scripts/agent-runner.ts
 *   npx tsx scripts/agent-runner.ts --workspace default --interval 10
 */

const MC_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:3000';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15', 10) * 1000; // seconds -> ms
const WORKSPACE = process.env.WORKSPACE || '';

interface Task {
  id: string;
  title: string;
  status: string;
  assigned_agent_id?: string;
  priority: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
}

// Parse CLI args
const args = process.argv.slice(2);
let workspace = WORKSPACE;
let interval = POLL_INTERVAL;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && args[i + 1]) {
    workspace = args[++i];
  } else if (args[i] === '--interval' && args[i + 1]) {
    interval = parseInt(args[++i], 10) * 1000;
  } else if (args[i] === '--url' && args[i + 1]) {
    // Allow override
    i++;
  }
}

const activeTasks = new Set<string>();

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${MC_URL}${path}`);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (error) {
    console.error(`[Agent Runner] Failed to fetch ${path}:`, error);
    return null;
  }
}

async function dispatchTask(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`${MC_URL}/api/tasks/${taskId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonnet' }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[Agent Runner] Dispatched: ${data.message}`);
      return true;
    } else {
      console.error(`[Agent Runner] Dispatch failed: ${data.error}`);
      return false;
    }
  } catch (error) {
    console.error(`[Agent Runner] Dispatch error:`, error);
    return false;
  }
}

async function poll() {
  // Fetch tasks with "assigned" status (ready to be worked on)
  const queryParams = workspace
    ? `?workspace_id=${workspace}&status=assigned`
    : '?status=assigned';

  const tasks = await fetchJSON<Task[]>(`/api/tasks${queryParams}`);
  if (!tasks || tasks.length === 0) return;

  // Sort by priority (urgent first)
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  tasks.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  for (const task of tasks) {
    // Skip if we're already processing this task
    if (activeTasks.has(task.id)) continue;

    // Must have an assigned agent
    if (!task.assigned_agent_id) continue;

    // Check agent is available
    const agent = await fetchJSON<Agent>(`/api/agents/${task.assigned_agent_id}`);
    if (!agent || agent.status === 'working') {
      console.log(`[Agent Runner] Skipping "${task.title}" — ${agent?.name || 'unknown agent'} is busy`);
      continue;
    }

    console.log(`[Agent Runner] Found assigned task: "${task.title}" → ${agent.name}`);
    activeTasks.add(task.id);

    const dispatched = await dispatchTask(task.id);
    if (!dispatched) {
      activeTasks.delete(task.id);
    }
  }

  // Clean up finished tasks from tracking set
  const inProgressTasks = await fetchJSON<Task[]>(
    `/api/tasks${workspace ? `?workspace_id=${workspace}&status=in_progress` : '?status=in_progress'}`
  );
  const inProgressIds = new Set((inProgressTasks || []).map(t => t.id));
  Array.from(activeTasks).forEach((taskId) => {
    if (!inProgressIds.has(taskId)) {
      activeTasks.delete(taskId);
    }
  });
}

async function main() {
  console.log('========================================');
  console.log('  Mission Control — Agent Runner');
  console.log('========================================');
  console.log(`  URL:       ${MC_URL}`);
  console.log(`  Workspace: ${workspace || '(all)'}`);
  console.log(`  Interval:  ${interval / 1000}s`);
  console.log('========================================');
  console.log('');
  console.log('Polling for assigned tasks...\n');

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, interval);
}

main().catch(console.error);
