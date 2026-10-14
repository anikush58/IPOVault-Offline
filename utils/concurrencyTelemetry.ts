/**
 * Concurrency Telemetry for IPOVault
 *
 * Lightweight, zero-allocation-on-hot-path instrumentation module for measuring:
 * - Active and peak SQLite reads, writes, transactions, and write-queue depth
 * - Queue wait duration vs pure SQLite / network execution duration
 * - SQLITE_BUSY lock retry counts
 * - Active and peak Firestore operations and HTTP requests
 * - Concurrent sync attempts, notification-engine runs, and background polling callbacks
 *
 * Safe for production: verbose logs are strictly disabled in production builds.
 * Sanitized: Never logs user PII, PANs, tokens, or financial records.
 */

export type ConcurrencyCategory =
  | 'SQLITE_READ'
  | 'SQLITE_WRITE'
  | 'SQLITE_TX'
  | 'FIRESTORE_OP'
  | 'HTTP_REQUEST'
  | 'SYNC_TASK'
  | 'NOTIFICATION_RUN'
  | 'BACKGROUND_POLL';

export interface DurationStats {
  count: number;
  totalMs: number;
  maxMs: number;
  avgMs: number;
}

export interface ConcurrencyMetricsSnapshot {
  active: Record<ConcurrencyCategory, number> & { SQLITE_WRITE_QUEUE: number };
  peak: Record<ConcurrencyCategory, number> & { SQLITE_WRITE_QUEUE: number };
  totals: Record<ConcurrencyCategory, number>;
  durations: Record<ConcurrencyCategory, DurationStats>;
  queueWait: DurationStats;
  sqliteBusyRetries: number;
  errors: Record<ConcurrencyCategory, number>;
}

export interface ExecutingOpHandle {
  readonly opId: string;
  readonly category: ConcurrencyCategory;
  readonly tag: string;
  readonly startedAt: number;
  recordRetry: () => void;
  finish: (error?: unknown) => void;
}

export interface QueuedOpHandle {
  readonly opId: string;
  readonly category: ConcurrencyCategory;
  readonly tag: string;
  readonly queuedAt: number;
  onExecuting: () => ExecutingOpHandle;
  cancel: (reason?: string) => void;
}

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function getTimestampMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

let opCounter = 0;
function generateOpId(category: ConcurrencyCategory): string {
  opCounter = (opCounter + 1) % 1000000;
  const prefix = category.substring(0, 3).toLowerCase();
  return `${prefix}_${opCounter}_${Math.random().toString(36).substring(2, 6)}`;
}

class ConcurrencyTelemetryManager {
  private activeCounts: Record<ConcurrencyCategory, number> = {
    SQLITE_READ: 0,
    SQLITE_WRITE: 0,
    SQLITE_TX: 0,
    FIRESTORE_OP: 0,
    HTTP_REQUEST: 0,
    SYNC_TASK: 0,
    NOTIFICATION_RUN: 0,
    BACKGROUND_POLL: 0,
  };

  private peakCounts: Record<ConcurrencyCategory, number> = {
    SQLITE_READ: 0,
    SQLITE_WRITE: 0,
    SQLITE_TX: 0,
    FIRESTORE_OP: 0,
    HTTP_REQUEST: 0,
    SYNC_TASK: 0,
    NOTIFICATION_RUN: 0,
    BACKGROUND_POLL: 0,
  };

  private activeWriteQueue = 0;
  private peakWriteQueue = 0;

  private totals: Record<ConcurrencyCategory, number> = {
    SQLITE_READ: 0,
    SQLITE_WRITE: 0,
    SQLITE_TX: 0,
    FIRESTORE_OP: 0,
    HTTP_REQUEST: 0,
    SYNC_TASK: 0,
    NOTIFICATION_RUN: 0,
    BACKGROUND_POLL: 0,
  };

  private errors: Record<ConcurrencyCategory, number> = {
    SQLITE_READ: 0,
    SQLITE_WRITE: 0,
    SQLITE_TX: 0,
    FIRESTORE_OP: 0,
    HTTP_REQUEST: 0,
    SYNC_TASK: 0,
    NOTIFICATION_RUN: 0,
    BACKGROUND_POLL: 0,
  };

  private durations: Record<ConcurrencyCategory, { count: number; totalMs: number; maxMs: number }> = {
    SQLITE_READ: { count: 0, totalMs: 0, maxMs: 0 },
    SQLITE_WRITE: { count: 0, totalMs: 0, maxMs: 0 },
    SQLITE_TX: { count: 0, totalMs: 0, maxMs: 0 },
    FIRESTORE_OP: { count: 0, totalMs: 0, maxMs: 0 },
    HTTP_REQUEST: { count: 0, totalMs: 0, maxMs: 0 },
    SYNC_TASK: { count: 0, totalMs: 0, maxMs: 0 },
    NOTIFICATION_RUN: { count: 0, totalMs: 0, maxMs: 0 },
    BACKGROUND_POLL: { count: 0, totalMs: 0, maxMs: 0 },
  };

