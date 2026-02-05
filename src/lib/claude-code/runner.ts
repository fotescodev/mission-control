/**
 * Claude Code Runner
 *
 * Spawns Claude Code CLI as a subprocess to execute tasks.
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
async function logActivity(taskId: string, agentId: string, activityType: string, message: string) {
  const mcUrl = getMissionControlUrl();
  try {
    await fetch(`${mcUrl}/api/tasks/${taskId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: activityType, message, agent_id: agentId }),
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
 * Run Claude Code CLI for a task.
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
  } = options;

  // Build CLI arguments
  const args: string[] = [
    '-p',                         // Non-interactive print mode
    '--output-format', 'stream-json',  // Stream JSON for real-time parsing
    '--model', model,
    '--max-turns', String(maxTurns),
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
  args.push(prompt);

  console.log(`[Claude Runner] Starting Claude Code for task ${taskId}`);
  console.log(`[Claude Runner] Agent: ${agentName} (${agentId})`);
  console.log(`[Claude Runner] Model: ${model}, Max turns: ${maxTurns}`);
  console.log(`[Claude Runner] CWD: ${cwd}`);

  // Update statuses
  await updateAgentStatus(agentId, 'working');
  await updateTaskStatus(taskId, 'in_progress');
  await logActivity(taskId, agentId, 'spawned', `${agentName} started working on this task using Claude Code (${model})`);

  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      cwd,
      env: { ...process.env },
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
                  logActivity(taskId, agentId, 'updated', activityMsg);
                }
              }

              if (block.type === 'tool_use' && block.name) {
                // Log tool usage as activity
                const toolInput = block.input || {};
                let toolMsg = `Using tool: ${block.name}`;
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

      // Update agent back to standby
      await updateAgentStatus(agentId, 'standby');

      if (code === 0) {
        // Move task to review status
        await updateTaskStatus(taskId, 'review');
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
      await logActivity(taskId, agentId, 'status_changed', `Failed to start Claude Code: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}
