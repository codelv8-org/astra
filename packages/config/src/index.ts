export const defaults = {
  maxReworkAttempts: 2,
  maxConcurrentWritersPerWorkspace: 1,
  executionTimeoutSeconds: 120,
  maxEventBytes: 32768,
  maxRunLogBytes: 2_000_000,
} as const;
