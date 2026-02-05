export function getMissionControlUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.MISSION_CONTROL_URL || 'http://localhost:3000';
  }
  return window.location.origin;
}
