// Diagnostic logger — writes to stderr, only when GLOWING_DEBUG=true.
// All user-facing output goes through utils/output.js instead.
export function log(level, tenantId, message, data = {}) {
  if (process.env.GLOWING_DEBUG !== 'true') return;
  console.error(JSON.stringify({
    level, tenantId, message, ...data,
    ts: new Date().toISOString(),
  }));
}
