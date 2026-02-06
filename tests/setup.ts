/**
 * Test setup — runs before every test file.
 * Sets up an in-memory SQLite database for isolated tests.
 */

import { vi } from 'vitest';

// Ensure tests don't accidentally hit real Mission Control
process.env.MISSION_CONTROL_URL = 'http://localhost:3000';
process.env.DATABASE_PATH = ':memory:';

// Mock fetch globally for runner tests
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
});
