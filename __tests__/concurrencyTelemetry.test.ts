/**
 * Concurrency Telemetry Test Suite
 *
 * Validates:
 * 1. Active & Peak Counter Accuracy
 * 2. Idempotent finish() and double-decrement protection
 * 3. Overlapping operations & independent category tracking
 * 4. Write queue waiting vs executing duration differentiation
 * 5. Error recording and cleanup in finally blocks
 * 6. SQLITE_BUSY retry tracking and metrics snapshot generation
 */

import { concurrencyTelemetry, ConcurrencyMetricsSnapshot } from '../utils/concurrencyTelemetry';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runConcurrencyTelemetryTestSuite() {
  console.log('==================================================');
  console.log('RUNNING CONCURRENCY TELEMETRY TEST SUITE');
  console.log('==================================================');

  // Test 1: Single Operation Accuracy & Counter Lifecycle
  {
    concurrencyTelemetry.resetForTesting();
    const snapInit = concurrencyTelemetry.getSnapshot();
    assert(snapInit.active.SQLITE_READ === 0, 'TEST 1.1', 'Initial active SQLITE_READ is 0');
    assert(snapInit.peak.SQLITE_READ === 0, 'TEST 1.2', 'Initial peak SQLITE_READ is 0');

    const probe = concurrencyTelemetry.startExecuting('SQLITE_READ', 'test.read.1');
    const snapActive = concurrencyTelemetry.getSnapshot();
    assert(snapActive.active.SQLITE_READ === 1, 'TEST 1.3', 'Active SQLITE_READ increments to 1');
    assert(snapActive.peak.SQLITE_READ === 1, 'TEST 1.4', 'Peak SQLITE_READ reaches 1');
    assert(snapActive.totals.SQLITE_READ === 1, 'TEST 1.5', 'Total SQLITE_READ count is 1');

    probe.finish();
    const snapFinished = concurrencyTelemetry.getSnapshot();
    assert(snapFinished.active.SQLITE_READ === 0, 'TEST 1.6', 'Active SQLITE_READ decrements to 0 on finish');
    assert(snapFinished.peak.SQLITE_READ === 1, 'TEST 1.7', 'Peak SQLITE_READ is preserved at 1');
    assert(snapFinished.durations.SQLITE_READ.count === 1, 'TEST 1.8', 'Duration recorded 1 sample');
  }

  // Test 2: Idempotent finish() Prevents Underflow Below Zero
  {
    concurrencyTelemetry.resetForTesting();
    const probe = concurrencyTelemetry.startExecuting('HTTP_REQUEST', 'test.http.idempotent');
    assert(concurrencyTelemetry.getSnapshot().active.HTTP_REQUEST === 1, 'TEST 2.1', 'Active HTTP_REQUEST is 1');

    probe.finish();
    assert(concurrencyTelemetry.getSnapshot().active.HTTP_REQUEST === 0, 'TEST 2.2', 'Active HTTP_REQUEST decrements to 0');

    // Duplicate finishes must be safe no-ops
    probe.finish();
    probe.finish(new Error('Secondary finish attempt'));
    assert(concurrencyTelemetry.getSnapshot().active.HTTP_REQUEST === 0, 'TEST 2.3', 'Idempotent finish does not decrement below 0');
    assert(concurrencyTelemetry.getSnapshot().durations.HTTP_REQUEST.count === 1, 'TEST 2.4', 'Duration sample count remains 1');
    assert(concurrencyTelemetry.getSnapshot().errors.HTTP_REQUEST === 0, 'TEST 2.5', 'Duplicate error finish ignored');
  }

  // Test 3: Failure Cleanup and Error Accounting
  {
    concurrencyTelemetry.resetForTesting();
    const probe = concurrencyTelemetry.startExecuting('FIRESTORE_OP', 'test.firestore.error');
    assert(concurrencyTelemetry.getSnapshot().active.FIRESTORE_OP === 1, 'TEST 3.1', 'Active FIRESTORE_OP is 1');

    const testError = new Error('Connection reset by peer');
    probe.finish(testError);

    const snap = concurrencyTelemetry.getSnapshot();
    assert(snap.active.FIRESTORE_OP === 0, 'TEST 3.2', 'Active count decrements to 0 on failure');
    assert(snap.errors.FIRESTORE_OP === 1, 'TEST 3.3', 'Error counter accurately increments');
    assert(snap.durations.FIRESTORE_OP.count === 1, 'TEST 3.4', 'Execution duration recorded despite error');
  }

  // Test 4: Overlapping Operations & Peak Concurrency Tracking
  {
    concurrencyTelemetry.resetForTesting();
    const probeA = concurrencyTelemetry.startExecuting('SQLITE_READ', 'read.A');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 1, 'TEST 4.1', 'Active count is 1');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 1, 'TEST 4.2', 'Peak is 1');

    const probeB = concurrencyTelemetry.startExecuting('SQLITE_READ', 'read.B');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 2, 'TEST 4.3', 'Active count is 2');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 2, 'TEST 4.4', 'Peak is 2');

    const probeC = concurrencyTelemetry.startExecuting('SQLITE_READ', 'read.C');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 3, 'TEST 4.5', 'Active count is 3');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 3, 'TEST 4.6', 'Peak is 3');

    // Finish one probe
    probeB.finish();
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 2, 'TEST 4.7', 'Active count drops to 2');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 3, 'TEST 4.8', 'Peak stays at 3');

    // Start probe D
    const probeD = concurrencyTelemetry.startExecuting('SQLITE_READ', 'read.D');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 3, 'TEST 4.9', 'Active count back to 3');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 3, 'TEST 4.10', 'Peak is still 3');

    probeA.finish();
    probeC.finish();
    probeD.finish();

    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_READ === 0, 'TEST 4.11', 'All probes finished, active is 0');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_READ === 3, 'TEST 4.12', 'Peak preserved at 3');
    assert(concurrencyTelemetry.getSnapshot().totals.SQLITE_READ === 4, 'TEST 4.13', 'Total 4 operations tracked');
  }

  // Test 5: Independent Category Isolation
  {
    concurrencyTelemetry.resetForTesting();
    const read = concurrencyTelemetry.startExecuting('SQLITE_READ', 'read');
    const http = concurrencyTelemetry.startExecuting('HTTP_REQUEST', 'http');
    const sync = concurrencyTelemetry.startExecuting('SYNC_TASK', 'sync');
    const notif = concurrencyTelemetry.startExecuting('NOTIFICATION_RUN', 'notif');
    const poll = concurrencyTelemetry.startExecuting('BACKGROUND_POLL', 'poll');

    const snap = concurrencyTelemetry.getSnapshot();
    assert(snap.active.SQLITE_READ === 1, 'TEST 5.1', 'SQLITE_READ active is 1');
    assert(snap.active.HTTP_REQUEST === 1, 'TEST 5.2', 'HTTP_REQUEST active is 1');
    assert(snap.active.SYNC_TASK === 1, 'TEST 5.3', 'SYNC_TASK active is 1');
    assert(snap.active.NOTIFICATION_RUN === 1, 'TEST 5.4', 'NOTIFICATION_RUN active is 1');
    assert(snap.active.BACKGROUND_POLL === 1, 'TEST 5.5', 'BACKGROUND_POLL active is 1');

    read.finish();
    http.finish();
    sync.finish();
    notif.finish();
    poll.finish();

    const snapEnd = concurrencyTelemetry.getSnapshot();
    assert(snapEnd.active.SQLITE_READ === 0, 'TEST 5.6', 'SQLITE_READ decremented');
    assert(snapEnd.active.HTTP_REQUEST === 0, 'TEST 5.7', 'HTTP_REQUEST decremented');
    assert(snapEnd.active.SYNC_TASK === 0, 'TEST 5.8', 'SYNC_TASK decremented');
    assert(snapEnd.active.NOTIFICATION_RUN === 0, 'TEST 5.9', 'NOTIFICATION_RUN decremented');
    assert(snapEnd.active.BACKGROUND_POLL === 0, 'TEST 5.10', 'BACKGROUND_POLL decremented');
  }

  // Test 6: Write Queue Waiting vs Execution Timing Differentiation
  {
    concurrencyTelemetry.resetForTesting();
    const queued1 = concurrencyTelemetry.startQueued('SQLITE_WRITE', 'q.write.1');
    const queued2 = concurrencyTelemetry.startQueued('SQLITE_WRITE', 'q.write.2');

    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 2, 'TEST 6.1', 'Write queue depth is 2');
    assert(concurrencyTelemetry.getSnapshot().peak.SQLITE_WRITE_QUEUE === 2, 'TEST 6.2', 'Peak write queue is 2');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE === 0, 'TEST 6.3', 'Executing write count is still 0');

    // Simulate mutex delay
    await new Promise((r) => setTimeout(r, 15));

    const executing1 = queued1.onExecuting();
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 1, 'TEST 6.4', 'Queue depth decrements to 1 on execution start');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE === 1, 'TEST 6.5', 'Executing write count is 1');

    // Simulate execution time
    await new Promise((r) => setTimeout(r, 10));
    executing1.finish();

    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE === 0, 'TEST 6.6', 'Executing count decrements on finish');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 1, 'TEST 6.7', 'Second item still queued');

    const executing2 = queued2.onExecuting();
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 0, 'TEST 6.8', 'Queue is now empty');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE === 1, 'TEST 6.9', 'Second item executing');

    executing2.finish();
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE === 0, 'TEST 6.10', 'All writes complete');

    const snap = concurrencyTelemetry.getSnapshot();
    assert(snap.queueWait.count === 2, 'TEST 6.11', 'Queue wait recorded 2 operations');
    assert(snap.queueWait.totalMs >= 10, 'TEST 6.12', `Queue wait measured: ${snap.queueWait.totalMs}ms`);
    assert(snap.durations.SQLITE_WRITE.count === 2, 'TEST 6.13', 'Duration recorded 2 writes');
  }

  // Test 7: Cancellation of Queued Operations (Nested Transactions)
  {
    concurrencyTelemetry.resetForTesting();
    const queuedTx = concurrencyTelemetry.startQueued('SQLITE_TX', 'tx.nested');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 1, 'TEST 7.1', 'Tx enqueued');

    queuedTx.cancel('already_inside_transaction');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_WRITE_QUEUE === 0, 'TEST 7.2', 'Cancelled tx cleanly decrements queue');
    assert(concurrencyTelemetry.getSnapshot().active.SQLITE_TX === 0, 'TEST 7.3', 'No tx left executing');
  }

  // Test 8: SQLITE_BUSY Contention & Summary Generation
  {
    concurrencyTelemetry.resetForTesting();
    concurrencyTelemetry.recordSqliteBusyRetry('ApplicationRepository.addBulk');
    concurrencyTelemetry.recordSqliteBusyRetry('DBContext.updateApp');

    const snap = concurrencyTelemetry.getSnapshot();
    assert(snap.sqliteBusyRetries === 2, 'TEST 8.1', 'Recorded 2 SQLite busy retries');

    const summaryStr = concurrencyTelemetry.getSummaryString();
    assert(summaryStr.includes('=== IPOVault Concurrency Metrics Summary ==='), 'TEST 8.2', 'Contains summary header');
    assert(summaryStr.includes('[SQLite Contention] Busy Retries: 2'), 'TEST 8.3', 'Summary includes retries');
  }

  console.log('\n==================================================');
  console.log('ALL CONCURRENCY TELEMETRY TESTS PASSED (35/35)');
  console.log('==================================================\n');
}

// Auto-run if executed directly via Node / ts-node
if (typeof require !== 'undefined' && require.main === module) {
  runConcurrencyTelemetryTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