  private queueWaitStats = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };

  private sqliteBusyRetryCount = 0;

  /**
   * Resets all internal counters and metrics. Intended for automated unit tests.
   */
  public resetForTesting(): void {
    const categories: ConcurrencyCategory[] = [
      'SQLITE_READ',
      'SQLITE_WRITE',
      'SQLITE_TX',
      'FIRESTORE_OP',
      'HTTP_REQUEST',
      'SYNC_TASK',
      'NOTIFICATION_RUN',
      'BACKGROUND_POLL',
    ];

    for (const cat of categories) {
      this.activeCounts[cat] = 0;
      this.peakCounts[cat] = 0;
      this.totals[cat] = 0;
      this.errors[cat] = 0;
      this.durations[cat] = { count: 0, totalMs: 0, maxMs: 0 };
    }

    this.activeWriteQueue = 0;
    this.peakWriteQueue = 0;
    this.queueWaitStats = { count: 0, totalMs: 0, maxMs: 0 };
    this.sqliteBusyRetryCount = 0;
  }

  /**
   * Records a SQLITE_BUSY / lock contention retry.
   */
  public recordSqliteBusyRetry(callerInfo = 'Unknown'): void {
    this.sqliteBusyRetryCount++;
    if (isDev) {
      console.warn(`[CONCURRENCY_TRACE] SQLITE_BUSY retry for "${callerInfo}" (Total retries: ${this.sqliteBusyRetryCount})`);
    }
  }

  /**
   * Begins tracking a queued operation (such as SQLite write or transaction awaiting writeMutex).
   * Queue wait ends when `onExecuting()` is invoked.
   */
  public startQueued(category: 'SQLITE_WRITE' | 'SQLITE_TX', tag: string): QueuedOpHandle {
    const opId = generateOpId(category);
    const queuedAt = getTimestampMs();

    this.activeWriteQueue++;
    if (this.activeWriteQueue > this.peakWriteQueue) {
      this.peakWriteQueue = this.activeWriteQueue;
    }

    let isCompleted = false;

    return {
      opId,
      category,
      tag,
      queuedAt,
      onExecuting: (): ExecutingOpHandle => {
        if (isCompleted) {
          // Fallback if already transitioned or cancelled
          return this.createExecutingHandle(category, tag, opId, queuedAt);
        }
        isCompleted = true;
        this.activeWriteQueue = Math.max(0, this.activeWriteQueue - 1);

        const waitMs = Math.max(0, getTimestampMs() - queuedAt);
        this.queueWaitStats.count++;
        this.queueWaitStats.totalMs += waitMs;
        if (waitMs > this.queueWaitStats.maxMs) {
          this.queueWaitStats.maxMs = waitMs;
        }

        return this.createExecutingHandle(category, tag, opId, queuedAt, waitMs);
      },
      cancel: (reason?: string) => {
        if (!isCompleted) {
          isCompleted = true;
          this.activeWriteQueue = Math.max(0, this.activeWriteQueue - 1);
          if (isDev && reason) {
            console.log(`[CONCURRENCY_TRACE] Queued ${category} #${opId} cancelled (${reason})`);
          }
        }
      },
    };
  }

  /**
   * Begins tracking an immediately executing operation (reads, network requests, background jobs).
   */
  public startExecuting(category: ConcurrencyCategory, tag: string): ExecutingOpHandle {
    const opId = generateOpId(category);
    return this.createExecutingHandle(category, tag, opId);
  }

  private createExecutingHandle(
    category: ConcurrencyCategory,
    tag: string,
    opId: string,
    queuedAt?: number,
    queueWaitMs?: number
  ): ExecutingOpHandle {
    const startedAt = getTimestampMs();
    this.activeCounts[category]++;
    this.totals[category]++;
    if (this.activeCounts[category] > this.peakCounts[category]) {
      this.peakCounts[category] = this.activeCounts[category];
    }

    const currentActive = this.activeCounts[category];
    const currentPeak = this.peakCounts[category];
    let retriesCount = 0;
    let isFinished = false;

    return {
      opId,
      category,
      tag,
      startedAt,
      recordRetry: () => {
        retriesCount++;
        this.recordSqliteBusyRetry(tag);
      },
      finish: (error?: unknown) => {
        if (isFinished) return;
        isFinished = true;

        const endedAt = getTimestampMs();
        const durationMs = Math.max(0, endedAt - startedAt);

        this.activeCounts[category] = Math.max(0, this.activeCounts[category] - 1);

        const durationStat = this.durations[category];
        durationStat.count++;
        durationStat.totalMs += durationMs;
        if (durationMs > durationStat.maxMs) {
          durationStat.maxMs = durationMs;
        }

        if (error) {
          this.errors[category]++;
        }

        if (isDev) {
          const queueInfo =
            queueWaitMs !== undefined
              ? ` | QueueWait: ${queueWaitMs.toFixed(1)}ms (in queue: ${this.activeWriteQueue})`
              : '';
          const retryInfo = retriesCount > 0 ? ` | Retries: ${retriesCount}` : '';
          const errorInfo = error ? ` | ERROR: ${String((error as any)?.message || error)}` : '';

          console.log(
            `[CONCURRENCY_TRACE] #${opId} [${category}] ${tag}${queueInfo} | Exec: ${durationMs.toFixed(1)}ms | Active: ${currentActive} (Peak: ${currentPeak})${retryInfo}${errorInfo}`
          );
        }
      },
    };
  }

  /**
   * Returns a snapshot of active, peak, duration, and error metrics.
   */
  public getSnapshot(): ConcurrencyMetricsSnapshot {
    const calculateStats = (raw: { count: number; totalMs: number; maxMs: number }): DurationStats => ({
      count: raw.count,
      totalMs: Number(raw.totalMs.toFixed(1)),
      maxMs: Number(raw.maxMs.toFixed(1)),
      avgMs: raw.count > 0 ? Number((raw.totalMs / raw.count).toFixed(1)) : 0,
    });

    return {
      active: {
        ...this.activeCounts,
        SQLITE_WRITE_QUEUE: this.activeWriteQueue,
      },
      peak: {
        ...this.peakCounts,
        SQLITE_WRITE_QUEUE: this.peakWriteQueue,
      },
      totals: { ...this.totals },
      durations: {
        SQLITE_READ: calculateStats(this.durations.SQLITE_READ),
        SQLITE_WRITE: calculateStats(this.durations.SQLITE_WRITE),
        SQLITE_TX: calculateStats(this.durations.SQLITE_TX),
        FIRESTORE_OP: calculateStats(this.durations.FIRESTORE_OP),
        HTTP_REQUEST: calculateStats(this.durations.HTTP_REQUEST),
        SYNC_TASK: calculateStats(this.durations.SYNC_TASK),
        NOTIFICATION_RUN: calculateStats(this.durations.NOTIFICATION_RUN),
        BACKGROUND_POLL: calculateStats(this.durations.BACKGROUND_POLL),
      },
      queueWait: calculateStats(this.queueWaitStats),
      sqliteBusyRetries: this.sqliteBusyRetryCount,
      errors: { ...this.errors },
    };
  }

  /**
   * Formats a summary report of measured concurrency metrics.
   */
  public getSummaryString(): string {
    const snap = this.getSnapshot();
    const lines = [
      '=== IPOVault Concurrency Metrics Summary ===',
      `[SQLite Active/Peak] Reads: ${snap.active.SQLITE_READ}/${snap.peak.SQLITE_READ} | Writes: ${snap.active.SQLITE_WRITE}/${snap.peak.SQLITE_WRITE} | Transactions: ${snap.active.SQLITE_TX}/${snap.peak.SQLITE_TX}`,
      `[SQLite Write Queue] Waiting: ${snap.active.SQLITE_WRITE_QUEUE} | Peak Waiting: ${snap.peak.SQLITE_WRITE_QUEUE} | Avg Wait: ${snap.queueWait.avgMs}ms | Max Wait: ${snap.queueWait.maxMs}ms`,
      `[SQLite Contention] Busy Retries: ${snap.sqliteBusyRetries}`,
      `[Network Active/Peak] Firestore: ${snap.active.FIRESTORE_OP}/${snap.peak.FIRESTORE_OP} | HTTP: ${snap.active.HTTP_REQUEST}/${snap.peak.HTTP_REQUEST}`,
      `[Background Active/Peak] Sync: ${snap.active.SYNC_TASK}/${snap.peak.SYNC_TASK} | Notif Runs: ${snap.active.NOTIFICATION_RUN}/${snap.peak.NOTIFICATION_RUN} | Pollers: ${snap.active.BACKGROUND_POLL}/${snap.peak.BACKGROUND_POLL}`,
      `[Durations Avg/Max] Read: ${snap.durations.SQLITE_READ.avgMs}/${snap.durations.SQLITE_READ.maxMs}ms | Write: ${snap.durations.SQLITE_WRITE.avgMs}/${snap.durations.SQLITE_WRITE.maxMs}ms | TX: ${snap.durations.SQLITE_TX.avgMs}/${snap.durations.SQLITE_TX.maxMs}ms | HTTP: ${snap.durations.HTTP_REQUEST.avgMs}/${snap.durations.HTTP_REQUEST.maxMs}ms`,
      '============================================',
    ];
    return lines.join('\n');
  }

  /**
   * Logs summary to console if in development mode.
   */
  public logSummary(): void {
    if (isDev) {
      console.log(this.getSummaryString());
    }
  }
}

export const concurrencyTelemetry = new ConcurrencyTelemetryManager();
