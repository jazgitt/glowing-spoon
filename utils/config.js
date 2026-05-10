// Mutable config singleton — safe to mutate before first callClaude() call.
// Test scripts set config.dryRun = true after importing this module.
export const config = {
  dryRun: false,
};
