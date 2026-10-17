import { analyzeCsvBuffer, analyzeMatrix } from './analyze.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../analysis.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) entry.resolve(result); else entry.reject(new Error(error));
    };
    worker.onerror = () => {
      // Worker failed to start (blocked or unsupported): fall back to the main thread.
      for (const [, entry] of pending) entry.fallback();
      pending.clear();
      worker.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function runDirect(payload) {
  return payload.kind === 'csv'
    ? analyzeCsvBuffer(payload.buffer, payload.options)
    : analyzeMatrix(payload.matrix, payload.options, payload.source);
}

/**
 * payload: { kind: 'csv', buffer, options } | { kind: 'matrix', matrix, options, source }
 * Runs in a Web Worker when available, otherwise on the main thread.
 */
export function runAnalysis(payload) {
  const active = getWorker();
  if (!active) {
    return new Promise((resolve, reject) => {
      try { resolve(runDirect(payload)); } catch (error) { reject(error); }
    });
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      resolve,
      reject,
      fallback: () => {
        try { resolve(runDirect(payload)); } catch (error) { reject(error); }
      }
    });
    active.postMessage({ id, ...payload });
  });
}
