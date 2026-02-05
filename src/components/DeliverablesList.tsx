'use client';

import { useEffect, useState } from 'react';
import { FileText, Link as LinkIcon, Package, ExternalLink } from 'lucide-react';
import type { TaskDeliverable } from '@/lib/types';

interface DeliverablesListProps {
  taskId: string;
}

export function DeliverablesList({ taskId }: DeliverablesListProps) {
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/deliverables`);
        if (res.ok) setDeliverables(await res.json());
      } catch (error) {
        console.error('Failed to load deliverables:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  const getDeliverableIcon = (type: string) => {
    switch (type) {
      case 'file': return <FileText className="w-5 h-5" />;
      case 'url': return <LinkIcon className="w-5 h-5" />;
      case 'artifact': return <Package className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><div className="text-mc-text-secondary">Loading deliverables...</div></div>;
  if (deliverables.length === 0) return <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary"><div className="text-4xl mb-2">📦</div><p>No deliverables yet</p></div>;

  return (
    <div className="space-y-3">
      {deliverables.map((deliverable) => (
        <div key={deliverable.id} className="flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border hover:border-mc-accent transition-colors">
          <div className="flex-shrink-0 text-mc-accent">{getDeliverableIcon(deliverable.deliverable_type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {deliverable.deliverable_type === 'url' && deliverable.path ? (
                <a href={deliverable.path} target="_blank" rel="noopener noreferrer"
                  className="font-medium text-mc-accent hover:text-mc-accent/80 hover:underline flex items-center gap-1.5">
                  {deliverable.title} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <h4 className="font-medium text-mc-text">{deliverable.title}</h4>
              )}
            </div>
            {deliverable.description && <p className="text-sm text-mc-text-secondary mt-1">{deliverable.description}</p>}
            {deliverable.path && (
              <div className="mt-2 p-2 bg-mc-bg-tertiary rounded text-xs text-mc-text-secondary font-mono break-all">{deliverable.path}</div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-mc-text-secondary">
              <span className="capitalize">{deliverable.deliverable_type}</span>
              <span>•</span>
              <span>{new Date(deliverable.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
