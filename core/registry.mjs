export function createHarnessRegistry(initial = []) {
  const harnesses = new Map();

  function register(harness) {
    if (!harness?.id || typeof harness.execute !== 'function') throw new Error('Harness requires id and execute(context)');
    if (harnesses.has(harness.id)) throw new Error(`Harness already registered: ${harness.id}`);
    harnesses.set(harness.id, Object.freeze({ ...harness, consumes: [...(harness.consumes || [])], produces: [...(harness.produces || [])] }));
    return harnesses.get(harness.id);
  }

  function get(id) { return harnesses.get(id) || null; }

  function resolveFor(eventType) {
    return [...harnesses.values()].filter(harness => harness.consumes.length === 0 || harness.consumes.includes(eventType));
  }

  function list() { return [...harnesses.values()].map(harness => ({ id: harness.id, version: harness.version || 1, consumes: harness.consumes, produces: harness.produces })); }
  for (const harness of initial) register(harness);
  return { register, get, resolveFor, list };
}
