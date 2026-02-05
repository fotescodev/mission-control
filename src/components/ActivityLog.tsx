'use client';

import { useEffect, useState } from 'react';
import type { TaskActivity } from '@/lib/types';

interface ActivityLogProps {
  taskId: string;
}

export function ActivityLog({ taskId }: ActivityLogProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/activities`);
        if (res.ok) setActivities(await res.json());
      } catch (error) {
        console.error('Failed to load activities:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'spawned': return '🚀';
      case 'updated': return '✏️';
      case 'completed': return '✅';
      case 'file_created': return '📄';
      case 'status_changed': return '🔄';
      default: return '📝';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (loading) return <div className="flex items-center justify-center py-8"><div className="text-mc-text-secondary">Loading activities...</div></div>;
  if (activities.length === 0) return <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary"><div className="text-4xl mb-2">📝</div><p>No activity yet</p></div>;

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border">
          <div className="text-2xl flex-shrink-0">{getActivityIcon(activity.activity_type)}</div>
          <div className="flex-1 min-w-0">
            {activity.agent && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{activity.agent.avatar_emoji}</span>
                <span className="text-sm font-medium text-mc-text">{activity.agent.name}</span>
              </div>
            )}
            <p className="text-sm text-mc-text break-words">{activity.message}</p>
            <div className="text-xs text-mc-text-secondary mt-2">{formatTimestamp(activity.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
