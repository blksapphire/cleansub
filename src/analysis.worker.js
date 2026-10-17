import { analyzeCsvBuffer, analyzeMatrix } from './lib/analyze.js';

self.onmessage = (event) => {
  const { id, kind, buffer, matrix, options, source } = event.data;
  try {
    const result = kind === 'csv'
      ? analyzeCsvBuffer(buffer, options)
      : analyzeMatrix(matrix, options, source);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Analysis failed.' });
  }
};
