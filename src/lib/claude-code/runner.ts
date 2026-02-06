/**
 * Claude Code Runner
 *
 * Spawns Claude Code CLI as a subprocess to execute tasks.
 * Supports both solo mode (single agent) and team mode (Agent Teams).
 * Streams output back as task activities in real-time.
 */

import { spawn, type ChildProcess } from 'child_process';
import { getMissionControlUrl } from '@/lib/config';

export interface ClaudeRunOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTurns?: number;
  cwd?: string;
  allowedTools?: string[];
  taskId: string;
  agentId: string;
  agentName: string;
  // Team mode options
  useTeam?: boolean;
  teammates?: Array<{
    id: string;
    name: string;
    role: string;
    description?: string;
  }>;
}

export interface ClaudeStreamMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  // assistant message content
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    stop_reason?: string;
  };
  // result fields (type=result)
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  is_error?: boolean;
}

// Track active processes so they can be killed if needed
const activeProcesses = new Map<string, ChildProcess>();

export function getActiveProcesses(): Map<string, ChildProcess> {
  return activeProcesses;
}

/**
 * Log an activity to Mission Control
 */
async function logActivity(taskId: string, agentId: string, activityType: string, message: string, metadata?: Record<string, unknown>) {
  const mcUrl = getMissionControlUrl();
  try {
    await fetch(`${mcUrl}/api/tasks/${taskId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: activityType, message, agent_id: agentId, metadata }),
    });
  } catch (error) {
    console.error('[Claude Runner] Failed to log activity:', error);
  }
}

/**
 * Update task status in Mission Control
 */
async function updateTaskStatus(taskId: string, status: string) {
  const mcUrl = getMissionControlUrl();
  try {
    await fetch(`${mcUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    console.error('[Claude Runner] Failed to update task status:', error);
  }
}

/**
 * Update agent status in Mission Control
 */
async function updateAgentStatus(agentId: string, status: string) {
  const mcUrl = getMissionControlUrl();
  try {
    await fetch(`${mcUrl}/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    console.error('[Claude Runner] Failed to update agent status:', error);
  }
}

/**
 * Update dispatch metadata on the task
 */
async function updateDispatchMetadata(taskId: string, mode: string, metadata: Record<string, unknown>) {
  const mcUrl = getMissionControlUrl();
  try {
    await fetch(`${mcUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispatch_mode: mode,
        dispatch_metadata: JSON.stringify(metadata),
      }),
    });
  } catch (error) {
    console.error('[Claude Runner] Failed to update dispatch metadata:', error);
  }
}

/**
 * Build a team-oriented prompt that instructs Claude to create an Agent Team
 */
function buildTeamPrompt(options: ClaudeRunOptions): string {
  const { prompt, teammates = [] } = options;

  let teamPrompt = `Create an agent team to work on the following task.\n\n`;
  teamPrompt += `# Task\n${prompt}\n\n`;

  if (teammates.length > 0) {
    teamPrompt += `# Team Structure\nSpawn ${teammates.length} teammate${teammates.length > 1 ? 's' : ''}:\n`;
    teammates.forEach((t, i) => {
      teamPrompt += `${i + 1}. **${t.name}** (${t.role})`;
      if (t.description) teamPrompt += ` — ${t.description}`;
      teamPrompt += '\n';
    });
    teamPrompt += '\n';
  }

  teamPrompt += `# Coordination\n`;
  teamPrompt += `- Break the task into subtasks and assign to teammates\n`;
  teamPrompt += `- Have teammates share findings and challenge each other's approaches\n`;
  teamPrompt += `- Synthesize results when all teammates finish\n`;
  teamPrompt += `- Use delegate mode — focus on coordination, not implementation\n`;

  return teamPrompt;
}

/**
 * Run Claude Code CLI for a task.
 * Supports solo (single agent) and team (Agent Teams) modes.
 * Spawns the process, streams output, logs activities.
 * Returns a promise that resolves when Claude finishes.
 */
