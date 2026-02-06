/**
 * Input validation utilities for API routes.
 * Centralizes validation logic to prevent inconsistent checks across endpoints.
 */

import type { TaskStatus, TaskPriority, AgentStatus, DeliverableType, EventType, DispatchMode } from './types';

// --- Enum validators ---

const VALID_TASK_STATUSES: TaskStatus[] = ['planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'];
const VALID_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const VALID_AGENT_STATUSES: AgentStatus[] = ['standby', 'working', 'offline'];
const VALID_DELIVERABLE_TYPES: DeliverableType[] = ['file', 'url', 'artifact'];
const VALID_EVENT_TYPES: EventType[] = ['task_created', 'task_assigned', 'task_status_changed', 'task_completed', 'message_sent', 'agent_status_changed', 'agent_joined', 'system'];
const VALID_DISPATCH_MODES: DispatchMode[] = ['solo', 'team'];
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

export function isValidTaskStatus(s: unknown): s is TaskStatus {
  return typeof s === 'string' && VALID_TASK_STATUSES.includes(s as TaskStatus);
}

export function isValidPriority(p: unknown): p is TaskPriority {
  return typeof p === 'string' && VALID_PRIORITIES.includes(p as TaskPriority);
}

export function isValidAgentStatus(s: unknown): s is AgentStatus {
  return typeof s === 'string' && VALID_AGENT_STATUSES.includes(s as AgentStatus);
}

export function isValidDeliverableType(t: unknown): t is DeliverableType {
  return typeof t === 'string' && VALID_DELIVERABLE_TYPES.includes(t as DeliverableType);
}

export function isValidEventType(t: unknown): t is EventType {
  return typeof t === 'string' && VALID_EVENT_TYPES.includes(t as EventType);
}

export function isValidDispatchMode(m: unknown): m is DispatchMode {
  return typeof m === 'string' && VALID_DISPATCH_MODES.includes(m as DispatchMode);
}

export function isValidModel(m: unknown): m is string {
  return typeof m === 'string' && VALID_MODELS.includes(m);
}

// --- String validators ---

export function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

export function isOptionalString(val: unknown): val is string | undefined | null {
  return val === undefined || val === null || typeof val === 'string';
}

/** Validate a UUID-like string (hex + dashes, max 100 chars) */
export function isValidId(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= 100 && /^[a-f0-9-]+$/i.test(val);
}

/** Validate string array with max count and item validation */
export function isStringArray(val: unknown, maxLength = 20): val is string[] {
  return Array.isArray(val) && val.length <= maxLength && val.every(item => typeof item === 'string');
}

// --- Numeric validators ---

export function isPositiveInt(val: unknown, max = 1000): val is number {
  if (typeof val === 'number') return Number.isInteger(val) && val > 0 && val <= max;
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    return !isNaN(n) && n > 0 && n <= max;
  }
  return false;
}

export function clampInt(val: unknown, defaultVal: number, min: number, max: number): number {
  const n = typeof val === 'number' ? val : typeof val === 'string' ? parseInt(val, 10) : NaN;
  if (isNaN(n)) return defaultVal;
  return Math.min(Math.max(Math.round(n), min), max);
}

// --- Path validators ---

/** Validate cwd is a safe path (no traversal, within allowed roots) */
export function isValidCwd(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  // Block path traversal
  if (val.includes('..')) return false;
  // Must be absolute
  if (!val.startsWith('/')) return false;
  // Block sensitive directories
  const blocked = ['/etc', '/var', '/usr', '/bin', '/sbin', '/root', '/proc', '/sys', '/dev'];
  if (blocked.some(dir => val === dir || val.startsWith(dir + '/'))) return false;
  return true;
}

// --- Response helpers ---

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(resource = 'Resource') {
  return Response.json({ error: `${resource} not found` }, { status: 404 });
}

export function conflict(message: string) {
  return Response.json({ error: message }, { status: 409 });
}

export function created<T>(data: T) {
  return Response.json(data, { status: 201 });
}

// --- Safe JSON parse ---

export function safeParseJSON<T = unknown>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

// --- Normalize helpers ---

/** Convert empty string to null, trim whitespace */
export function normalizeOptionalString(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}
