import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = process.env.MISSION_CONTROL_URL;

  beforeEach(() => {
    // Reset module cache to re-evaluate imports
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MISSION_CONTROL_URL = originalEnv;
    } else {
      delete process.env.MISSION_CONTROL_URL;
    }
  });

  describe('getMissionControlUrl', () => {
    it('returns env variable when set', async () => {
      process.env.MISSION_CONTROL_URL = 'http://custom:4000';
      const { getMissionControlUrl } = await import('@/lib/config');
      expect(getMissionControlUrl()).toBe('http://custom:4000');
    });

    it('returns localhost:3000 as default', async () => {
      process.env.MISSION_CONTROL_URL = '';
      const { getMissionControlUrl } = await import('@/lib/config');
      // Empty string is falsy so should fall back to default
      expect(getMissionControlUrl()).toBe('http://localhost:3000');
    });
  });
});
