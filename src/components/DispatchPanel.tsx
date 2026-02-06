'use client';

import { useState } from 'react';
import { Zap, Users, User, ChevronDown, ChevronUp, Loader2, Crown } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, Agent } from '@/lib/types';

interface DispatchPanelProps {
  task: Task;
  onDispatch: () => void;
}

type DispatchMode = 'solo' | 'team';

const MODELS = [
  { id: 'sonnet', label: 'Sonnet 4.5', desc: 'Fast & capable' },
  { id: 'opus', label: 'Opus 4.6', desc: 'Most powerful' },
  { id: 'haiku', label: 'Haiku 4.5', desc: 'Quick tasks' },
];

export function DispatchPanel({ task, onDispatch }: DispatchPanelProps) {
  const { agents, updateTask } = useMissionControl();
  const [mode, setMode] = useState<DispatchMode>('solo');
  const [model, setModel] = useState('sonnet');
  const [selectedTeammates, setSelectedTeammates] = useState<string[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Available agents for teammates (exclude the assigned lead agent, exclude offline)
  const availableTeammates = agents.filter(
    (a) => a.id !== task.assigned_agent_id && a.status !== 'offline'
  );

  const leadAgent = agents.find((a) => a.id === task.assigned_agent_id);

  const toggleTeammate = (agentId: string) => {
    setSelectedTeammates((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleDispatch = async () => {
    setIsDispatching(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { model };
      if (mode === 'team') {
        payload.useTeam = true;
        payload.teammateIds = selectedTeammates;
      }

      const res = await fetch(`/api/tasks/${task.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        updateTask({ ...task, status: 'in_progress', dispatch_mode: mode });
        onDispatch();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch {
      setMessage('Error: Failed to dispatch task.');
    } finally {
      setIsDispatching(false);
    }
  };

  const canDispatch =
    task.assigned_agent_id &&
    task.status !== 'in_progress' &&
    task.status !== 'done' &&
    (mode === 'solo' || selectedTeammates.length > 0);

  if (!leadAgent) return null;

  return (
    <div className="border border-mc-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-mc-bg-tertiary/50 hover:bg-mc-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-mc-accent-green" />
          <span className="text-sm font-medium">Dispatch to Claude</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-mc-text-secondary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-mc-text-secondary" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-mc-border">
          {/* Mode Toggle */}
          <div>
            <label className="block text-xs font-medium text-mc-text-secondary mb-2 uppercase tracking-wider">
              Dispatch Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('solo')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'solo'
                    ? 'border-mc-accent bg-mc-accent/10 text-mc-accent'
                    : 'border-mc-border bg-mc-bg text-mc-text-secondary hover:border-mc-text-secondary'
                }`}
              >
                <User className="w-4 h-4" />
                Solo Agent
              </button>
              <button
                onClick={() => setMode('team')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'team'
                    ? 'border-mc-accent-purple bg-mc-accent-purple/10 text-mc-accent-purple'
                    : 'border-mc-border bg-mc-bg text-mc-text-secondary hover:border-mc-text-secondary'
                }`}
              >
                <Users className="w-4 h-4" />
                Agent Team
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-medium text-mc-text-secondary mb-2 uppercase tracking-wider">
              Model
            </label>
            <div className="flex gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`flex-1 px-3 py-2 rounded border text-xs font-medium transition-all ${
                    model === m.id
                      ? 'border-mc-accent bg-mc-accent/10 text-mc-accent'
                      : 'border-mc-border bg-mc-bg text-mc-text-secondary hover:border-mc-text-secondary'
                  }`}
                >
                  <div>{m.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Team Lead (always shown) */}
          <div>
            <label className="block text-xs font-medium text-mc-text-secondary mb-2 uppercase tracking-wider">
              {mode === 'team' ? 'Team Lead' : 'Agent'}
            </label>
            <div className="flex items-center gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border">
              <span className="text-xl">{leadAgent.avatar_emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{leadAgent.name}</span>
                  {mode === 'team' && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-mc-accent-yellow/20 text-mc-accent-yellow rounded">
                      <Crown className="w-3 h-3" /> LEAD
                    </span>
                  )}
                </div>
                <span className="text-xs text-mc-text-secondary">{leadAgent.role}</span>
              </div>
              <StatusBadge status={leadAgent.status} />
            </div>
          </div>

          {/* Team Members (team mode only) */}
          {mode === 'team' && (
            <div>
              <label className="block text-xs font-medium text-mc-text-secondary mb-2 uppercase tracking-wider">
                Teammates ({selectedTeammates.length} selected)
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {availableTeammates.length === 0 ? (
                  <p className="text-xs text-mc-text-secondary p-3 text-center">
                    No other agents available. Create more agents to use team mode.
                  </p>
                ) : (
                  availableTeammates.map((agent) => {
                    const isSelected = selectedTeammates.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleTeammate(agent.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-mc-accent-purple bg-mc-accent-purple/10'
                            : 'border-mc-border/50 bg-mc-bg hover:border-mc-border'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'border-mc-accent-purple bg-mc-accent-purple'
                              : 'border-mc-border'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-base flex-shrink-0">{agent.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{agent.name}</div>
                          <div className="text-[11px] text-mc-text-secondary truncate">
                            {agent.role}
                          </div>
                        </div>
                        <StatusBadge status={agent.status} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Team info banner */}
          {mode === 'team' && selectedTeammates.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-mc-accent-purple/5 border border-mc-accent-purple/20 rounded-lg">
              <Users className="w-4 h-4 text-mc-accent-purple flex-shrink-0 mt-0.5" />
              <div className="text-xs text-mc-text-secondary">
                <span className="text-mc-accent-purple font-medium">Agent Team mode</span> uses
                Claude Code&apos;s experimental Agent Teams feature. The lead coordinates
                teammates who work independently, share findings, and challenge each
                other&apos;s approaches. Uses more tokens but produces better results for
                complex tasks.
              </div>
            </div>
          )}

          {/* Status Message */}
          {message && (
            <div
              className={`p-3 rounded text-sm ${
                message.startsWith('Error')
                  ? 'bg-mc-accent-red/10 text-mc-accent-red border border-mc-accent-red/20'
                  : 'bg-mc-accent-green/10 text-mc-accent-green border border-mc-accent-green/20'
              }`}
            >
              {message}
            </div>
          )}

          {/* Dispatch Button */}
          <button
            onClick={handleDispatch}
            disabled={!canDispatch || isDispatching}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === 'team'
                ? 'bg-mc-accent-purple text-white hover:bg-mc-accent-purple/90'
                : 'bg-mc-accent-green text-mc-bg hover:bg-mc-accent-green/90'
            }`}
          >
            {isDispatching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                {mode === 'team' ? (
                  <Users className="w-4 h-4" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {mode === 'team'
                  ? `Deploy Agent Team (${1 + selectedTeammates.length} agents)`
                  : 'Dispatch Solo Agent'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    standby: 'bg-mc-bg-tertiary text-mc-text-secondary',
    working: 'bg-mc-accent-green/20 text-mc-accent-green',
    offline: 'bg-mc-accent-red/20 text-mc-accent-red',
  };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[status] || styles.standby}`}>
      {status}
    </span>
  );
}
