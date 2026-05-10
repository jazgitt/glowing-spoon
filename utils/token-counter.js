// Rough token estimator: ~4 chars per token (industry standard approximation).
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

// Trim oldest conversation history entries to fit within budget tokens.
// Always keeps the most recent entries; never trims system prompt content.
export function trimToFit({ history, budget }) {
  if (!history || history.length === 0) return [];

  let current = [...history];
  while (current.length > 2) {
    const used = estimateTokens(JSON.stringify(current));
    if (used <= budget) break;
    // Remove oldest pair (user + assistant)
    current = current.slice(2);
  }
  return current;
}
