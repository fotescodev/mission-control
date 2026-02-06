'use client';

import { useState } from 'react';
import { Plus, ChevronRight, GripVertical, Zap, Users } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, TaskStatus } from '@/lib/types';
import { TaskModal } from './TaskModal';
import { formatDistanceToNow } from 'date-fns';

interface MissionQueueProps {
  workspaceId?: string;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'planning', label: 'PLANNING', color: 'border-t-mc-accent-purple' },
  { id: 'inbox', label: 'INBOX', color: 'border-t-mc-accent-pink' },
  { id: 'assigned', label: 'ASSIGNED', color: 'border-t-mc-accent-yellow' },
  { id: 'in_progress', label: 'IN PROGRESS', color: 'border-t-mc-accent' },
  { id: 'testing', label: 'TESTING', color: 'border-t-mc-accent-cyan' },
  { id: 'review', label: 'REVIEW', color: 'border-t-mc-accent-purple' },
  { id: 'done', label: 'DONE', color: 'border-t-mc-accent-green' },
];

export function MissionQueue({ workspaceId }: MissionQueueProps) {
  const { tasks, updateTaskStatus, addEvent } = useMissionControl();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const getTasksByStatus = (status: TaskStatus) => tasks.filter((task) => task.status === status);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }
    updateTaskStatus(draggedTask.id, targetStatus);
    try {
      const res = await fetch(`/api/tasks/${draggedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        addEvent({
          id: crypto.randomUUID(),
          type: targetStatus === 'done' ? 'task_completed' : 'task_status_changed',
          task_id: draggedTask.id,
          message: `Task "${draggedTask.title}" moved to ${targetStatus}`,
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      updateTaskStatus(draggedTask.id, draggedTask.status);
    }
    setDraggedTask(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-mc-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
          <span className="text-sm font-medium uppercase tracking-wider">Mission Queue</span>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent-pink text-mc-bg rounded text-sm font-medium hover:bg-mc-accent-pink/90">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      <div className="flex-1 flex gap-3 p-3 overflow-x-auto">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          return (
            <div key={column.id}
              className={`flex-1 min-w-[220px] max-w-[300px] flex flex-col bg-mc-bg rounded-lg border border-mc-border/50 border-t-2 ${column.color}`}
              onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, column.id)}>
              <div className="p-2 border-b border-mc-border flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-mc-text-secondary">{column.label}</span>
                <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{columnTasks.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onDragStart={handleDragStart}
                    onClick={() => setEditingTask(task)} isDragging={draggedTask?.id === task.id} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showCreateModal && <TaskModal onClose={() => setShowCreateModal(false)} workspaceId={workspaceId} />}
      {editingTask && <TaskModal task={editingTask} onClose={() => setEditingTask(null)} workspaceId={workspaceId} />}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onClick: () => void;
  isDragging: boolean;
}

const priorityStyles = { low: 'text-mc-text-secondary', normal: 'text-mc-accent', high: 'text-mc-accent-yellow', urgent: 'text-mc-accent-red' };
const priorityDots = { low: 'bg-mc-text-secondary/40', normal: 'bg-mc-accent', high: 'bg-mc-accent-yellow', urgent: 'bg-mc-accent-red' };

function TaskCard({ task, onDragStart, onClick, isDragging }: TaskCardProps) {
  const isPlanning = task.status === 'planning';
  const isInProgress = task.status === 'in_progress';
  const isTeam = task.dispatch_mode === 'team';
  const isSolo = task.dispatch_mode === 'solo';

  // Parse dispatch metadata for teammate count
  let teammateCount = 0;
  if (isTeam && task.dispatch_metadata) {
    try {
      const meta = JSON.parse(task.dispatch_metadata);
      teammateCount = Array.isArray(meta.teammates) ? meta.teammates.length : 0;
    } catch { /* ignore */ }
  }

  return (
    <div draggable onDragStart={(e) => onDragStart(e, task)} onClick={onClick}
      className={`group bg-mc-bg-secondary border rounded-lg cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20 ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${isPlanning ? 'border-purple-500/40 hover:border-purple-500' : isInProgress && isTeam ? 'border-mc-accent-purple/40 hover:border-mc-accent-purple' : isInProgress ? 'border-mc-accent-green/40 hover:border-mc-accent-green' : 'border-mc-border/50 hover:border-mc-accent/40'}`}>
      <div className="flex items-center justify-center py-1.5 border-b border-mc-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-mc-text-secondary/50 cursor-grab" />
      </div>
      <div className="p-4">
        <h4 className="text-sm font-medium leading-snug line-clamp-2 mb-3">{task.title}</h4>

        {/* In-progress indicator with dispatch mode */}
        {isInProgress && (isTeam || isSolo) && (
          <div className={`flex items-center gap-2 mb-3 py-2 px-3 rounded-md border ${
            isTeam
              ? 'bg-mc-accent-purple/10 border-mc-accent-purple/20'
              : 'bg-mc-accent-green/10 border-mc-accent-green/20'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${
              isTeam ? 'bg-mc-accent-purple' : 'bg-mc-accent-green'
            }`} />
            {isTeam ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-mc-accent-purple">
                <Users className="w-3 h-3" /> Team ({1 + teammateCount})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-mc-accent-green">
                <Zap className="w-3 h-3" /> Working...
              </span>
            )}
          </div>
        )}

        {isPlanning && (
          <div className="flex items-center gap-2 mb-3 py-2 px-3 bg-purple-500/10 rounded-md border border-purple-500/20">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs text-purple-400 font-medium">Continue planning</span>
          </div>
        )}
        {task.assigned_agent && (
          <div className="flex items-center gap-2 mb-3 py-1.5 px-2 bg-mc-bg-tertiary/50 rounded">
            <span className="text-base">{task.assigned_agent?.avatar_emoji}</span>
            <span className="text-xs text-mc-text-secondary truncate">{task.assigned_agent?.name}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-mc-border/20">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${priorityDots[task.priority]}`} />
            <span className={`text-xs capitalize ${priorityStyles[task.priority]}`}>{task.priority}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Dispatch mode badge (for completed/review tasks) */}
            {!isInProgress && (isTeam || isSolo) && (
              <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                isTeam
                  ? 'bg-mc-accent-purple/15 text-mc-accent-purple'
                  : 'bg-mc-accent-green/15 text-mc-accent-green'
              }`}>
                {isTeam ? <Users className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
                {isTeam ? 'team' : 'solo'}
              </span>
            )}
            <span className="text-[10px] text-mc-text-secondary/60">
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
