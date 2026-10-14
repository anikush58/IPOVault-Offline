/**
 * Lightweight, privacy-safe performance metrics and diagnostic timers.
 * 
 * Strict safety rules:
 * - NEVER log or store PANs, bank account numbers, credentials, auth tokens, or PII.
 * - Only records operation names, durations (ms), record counts, and status indicators.
 */

export interface PerfMetric {
  id: string;
  tag: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';
const MAX_METRICS_HISTORY = 100;
const metricsHistory: PerfMetric[] = [];

/**
 * Records a measured duration with privacy-safe metadata.
 */
export function recordMetric(
  tag: string,
  durationMs: number,
  metadata?: Record<string, string | number | boolean | null>
): PerfMetric {
  const roundedDuration = Math.round(durationMs * 100) / 100;
  const metric: PerfMetric = {
    id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tag,
    durationMs: roundedDuration,
    timestamp: new Date().toISOString(),
    metadata,
  };

  metricsHistory.unshift(metric);
  if (metricsHistory.length > MAX_METRICS_HISTORY) {
    metricsHistory.pop();
  }

  if (isDev) {
    const metaStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
    console.log(`[Perf:${tag}] ${roundedDuration}ms${metaStr}`);
  }

  return metric;
}

/**
 * Starts a timer using performance.now() and returns a function to stop and record it.
 */
export function startPerfTimer(
  tag: string,
  initialMeta?: Record<string, string | number | boolean | null>
): (extraMeta?: Record<string, string | number | boolean | null>) => PerfMetric {
  const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  return (extraMeta?: Record<string, string | number | boolean | null>) => {
    const end = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const duration = end - start;
    const combinedMeta = {
      ...(initialMeta || {}),
      ...(extraMeta || {}),
    };
    return recordMetric(tag, duration, combinedMeta);
  };
}

/**
 * Retrieves in-memory performance measurements for inspection or benchmarking.
 */
export function getRecentMetrics(limit = 20): PerfMetric[] {
  return metricsHistory.slice(0, limit);
}

/**
 * Clears metrics history (useful during benchmark test runs).
 */
export function clearMetrics(): void {
  metricsHistory.length = 0;
}