export async function runClaudeCode(options: ClaudeRunOptions): Promise<{
  success: boolean;
  result?: string;
  cost_usd?: number;
  num_turns?: number;
  error?: string;
}> {
  const {
    prompt,
    systemPrompt,
    model = 'sonnet',
    maxTurns = 25,
    cwd = process.cwd(),
    allowedTools,
    taskId,
    agentId,
    agentName,
    useTeam = false,
    teammates = [],
  } = options;

  const dispatchMode = useTeam ? 'team' : 'solo';

  // Build the actual prompt (team or solo)
  const actualPrompt = useTeam
    ? buildTeamPrompt(options)
    : prompt;

  // Build CLI arguments
  const args: string[] = [
    '-p',                         // Non-interactive print mode
    '--output-format', 'stream-json',  // Stream JSON for real-time parsing
    '--model', model,
    '--max-turns', String(useTeam ? maxTurns * 2 : maxTurns), // Teams need more turns
    '--dangerously-skip-permissions',  // Skip permission prompts in automated mode
    '--no-session-persistence',        // Don't persist session to disk
  ];

  if (systemPrompt) {
    args.push('--append-system-prompt', systemPrompt);
  }

  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowed-tools', ...allowedTools);
  }

  // The prompt goes last as positional arg
  args.push(actualPrompt);

  // Prepare env — enable Agent Teams if team mode
  const env = { ...process.env };
  if (useTeam) {
    env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  }

  const modeLabel = useTeam ? 'Team' : 'Solo';
  console.log(`[Claude Runner] Starting Claude Code (${modeLabel}) for task ${taskId}`);
  console.log(`[Claude Runner] Lead Agent: ${agentName} (${agentId})`);
  if (useTeam && teammates.length > 0) {
    console.log(`[Claude Runner] Teammates: ${teammates.map(t => t.name).join(', ')}`);
  }
  console.log(`[Claude Runner] Model: ${model}, Max turns: ${useTeam ? maxTurns * 2 : maxTurns}`);
  console.log(`[Claude Runner] CWD: ${cwd}`);

  // Update statuses
  await updateAgentStatus(agentId, 'working');
  await updateTaskStatus(taskId, 'in_progress');

  // Store dispatch metadata
  await updateDispatchMetadata(taskId, dispatchMode, {
    model,
    maxTurns,
    leadAgent: { id: agentId, name: agentName },
    teammates: useTeam ? teammates : undefined,
    startedAt: new Date().toISOString(),
  });

  if (useTeam) {
    // Log team formation
    await logActivity(taskId, agentId, 'team_formed',
      `${agentName} is forming an Agent Team with ${teammates.length} teammate${teammates.length !== 1 ? 's' : ''}: ${teammates.map(t => t.name).join(', ')}`,
      { teammates: teammates.map(t => ({ id: t.id, name: t.name, role: t.role })) }
    );
    // Set all teammates to working
    for (const t of teammates) {
      await updateAgentStatus(t.id, 'working');
      await logActivity(taskId, t.id, 'teammate_joined',
        `${t.name} joined the team as ${t.role}`
      );
    }
  } else {
    await logActivity(taskId, agentId, 'spawned',
      `${agentName} started working on this task using Claude Code (${model})`
    );
  }

  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcesses.set(taskId, proc);

    let resultText = '';
    let lastActivityText = '';
    let buffer = '';

    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();

      // Parse complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg: ClaudeStreamMessage = JSON.parse(line);

          // Handle different message types
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                // Accumulate text response
                resultText = block.text;

                // Log meaningful text chunks as activities (debounced)
                const trimmed = block.text.trim();
                if (trimmed.length > 20 && trimmed !== lastActivityText) {
                  lastActivityText = trimmed;
                  // Truncate long messages for activity log
                  const activityMsg = trimmed.length > 500
                    ? trimmed.substring(0, 500) + '...'
                    : trimmed;

                  // Detect team-related messages
                  const isTeamMsg = useTeam && (
                    trimmed.includes('teammate') ||
                    trimmed.includes('Spawning') ||
                    trimmed.includes('team')
                  );
                  logActivity(taskId, agentId,
                    isTeamMsg ? 'teammate_message' : 'updated',
                    activityMsg
                  );
                }
              }

              if (block.type === 'tool_use' && block.name) {
                // Log tool usage as activity
                const toolInput = block.input || {};
                let toolMsg = `Using tool: ${block.name}`;

                // Tool-specific formatting
                if (block.name === 'Edit' && toolInput.file_path) {
                  toolMsg = `Editing file: ${toolInput.file_path}`;
                } else if (block.name === 'Write' && toolInput.file_path) {
                  toolMsg = `Writing file: ${toolInput.file_path}`;
                } else if (block.name === 'Read' && toolInput.file_path) {
                  toolMsg = `Reading file: ${toolInput.file_path}`;
                } else if (block.name === 'Bash' && toolInput.command) {
                  const cmd = String(toolInput.command);
                  toolMsg = `Running: ${cmd.length > 100 ? cmd.substring(0, 100) + '...' : cmd}`;
                } else if (block.name === 'Grep' && toolInput.pattern) {
                  toolMsg = `Searching for: ${toolInput.pattern}`;
                } else if (block.name === 'Task' && toolInput.prompt) {
                  // Subagent or teammate spawn
                  const desc = String(toolInput.description || toolInput.prompt).substring(0, 100);
                  toolMsg = useTeam
                    ? `Team action: ${desc}`
                    : `Subagent: ${desc}`;
                } else if (block.name === 'spawnTeam' || block.name === 'TeammateTool') {
                  toolMsg = `Agent Team: ${block.name}`;
                  if (toolInput.prompt) {
                    toolMsg += ` — ${String(toolInput.prompt).substring(0, 100)}`;
                  }
                } else if (block.name === 'SendMessage') {
                  const to = toolInput.to || 'teammate';
                  toolMsg = `Message to ${to}: ${String(toolInput.message || '').substring(0, 100)}`;
                }

                logActivity(taskId, agentId, 'updated', toolMsg);
              }
            }
          }

          // Handle result (final message)
          if (msg.type === 'result') {
            resultText = msg.result || resultText;
            const costInfo = msg.cost_usd ? ` (cost: $${msg.cost_usd.toFixed(4)})` : '';
            const turnsInfo = msg.num_turns ? ` in ${msg.num_turns} turns` : '';
            logActivity(
              taskId, agentId,
              msg.is_error ? 'status_changed' : 'completed',
              `${agentName} ${msg.is_error ? 'encountered an error' : 'finished'}${turnsInfo}${costInfo}`
            );
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const stderr = data.toString().trim();
      if (stderr) {
        console.error(`[Claude Runner] stderr: ${stderr}`);
      }
    });

    proc.on('close', async (code) => {
      activeProcesses.delete(taskId);

      // Update lead agent back to standby
      await updateAgentStatus(agentId, 'standby');

      // If team mode, also set teammates back to standby
      if (useTeam) {
        for (const t of teammates) {
          await updateAgentStatus(t.id, 'standby');
        }
      }

      if (code === 0) {
        // Move task to review status
        await updateTaskStatus(taskId, 'review');
        // Update dispatch metadata with completion info
        await updateDispatchMetadata(taskId, dispatchMode, {
          model,
          maxTurns,
          leadAgent: { id: agentId, name: agentName },
          teammates: useTeam ? teammates : undefined,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'completed',
        });
        resolve({
          success: true,
          result: resultText,
        });
      } else {
        await logActivity(taskId, agentId, 'status_changed', `Claude Code exited with code ${code}`);
        resolve({
          success: false,
          error: `Process exited with code ${code}`,
        });
      }
    });

    proc.on('error', async (error) => {
      activeProcesses.delete(taskId);
      await updateAgentStatus(agentId, 'standby');
      if (useTeam) {
        for (const t of teammates) {
          await updateAgentStatus(t.id, 'standby');
        }
      }
      await logActivity(taskId, agentId, 'status_changed', `Failed to start Claude Code: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}
