'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Users, Crown, RefreshCw, FileEdit, FileText, Terminal, Search, MessageSquare, GitBranch } from 'lucide-react';
import type { TaskActivity } from '@/lib/types';

interface ActivityLogProps {
  taskId: string;
  autoRefresh?: boolean;
  dispatchMeta?: Record<string, unknown> | null;
}

export function ActivityLog({ taskId, autoRefresh = false, dispatchMeta }: ActivityLogProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
        // Auto-scroll when new activities arrive
        if (data.length > lastCountRef.current) {
          lastCountRef.current = data.length;
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Auto-refresh when task is in_progress
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchActivities, 3000);
    return () => clearInterval(interval);
  }, [fetchActivities, autoRefresh]);

  const isTeamMode = dispatchMeta && Array.isArray(dispatchMeta.teammates);
  const leadAgent = dispatchMeta?.leadAgent as { id?: string; name?: string } | undefined;
  const teammates = (isTeamMode ? dispatchMeta.teammates : []) as Array<{ id: string; name: string; role: string }>;

  // Map agent IDs to team roles for color-coding
  const agentTeamRole = new Map<string, 'lead' | 'teammate'>();
  if (leadAgent?.id) agentTeamRole.set(leadAgent.id, 'lead');
  teammates.forEach(t => agentTeamRole.set(t.id, 'teammate'));

  const getActivityIcon = (type: string, message: string) => {
    // Team-specific icons
    if (type === 'team_formed') return <Users className="w-4 h-4 text-mc-accent-purple" />;
    if (type === 'teammate_joined') return <Crown className="w-4 h-4 text-mc-accent-yellow" />;
    if (type === 'teammate_message') return <MessageSquare className="w-4 h-4 text-mc-accent-purple" />;

    // Tool-specific icons based on message content
    if (message.startsWith('Editing file:')) return <FileEdit className="w-4 h-4 text-mc-accent-yellow" />;
    if (message.startsWith('Writing file:')) return <FileText className="w-4 h-4 text-mc-accent-green" />;
    if (message.startsWith('Reading file:')) return <FileText className="w-4 h-4 text-mc-accent" />;
    if (message.startsWith('Running:')) return <Terminal className="w-4 h-4 text-mc-accent-cyan" />;
    if (message.startsWith('Searching for:')) return <Search className="w-4 h-4 text-mc-accent" />;
    if (message.startsWith('Team action:') || message.startsWith('Subagent:')) return <GitBranch className="w-4 h-4 text-mc-accent-purple" />;
    if (message.startsWith('Agent Team:')) return <Users className="w-4 h-4 text-mc-accent-purple" />;
    if (message.startsWith('Message to')) return <MessageSquare className="w-4 h-4 text-mc-accent" />;

    // Default icons by activity type
    switch (type) {
      case 'spawned': return <span className="text-lg leading-none">&#x1F680;</span>;
      case 'completed': return <span className="text-lg leading-none">&#x2705;</span>;
      case 'file_created': return <FileText className="w-4 h-4 text-mc-accent-green" />;
      case 'status_changed': return <RefreshCw className="w-4 h-4 text-mc-accent-yellow" />;
      default: return <span className="text-lg leading-none">&#x270F;&#xFE0F;</span>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const getAgentBorderColor = (agentId?: string) => {
    if (!agentId || !isTeamMode) return 'border-mc-border';
    const role = agentTeamRole.get(agentId);
    if (role === 'lead') return 'border-mc-accent-yellow/40';
    if (role === 'teammate') return 'border-mc-accent-purple/40';
    return 'border-mc-border';
  };

  if (loading) return <div className="flex items-center justify-center py-8"><div className="text-mc-text-secondary">Loading activities...</div></div>;

  return (
    <div className="space-y-2">
      {/* Team header */}
      {isTeamMode && (
        <div className="p-3 bg-mc-accent-purple/5 border border-mc-accent-purple/20 rounded-lg mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-mc-accent-purple" />
            <span className="text-sm font-medium text-mc-accent-purple">Agent Team</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {leadAgent?.name && (
              <span className="flex items-center gap-1.5 text-xs px-2 py-1 bg-mc-accent-yellow/10 border border-mc-accent-yellow/30 rounded-full text-mc-accent-yellow">
                <Crown className="w-3 h-3" />
                {leadAgent.name}
                <span className="text-[10px] opacity-60">lead</span>
              </span>
            )}
            {teammates.map((t) => (
              <span key={t.id} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-mc-accent-purple/10 border border-mc-accent-purple/30 rounded-full text-mc-accent-purple">
                {t.name}
                <span className="text-[10px] opacity-60">{t.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {autoRefresh && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-mc-text-secondary">
          <div className="w-2 h-2 bg-mc-accent-green rounded-full animate-pulse" />
          Live — refreshing every 3s
        </div>
      )}

      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
          <div className="text-4xl mb-2">&#x1F4DD;</div>
          <p className="text-sm">No activity yet</p>
          {!autoRefresh && <p className="text-xs mt-1">Dispatch the task to see agent activity here</p>}
        </div>
      ) : (
        activities.map((activity) => (
          <div
            key={activity.id}
            className={`flex gap-3 p-3 bg-mc-bg rounded-lg border ${getAgentBorderColor(activity.agent_id)} animate-slide-in`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getActivityIcon(activity.activity_type, activity.message)}
            </div>
            <div className="flex-1 min-w-0">
              {activity.agent && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{activity.agent.avatar_emoji}</span>
                  <span className="text-sm font-medium text-mc-text">{activity.agent.name}</span>
                  {isTeamMode && activity.agent_id && (
                    <TeamRoleBadge role={agentTeamRole.get(activity.agent_id)} />
                  )}
                </div>
              )}
              <p className="text-sm text-mc-text break-words whitespace-pre-wrap">{activity.message}</p>
              <div className="text-xs text-mc-text-secondary mt-2">{formatTimestamp(activity.created_at)}</div>
            </div>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function TeamRoleBadge({ role }: { role?: 'lead' | 'teammate' }) {
  if (!role) return null;
  if (role === 'lead') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 bg-mc-accent-yellow/15 text-mc-accent-yellow rounded font-medium">
        LEAD
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 bg-mc-accent-purple/15 text-mc-accent-purple rounded font-medium">
      TEAMMATE
    </span>
  );
}
