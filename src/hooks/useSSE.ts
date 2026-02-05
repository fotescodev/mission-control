'use client';

import { useEffect, useRef } from 'react';
import { useMissionControl } from '@/lib/store';
import type { SSEEvent, Task } from '@/lib/types';

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { updateTask, addTask, setIsOnline, selectedTask, setSelectedTask } = useMissionControl();

  useEffect(() => {
    let isConnecting = false;

    const connect = () => {
      if (isConnecting || eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      isConnecting = true;
      const eventSource = new EventSource('/api/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsOnline(true);
        isConnecting = false;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      eventSource.onmessage = (event) => {
        try {
          if (event.data.startsWith(':')) return;
          const sseEvent: SSEEvent = JSON.parse(event.data);

          switch (sseEvent.type) {
            case 'task_created':
              addTask(sseEvent.payload as Task);
              break;
            case 'task_updated': {
              const incomingTask = sseEvent.payload as Task;
              updateTask(incomingTask);
              if (selectedTask?.id === incomingTask.id) {
                setSelectedTask(incomingTask);
              }
              break;
            }
          }
        } catch (error) {
          console.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = () => {
        setIsOnline(false);
        isConnecting = false;
        eventSource.close();
        eventSourceRef.current = null;
        reconnectTimeoutRef.current = setTimeout(() => connect(), 5000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [addTask, updateTask, setIsOnline, selectedTask, setSelectedTask]);
}
