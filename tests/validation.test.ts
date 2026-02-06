import { describe, it, expect } from 'vitest';
import {
  isNonEmptyString,
  isOptionalString,
  isValidId,
  isStringArray,
  isValidTaskStatus,
  isValidPriority,
  isValidAgentStatus,
  isValidDeliverableType,
  isValidEventType,
  isValidModel,
  isPositiveInt,
  clampInt,
  isValidCwd,
  normalizeOptionalString,
  safeParseJSON,
} from '@/lib/validation';

describe('validation utilities', () => {
  describe('isNonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  hello  ')).toBe(true);
    });

    it('rejects empty and whitespace-only strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('  \n\t  ')).toBe(false);
    });

    it('rejects non-string types', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(42)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
    });
  });

  describe('isOptionalString', () => {
    it('accepts strings, null, undefined', () => {
      expect(isOptionalString('hello')).toBe(true);
      expect(isOptionalString('')).toBe(true);
      expect(isOptionalString(null)).toBe(true);
      expect(isOptionalString(undefined)).toBe(true);
    });

    it('rejects non-string types', () => {
      expect(isOptionalString(42)).toBe(false);
      expect(isOptionalString({})).toBe(false);
    });
  });

  describe('isValidId', () => {
    it('accepts UUID-like strings', () => {
      expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidId('abc123')).toBe(true);
      expect(isValidId('a')).toBe(true);
    });

    it('rejects invalid IDs', () => {
      expect(isValidId('')).toBe(false);
      expect(isValidId(null)).toBe(false);
      expect(isValidId(undefined)).toBe(false);
      expect(isValidId(123)).toBe(false);
      expect(isValidId('hello world')).toBe(false); // space
      expect(isValidId('test;DROP TABLE')).toBe(false); // SQL injection attempt
      expect(isValidId('a'.repeat(101))).toBe(false); // too long
    });
  });

  describe('isStringArray', () => {
    it('accepts valid string arrays', () => {
      expect(isStringArray([])).toBe(true);
      expect(isStringArray(['a', 'b'])).toBe(true);
    });

    it('rejects non-arrays and arrays with non-strings', () => {
      expect(isStringArray('not array')).toBe(false);
      expect(isStringArray(null)).toBe(false);
      expect(isStringArray([1, 2])).toBe(false);
      expect(isStringArray(['a', 2])).toBe(false);
    });

    it('respects maxLength', () => {
      expect(isStringArray(['a', 'b', 'c'], 2)).toBe(false);
      expect(isStringArray(['a', 'b'], 2)).toBe(true);
    });
  });

  describe('enum validators', () => {
    it('validates task statuses', () => {
      expect(isValidTaskStatus('inbox')).toBe(true);
      expect(isValidTaskStatus('in_progress')).toBe(true);
      expect(isValidTaskStatus('done')).toBe(true);
      expect(isValidTaskStatus('invalid')).toBe(false);
      expect(isValidTaskStatus(null)).toBe(false);
    });

    it('validates priorities', () => {
      expect(isValidPriority('low')).toBe(true);
      expect(isValidPriority('urgent')).toBe(true);
      expect(isValidPriority('critical')).toBe(false);
    });

    it('validates agent statuses', () => {
      expect(isValidAgentStatus('standby')).toBe(true);
      expect(isValidAgentStatus('working')).toBe(true);
      expect(isValidAgentStatus('offline')).toBe(true);
      expect(isValidAgentStatus('busy')).toBe(false);
    });

    it('validates deliverable types', () => {
      expect(isValidDeliverableType('file')).toBe(true);
      expect(isValidDeliverableType('url')).toBe(true);
      expect(isValidDeliverableType('artifact')).toBe(true);
      expect(isValidDeliverableType('image')).toBe(false);
    });

    it('validates event types', () => {
      expect(isValidEventType('task_created')).toBe(true);
      expect(isValidEventType('agent_joined')).toBe(true);
      expect(isValidEventType('random_event')).toBe(false);
    });

    it('validates model names', () => {
      expect(isValidModel('sonnet')).toBe(true);
      expect(isValidModel('opus')).toBe(true);
      expect(isValidModel('haiku')).toBe(true);
      expect(isValidModel('gpt-4')).toBe(false);
      expect(isValidModel('')).toBe(false);
    });
  });

  describe('isPositiveInt', () => {
    it('accepts positive integers', () => {
      expect(isPositiveInt(1)).toBe(true);
      expect(isPositiveInt(100)).toBe(true);
      expect(isPositiveInt('50')).toBe(true);
    });

    it('rejects non-positive or non-integer values', () => {
      expect(isPositiveInt(0)).toBe(false);
      expect(isPositiveInt(-1)).toBe(false);
      expect(isPositiveInt(1.5)).toBe(false);
      expect(isPositiveInt('abc')).toBe(false);
      expect(isPositiveInt(null)).toBe(false);
    });

    it('respects max limit', () => {
      expect(isPositiveInt(1001, 1000)).toBe(false);
      expect(isPositiveInt(1000, 1000)).toBe(true);
    });
  });

  describe('clampInt', () => {
    it('clamps values to range', () => {
      expect(clampInt(5, 10, 1, 100)).toBe(5);
      expect(clampInt(-5, 10, 1, 100)).toBe(1);
      expect(clampInt(999, 10, 1, 100)).toBe(100);
    });

    it('uses default for non-numeric input', () => {
      expect(clampInt('abc', 50, 1, 100)).toBe(50);
      expect(clampInt(null, 50, 1, 100)).toBe(50);
      expect(clampInt(undefined, 50, 1, 100)).toBe(50);
    });

    it('parses string numbers', () => {
      expect(clampInt('25', 10, 1, 100)).toBe(25);
    });
  });

  describe('isValidCwd', () => {
    it('accepts valid absolute paths', () => {
      expect(isValidCwd('/home/user/projects')).toBe(true);
      expect(isValidCwd('/tmp/test')).toBe(true);
      expect(isValidCwd('/home/user/mission-control')).toBe(true);
    });

    it('blocks path traversal', () => {
      expect(isValidCwd('/home/../etc/passwd')).toBe(false);
      expect(isValidCwd('../../etc')).toBe(false);
    });

    it('blocks sensitive directories', () => {
      expect(isValidCwd('/etc')).toBe(false);
      expect(isValidCwd('/etc/nginx')).toBe(false);
      expect(isValidCwd('/var/log')).toBe(false);
      expect(isValidCwd('/usr/bin')).toBe(false);
      expect(isValidCwd('/root')).toBe(false);
      expect(isValidCwd('/proc/1')).toBe(false);
    });

    it('rejects non-absolute paths', () => {
      expect(isValidCwd('relative/path')).toBe(false);
      expect(isValidCwd('./here')).toBe(false);
    });

    it('rejects non-strings', () => {
      expect(isValidCwd(null)).toBe(false);
      expect(isValidCwd(undefined)).toBe(false);
      expect(isValidCwd(42)).toBe(false);
    });
  });

  describe('normalizeOptionalString', () => {
    it('trims and nullifies empty strings', () => {
      expect(normalizeOptionalString('hello')).toBe('hello');
      expect(normalizeOptionalString('  hello  ')).toBe('hello');
      expect(normalizeOptionalString('')).toBe(null);
      expect(normalizeOptionalString('   ')).toBe(null);
    });

    it('returns null for non-string types', () => {
      expect(normalizeOptionalString(null)).toBe(null);
      expect(normalizeOptionalString(undefined)).toBe(null);
      expect(normalizeOptionalString(42)).toBe(null);
    });
  });

  describe('safeParseJSON', () => {
    it('parses valid JSON', () => {
      expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 });
      expect(safeParseJSON('[1,2,3]')).toEqual([1, 2, 3]);
      expect(safeParseJSON('"hello"')).toBe('hello');
    });

    it('returns null for invalid JSON', () => {
      expect(safeParseJSON('{')).toBe(null);
      expect(safeParseJSON('undefined')).toBe(null);
      expect(safeParseJSON('')).toBe(null);
    });
  });
});
