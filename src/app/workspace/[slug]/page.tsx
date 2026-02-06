'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { MissionQueue } from '@/components/MissionQueue';
import { LiveFeed } from '@/components/LiveFeed';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import type { Workspace } from '@/lib/types';

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;

  const { setAgents, setTasks, setEvents, setIsOnline, setIsLoading, isLoading } = useMissionControl();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);

  useSSE();

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          setWorkspace(await res.json());
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch {
        setNotFound(true);
        setIsLoading(false);
      }
    }
    loadWorkspace();
  }, [slug, setIsLoading]);

  useEffect(() => {
    if (!workspace) return;
    const workspaceId = workspace.id;

    async function loadData() {
      try {
        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspaceId}`),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    setIsOnline(true);
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🧠</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} />
      <div className="flex-1 flex overflow-hidden">
        <AgentsSidebar workspaceId={workspace.id} />
        <MissionQueue workspaceId={workspace.id} />
        <LiveFeed />
      </div>
    </div>
  );
}
