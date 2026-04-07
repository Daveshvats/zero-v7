/**
 * Poll an async function until it returns { done: true } or times out.
 * @param {Function} fn - async (attempt) => { done, value?, error? }
 * @param {Object} options
 * @param {number} options.intervalMs - default 4000
 * @param {number} options.maxAttempts - default 35
 * @param {string} options.label - for error messages
 * @returns {Promise<any>} - the value when done
 */
export async function pollUntil(fn, { intervalMs = 4000, maxAttempts = 35, label = 'task' } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn(attempt);
    if (result.error) throw new Error(`${label}: ${result.error}`);
    if (result.done) return result.value;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`${label} timed out after ${(maxAttempts * intervalMs / 1000).toFixed(0)}s`);
}
