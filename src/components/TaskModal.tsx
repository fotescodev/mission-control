'use client';

import { useState } from 'react';
import { X, Save, Trash2, Activity, Package, ClipboardList, Zap, Users } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { ActivityLog } from './ActivityLog';
import { DeliverablesList } from './DeliverablesList';
import { AgentModal } from './AgentModal';
import { DispatchPanel } from './DispatchPanel';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

type TabType = 'overview' | 'planning' | 'activity' | 'deliverables';

interface TaskModalProps {
  task?: Task;
  onClose: () => void;
  workspaceId?: string;
}

export function TaskModal({ task, onClose, workspaceId }: TaskModalProps) {
  const { agents, addTask, updateTask, addEvent } = useMissionControl();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(task?.status === 'planning' ? 'planning' : 'overview');

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'normal' as TaskPriority,
    status: task?.status || 'inbox' as TaskStatus,
    assigned_agent_id: task?.assigned_agent_id || '',
    due_date: task?.due_date || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
      const method = task ? 'PATCH' : 'POST';
      const payload = {
        ...form,
        assigned_agent_id: form.assigned_agent_id || null,
        due_date: form.due_date || null,
        workspace_id: workspaceId || task?.workspace_id || 'default',
      };
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const savedTask = await res.json();
        if (task) {
          updateTask(savedTask);
        } else {
          addTask(savedTask);
          addEvent({
            id: crypto.randomUUID(), type: 'task_created', task_id: savedTask.id,
            message: `New task: ${savedTask.title}`, created_at: new Date().toISOString(),
          });
        }
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save task');
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      setError('Network error: Failed to save task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        useMissionControl.setState((state) => ({ tasks: state.tasks.filter((t) => t.id !== task.id) }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      setError('Failed to delete task.');
    }
  };

  const canDispatch = task && task.assigned_agent_id && task.status !== 'in_progress' && task.status !== 'done';

  const statuses: TaskStatus[] = ['planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'];
  const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

  // Parse dispatch metadata if available
  const dispatchMeta = task?.dispatch_metadata ? (() => {
    try { return JSON.parse(task.dispatch_metadata); } catch { return null; }
  })() : null;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: null },
    { id: 'planning' as TabType, label: 'Planning', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'activity' as TabType, label: 'Activity', icon: <Activity className="w-4 h-4" /> },
    { id: 'deliverables' as TabType, label: 'Deliverables', icon: <Package className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-mc-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{task ? task.title : 'Create New Task'}</h2>
            {task?.dispatch_mode && (
              <DispatchBadge mode={task.dispatch_mode} meta={dispatchMeta} />
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-mc-bg-tertiary rounded"><X className="w-5 h-5" /></button>
        </div>

        {task && (
          <div className="flex border-b border-mc-border flex-shrink-0">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'text-mc-accent border-b-2 border-mc-accent' : 'text-mc-text-secondary hover:text-mc-text'
                }`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="task-title" className="block text-sm font-medium mb-1">Title</label>
                <input id="task-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                  placeholder="What needs to be done?" />
              </div>
              <div>
                <label htmlFor="task-description" className="block text-sm font-medium mb-1">Description</label>
                <textarea id="task-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
                  placeholder="Add details..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-status" className="block text-sm font-medium mb-1">Status</label>
                  <select id="task-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                    className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent">
                    {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-priority" className="block text-sm font-medium mb-1">Priority</label>
                  <select id="task-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                    className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent">
                    {priorities.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="task-assigned-agent" className="block text-sm font-medium mb-1">Assign to</label>
                <select id="task-assigned-agent" value={form.assigned_agent_id}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') setShowAgentModal(true);
                    else setForm({ ...form, assigned_agent_id: e.target.value });
                  }}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent">
                  <option value="">Unassigned</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.avatar_emoji} {agent.name} - {agent.role}</option>)}
                  <option value="__add_new__">+ Add new agent...</option>
                </select>
              </div>
              <div>
                <label htmlFor="task-due-date" className="block text-sm font-medium mb-1">Due Date</label>
                <input id="task-due-date" type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent" />
              </div>

              {/* Dispatch Panel — embedded in overview form */}
              {canDispatch && (
                <DispatchPanel
                  task={task!}
                  onDispatch={() => setActiveTab('activity')}
                />
              )}
            </form>
          )}
          {activeTab === 'planning' && task && (
            <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm">Planning mode - AI Q&A flow coming soon</p>
              <p className="text-xs mt-2">Use Dispatch Panel to send to Claude for planning</p>
            </div>
          )}
          {activeTab === 'activity' && task && (
            <ActivityLog taskId={task.id} autoRefresh={task.status === 'in_progress'} dispatchMeta={dispatchMeta} />
          )}
          {activeTab === 'deliverables' && task && <DeliverablesList taskId={task.id} />}
        </div>

        {error && <div className="mx-4 p-3 bg-mc-accent-red/10 text-mc-accent-red border border-mc-accent-red/20 rounded text-sm">{error}</div>}

        {activeTab === 'overview' && (
          <div className="flex items-center justify-between p-4 border-t border-mc-border flex-shrink-0">
            <div className="flex items-center gap-2">
              {task && (
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
        )}
      </div>

      {showAgentModal && (
        <AgentModal workspaceId={workspaceId} onClose={() => setShowAgentModal(false)}
          onAgentCreated={(agentId) => { setForm({ ...form, assigned_agent_id: agentId }); setShowAgentModal(false); }} />
      )}
    </div>
  );
}

/** Badge showing dispatch mode (solo/team) on the task header */
function DispatchBadge({ mode, meta }: { mode: string; meta: Record<string, unknown> | null }) {
  if (mode === 'team') {
    const teammateCount = Array.isArray(meta?.teammates) ? (meta.teammates as unknown[]).length : 0;
    return (
      <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 bg-mc-accent-purple/15 text-mc-accent-purple border border-mc-accent-purple/30 rounded-full font-medium">
        <Users className="w-3 h-3" />
        Team ({1 + teammateCount})
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 bg-mc-accent-green/15 text-mc-accent-green border border-mc-accent-green/30 rounded-full font-medium">
      <Zap className="w-3 h-3" />
      Solo
    </span>
  );
}
