'use client';

import { useState } from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Event } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

type FeedFilter = 'all' | 'tasks' | 'agents';

export function LiveFeed() {
  const { events } = useMissionControl();
  const [filter, setFilter] = useState<FeedFilter>('all');

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'tasks') return ['task_created', 'task_assigned', 'task_status_changed', 'task_completed'].includes(event.type);
    if (filter === 'agents') return ['agent_joined', 'agent_status_changed', 'message_sent'].includes(event.type);
    return true;
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created': return '📋';
      case 'task_assigned': return '👤';
      case 'task_status_changed': return '🔄';
      case 'task_completed': return '✅';
      case 'message_sent': return '💬';
      case 'agent_joined': return '🎉';
      case 'agent_status_changed': return '🔔';
      case 'system': return '⚙️';
      default: return '📌';
    }
  };

  return (
    <aside className="w-80 bg-mc-bg-secondary border-l border-mc-border flex flex-col">
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center gap-2 mb-3">
          <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
          <span className="text-sm font-medium uppercase tracking-wider">Live Feed</span>
        </div>
        <div className="flex gap-1">
          {(['all', 'tasks', 'agents'] as FeedFilter[]).map((tab) => (
            <button key={tab} onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs rounded uppercase ${
                filter === tab ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-mc-text-secondary text-sm">No events yet</div>
        ) : (
          filteredEvents.map((event) => <EventItem key={event.id} event={event} getEventIcon={getEventIcon} />)
        )}
      </div>
    </aside>
  );
}

function EventItem({ event, getEventIcon }: { event: Event; getEventIcon: (type: string) => string }) {
  const isTaskEvent = ['task_created', 'task_assigned', 'task_completed'].includes(event.type);
  const isHighlight = event.type === 'task_created' || event.type === 'task_completed';

  return (
    <div className={`p-2 rounded border-l-2 animate-slide-in ${
      isHighlight ? 'bg-mc-bg-tertiary border-mc-accent-pink' : 'bg-transparent border-transparent hover:bg-mc-bg-tertiary'
    }`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{getEventIcon(event.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isTaskEvent ? 'text-mc-accent-pink' : 'text-mc-text'}`}>{event.message}</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-mc-text-secondary">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}
