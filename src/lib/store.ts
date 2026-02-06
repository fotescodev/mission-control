'use client';

import { create } from 'zustand';
import type { Agent, Task, Event, TaskStatus } from './types';

interface MissionControlState {
  agents: Agent[];
  tasks: Task[];
  events: Event[];
  selectedAgent: Agent | null;
  selectedTask: Task | null;
  isOnline: boolean;
  isLoading: boolean;

  setAgents: (agents: Agent[]) => void;
  setTasks: (tasks: Task[]) => void;
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  setSelectedAgent: (agent: Agent | null) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsOnline: (online: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTask: (task: Task) => void;
  addTask: (task: Task) => void;
  updateAgent: (agent: Agent) => void;
  addAgent: (agent: Agent) => void;
}

export const useMissionControl = create<MissionControlState>((set) => ({
  agents: [],
  tasks: [],
  events: [],
  selectedAgent: null,
  selectedTask: null,
  isOnline: false,
  isLoading: true,

  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, 100) })),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsOnline: (online) => set({ isOnline: online }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  updateTaskStatus: (taskId, status) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      ),
    })),
  updateTask: (updatedTask) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      ),
    })),
  addTask: (task) =>
    set((state) => {
      if (state.tasks.some((t) => t.id === task.id)) return state;
      return { tasks: [task, ...state.tasks] };
    }),
  updateAgent: (updatedAgent) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === updatedAgent.id ? updatedAgent : agent
      ),
    })),
  addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
}));
