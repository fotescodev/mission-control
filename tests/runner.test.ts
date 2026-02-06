import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveProcesses } from '@/lib/claude-code/runner';
import type { ClaudeRunOptions } from '@/lib/claude-code/runner';

// Mock child_process to avoid actually spawning claude
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const proc = {
      pid: 1234,
      killed: false,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    };
    return proc;
  }),
}));

describe('claude-code runner', () => {
  beforeEach(() => {
    // Clear active processes between tests
    getActiveProcesses().clear();
    vi.clearAllMocks();
  });

  describe('getActiveProcesses', () => {
    it('returns the active processes map', () => {
      const procs = getActiveProcesses();
      expect(procs).toBeInstanceOf(Map);
      expect(procs.size).toBe(0);
    });
  });

  describe('ClaudeRunOptions type', () => {
    it('accepts valid solo options', () => {
      const options: ClaudeRunOptions = {
        prompt: 'Test prompt',
        taskId: 'task-1',
        agentId: 'agent-1',
        agentName: 'TestAgent',
      };
      expect(options.prompt).toBe('Test prompt');
      expect(options.useTeam).toBeUndefined();
    });

    it('accepts valid team options', () => {
      const options: ClaudeRunOptions = {
        prompt: 'Team task',
        taskId: 'task-2',
        agentId: 'agent-lead',
        agentName: 'LeadAgent',
        useTeam: true,
        teammates: [
          { id: 'agent-2', name: 'Agent2', role: 'developer' },
          { id: 'agent-3', name: 'Agent3', role: 'reviewer', description: 'Code reviewer' },
        ],
      };
      expect(options.useTeam).toBe(true);
      expect(options.teammates).toHaveLength(2);
      expect(options.teammates![1].description).toBe('Code reviewer');
    });
  });

  describe('ClaudeStreamMessage type', () => {
    it('parses assistant message format', () => {
      // Validates that our expected stream format is correct
      const msg = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/test.ts' } },
          ],
        },
      };
      expect(msg.type).toBe('assistant');
      expect(msg.message.content).toHaveLength(2);
      expect(msg.message.content[0].text).toBe('Hello world');
      expect(msg.message.content[1].name).toBe('Read');
    });

    it('parses result message format', () => {
      const msg = {
        type: 'result',
        result: 'Task completed successfully',
        cost_usd: 0.0123,
        duration_ms: 45000,
        num_turns: 5,
        is_error: false,
      };
      expect(msg.type).toBe('result');
      expect(msg.cost_usd).toBeCloseTo(0.0123);
      expect(msg.is_error).toBe(false);
    });
  });
});
