'use client';

import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus } from '@/lib/types';

interface AgentModalProps {
  agent?: Agent;
  onClose: () => void;
  workspaceId?: string;
  onAgentCreated?: (agentId: string) => void;
}

const EMOJI_OPTIONS = ['🤖', '🧠', '💻', '🔍', '✍️', '🎨', '📊', '⚡', '🚀', '🎯', '🔧', '📱', '👁️'];

export function AgentModal({ agent, onClose, workspaceId, onAgentCreated }: AgentModalProps) {
  const { addAgent, updateAgent } = useMissionControl();
  const [activeTab, setActiveTab] = useState<'info' | 'soul' | 'user' | 'agents'>('info');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: agent?.name || '',
    role: agent?.role || '',
    description: agent?.description || '',
    avatar_emoji: agent?.avatar_emoji || '🤖',
    status: agent?.status || 'standby' as AgentStatus,
    is_master: agent?.is_master || false,
    soul_md: agent?.soul_md || '',
    user_md: agent?.user_md || '',
    agents_md: agent?.agents_md || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const url = agent ? `/api/agents/${agent.id}` : '/api/agents';
      const method = agent ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, workspace_id: workspaceId || agent?.workspace_id || 'default' }),
      });
      if (res.ok) {
        const savedAgent = await res.json();
        if (agent) updateAgent(savedAgent);
        else {
          addAgent(savedAgent);
          if (onAgentCreated) onAgentCreated(savedAgent.id);
        }
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save agent');
      }
    } catch (error) {
      console.error('Failed to save agent:', error);
      setError('Network error: Failed to save agent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !confirm(`Delete ${agent.name}?`)) return;
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (res.ok) {
        useMissionControl.setState((state) => ({
          agents: state.agents.filter((a) => a.id !== agent.id),
          selectedAgent: state.selectedAgent?.id === agent.id ? null : state.selectedAgent,
        }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
      setError('Failed to delete agent.');
    }
  };

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'soul', label: 'SOUL.md' },
    { id: 'user', label: 'USER.md' },
    { id: 'agents', label: 'AGENTS.md' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">{agent ? `Edit ${agent.name}` : 'Create New Agent'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-mc-bg-tertiary rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-mc-border" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-mc-accent text-mc-accent' : 'border-transparent text-mc-text-secondary hover:text-mc-text'
              }`}
            >{tab.label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Avatar</label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select avatar emoji">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button key={emoji} type="button" role="radio" aria-checked={form.avatar_emoji === emoji} aria-label={`Avatar ${emoji}`}
                      onClick={() => setForm({ ...form, avatar_emoji: emoji })}
                      className={`text-2xl p-2 rounded hover:bg-mc-bg-tertiary ${form.avatar_emoji === emoji ? 'bg-mc-accent/20 ring-2 ring-mc-accent' : ''}`}
                    >{emoji}</button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="agent-name" className="block text-sm font-medium mb-1">Name</label>
                <input id="agent-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent" placeholder="Agent name" />
              </div>
              <div>
                <label htmlFor="agent-role" className="block text-sm font-medium mb-1">Role</label>
                <input id="agent-role" type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent" placeholder="e.g., Code & Automation" />
              </div>
              <div>
                <label htmlFor="agent-description" className="block text-sm font-medium mb-1">Description</label>
                <textarea id="agent-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none" placeholder="What does this agent do?" />
              </div>
              <div>
                <label htmlFor="agent-status" className="block text-sm font-medium mb-1">Status</label>
                <select id="agent-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AgentStatus })}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent">
                  <option value="standby">Standby</option>
                  <option value="working">Working</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_master" checked={form.is_master}
                  onChange={(e) => setForm({ ...form, is_master: e.target.checked })} className="w-4 h-4" />
                <label htmlFor="is_master" className="text-sm">Master Orchestrator (can coordinate other agents)</label>
              </div>
            </div>
          )}
          {activeTab === 'soul' && (
            <div>
              <label htmlFor="agent-soul-md" className="block text-sm font-medium mb-2">SOUL.md - Agent Personality & Identity</label>
              <textarea id="agent-soul-md" value={form.soul_md} onChange={(e) => setForm({ ...form, soul_md: e.target.value })} rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# Agent Name&#10;&#10;Define this agent's personality..." />
            </div>
          )}
          {activeTab === 'user' && (
            <div>
              <label htmlFor="agent-user-md" className="block text-sm font-medium mb-2">USER.md - Context About the Human</label>
              <textarea id="agent-user-md" value={form.user_md} onChange={(e) => setForm({ ...form, user_md: e.target.value })} rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# User Context&#10;&#10;Info about the human..." />
            </div>
          )}
          {activeTab === 'agents' && (
            <div>
              <label htmlFor="agent-agents-md" className="block text-sm font-medium mb-2">AGENTS.md - Team Awareness</label>
              <textarea id="agent-agents-md" value={form.agents_md} onChange={(e) => setForm({ ...form, agents_md: e.target.value })} rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# Team Roster&#10;&#10;Info about other agents..." />
            </div>
          )}
        </form>

        {error && <div className="mx-4 p-3 bg-mc-accent-red/10 text-mc-accent-red border border-mc-accent-red/20 rounded text-sm">{error}</div>}

        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <div>
            {agent && (
              <button type="button" onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-mc-accent-red hover:bg-mc-accent-red/10 rounded text-sm">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text">Cancel</button>
            <button onClick={handleSubmit} disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50">
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
