import type { SQLiteDatabase } from 'expo-sqlite';
import { concurrencyTelemetry } from './concurrencyTelemetry';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Parses top-level comma-separated expressions inside a VALUES (...) clause.
 * Correctly handles single quotes, double quotes, and nested parentheses.
 */
export function parseSqlValues(valuesString: string): string[] {
  const expressions: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < valuesString.length; i++) {
    const char = valuesString[i];
    const prevChar = i > 0 ? valuesString[i - 1] : '';

    if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      } else if (char === ',' && parenDepth === 0) {
        if (current.trim()) {
          expressions.push(current.trim());
        }
        current = '';
        continue;
      }
    }
    current += char;
  }

  if (current.trim()) {
    expressions.push(current.trim());
  }

  return expressions;
}

/**
 * Validates SQL INSERT statements:
 * - Column count must equal SQL value expression count.
 * - Placeholder '?' count must equal bound parameter array length.
 */
export function validateSqlInsertCounts(sql: string, params: any[], callerInfo: string): boolean {
  if (!isDev) return true;
  const insertMatch = sql.match(/INSERT\s+INTO\s+[^\(]+\(([^\)]+)\)\s+VALUES\s*\(([^\)]+)\)/i);
  if (!insertMatch) return true;

  const colListStr = insertMatch[1];
  const valuesStr = insertMatch[2];

  const declaredCols = colListStr.split(',').map((s) => s.trim()).filter(Boolean).length;
  const expressions = parseSqlValues(valuesStr);
  const sqlValuesCount = expressions.length;

  let placeholderCount = 0;
  for (const expr of expressions) {
    const qMatches = expr.match(/\?/g);
    if (qMatches) {
      placeholderCount += qMatches.length;
    }
  }

  const literalCount = Math.max(0, sqlValuesCount - placeholderCount);
  const boundParamsCount = params.length;

  const pass = (declaredCols === sqlValuesCount) && (placeholderCount === boundParamsCount);

  if (!pass) {
    console.error(
      `[SQL AUDIT FATAL]\n${callerInfo}\nColumns: ${declaredCols}\nSQL values: ${sqlValuesCount}\nPlaceholders: ${placeholderCount}\nBound parameters: ${boundParamsCount}\nLiteral expressions: ${literalCount}\nResult: FAIL\nSQL: ${sql}`
    );
  } else {
    console.log(
      `[SQL AUDIT]\n${callerInfo}\nColumns: ${declaredCols}\nSQL values: ${sqlValuesCount}\nPlaceholders: ${placeholderCount}\nBound parameters: ${boundParamsCount}\nLiteral expressions: ${literalCount}\nResult: PASS`
    );
  }

  return pass;
}

/**
 * Helper to retry SQLite operations if the database is locked.
 */
export async function retryOnLock<T>(fn: () => Promise<T>, retries = 10, baseDelayMs = 100, callerInfo = 'Unknown'): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const errMsg = (err?.message || String(err)).toLowerCase();
      if (errMsg.includes('closed resource') || errMsg.includes('access to closed resource')) {
        throw err;
      }
      const isLocked = errMsg.includes('locked') || errMsg.includes('busy') || errMsg.includes('cannot start a transaction') || errMsg.includes('database is locked');
      if (isLocked && attempt < retries - 1) {
        concurrencyTelemetry.recordSqliteBusyRetry(callerInfo);
        const delay = Math.min(2500, baseDelayMs * Math.pow(1.5, attempt)) + Math.floor(Math.random() * 75);
        if (isDev) {
          console.warn(`[SQL LOCK RETRY: ${callerInfo}] Database locked. Retrying attempt ${attempt + 1}/${retries} in ${Math.round(delay)}ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  return fn();
}

let writeMutex: Promise<any> = Promise.resolve();
let isInsideTransaction = false;

function queueWrite<T>(op: () => Promise<T>, callerInfo = 'Unknown'): Promise<T> {
  if (isInsideTransaction) {
    return op();
  }

  const queuedProbe = concurrencyTelemetry.startQueued('SQLITE_WRITE', callerInfo);

  const next = writeMutex.then(
    async () => {
      const executingProbe = queuedProbe.onExecuting();
      try {
        const res = await op();
        executingProbe.finish();
        return res;
      } catch (err) {
        executingProbe.finish(err);
        throw err;
      } finally {
        executingProbe.finish();
      }
    },
    async () => {
      const executingProbe = queuedProbe.onExecuting();
      try {
        const res = await op();
        executingProbe.finish();
        return res;
      } catch (err) {
        executingProbe.finish(err);
        throw err;
      } finally {
        executingProbe.finish();
      }
    }
  );
  writeMutex = next.catch(() => {});
  return next;
}

export async function safeRunAsync(
  db: SQLiteDatabase | { runAsync: (sql: string, params: any[]) => Promise<any> },
  sql: string,
  params: any[] = [],
  callerInfo: string = 'Unknown'
): Promise<any> {
  validateSqlInsertCounts(sql, params, callerInfo);
  const sanitizedParams = params.map((p, idx) => {
    if (p === undefined) {
      if (isDev) {
        console.warn(`[SQL BIND WARNING] ${callerInfo} -> Parameter at index ${idx + 1} is UNDEFINED. Converting to null. SQL:`, sql);
      }
      return null;
    }
    return p;
  });

  return queueWrite(() => retryOnLock(() => db.runAsync(sql, sanitizedParams), 10, 100, callerInfo), callerInfo);
}

export async function safeGetFirstAsync<T>(
  db: SQLiteDatabase,
  sql: string,
  params: any[] = [],
  callerInfo: string = 'Unknown'
): Promise<T | null> {
  const sanitizedParams = params.map((p, idx) => {
    if (p === undefined) {
      if (__DEV__) {
        console.warn(`[SQL BIND WARNING] ${callerInfo} -> Parameter at index ${idx + 1} is UNDEFINED. Converting to null. SQL:`, sql);
      }
      return null;
    }
    return p;
  });

  const probe = concurrencyTelemetry.startExecuting('SQLITE_READ', callerInfo);
  try {
    const res = await retryOnLock(() => db.getFirstAsync<T>(sql, sanitizedParams), 10, 100, callerInfo);
    probe.finish();
    return res;
  } catch (err) {
    probe.finish(err);
    throw err;
  } finally {
    probe.finish();
  }
}

export async function safeGetAllAsync<T>(
  db: SQLiteDatabase,
  sql: string,
  params: any[] = [],
  callerInfo: string = 'Unknown'
): Promise<T[]> {
  const sanitizedParams = params.map((p, idx) => {
    if (p === undefined) {
      if (__DEV__) {
        console.warn(`[SQL BIND WARNING] ${callerInfo} -> Parameter at index ${idx + 1} is UNDEFINED. Converting to null. SQL:`, sql);
      }
      return null;
    }
    return p;
  });

  const probe = concurrencyTelemetry.startExecuting('SQLITE_READ', callerInfo);
  try {
    const res = await retryOnLock(() => db.getAllAsync<T>(sql, sanitizedParams), 10, 100, callerInfo);
    probe.finish();
    return res;
  } catch (err) {
    probe.finish(err);
    throw err;
  } finally {
    probe.finish();
  }
}

export async function safeExecAsync(
  db: SQLiteDatabase,
  sql: string,
  callerInfo: string = 'Unknown'
): Promise<void> {
  return queueWrite(() => retryOnLock(() => db.execAsync(sql), 10, 100, callerInfo), callerInfo);
}

/**
 * Executes an async action within a single, explicit SQLite transaction.
 * Serializes concurrent transaction requests via a promise mutex.
 * Supports reentrancy (nested calls execute within the outer transaction).
 * Preserves and reports the ORIGINAL action error, preventing secondary rollback rejections from masking it.
 * Retries on lock contention.
 */
export async function runWithTransaction<T>(
  db: SQLiteDatabase,
  action: () => Promise<T>,
  callerInfo: string = 'Unknown'
): Promise<T> {
  // If we are already executing inside an active transaction, execute action directly without nesting BEGIN
  if (isInsideTransaction) {
    return action();
  }

  const queuedProbe = concurrencyTelemetry.startQueued('SQLITE_TX', callerInfo);

  const execute = async (): Promise<T> => {
    if (isInsideTransaction) {
      queuedProbe.cancel('already_inside_transaction');
      return action();
    }

    const executingProbe = queuedProbe.onExecuting();
    isInsideTransaction = true;
    try {
      if (typeof (db as any).withTransactionAsync === 'function') {
        const res = (await retryOnLock<T>(() => (db as any).withTransactionAsync(action), 10, 100, `${callerInfo}.withTx`)) as T;
        executingProbe.finish();
        return res;
      }

      return await retryOnLock<T>(async () => {
        let inTransaction = false;
        try {
          await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
          inTransaction = true;
          const result = await action();
          await db.execAsync('COMMIT;');
          inTransaction = false;
          executingProbe.finish();
          return result;
        } catch (originalError: any) {
          executingProbe.finish(originalError);
          if (isDev) {
            console.error(`[SQL TRANSACTION ERROR] ${callerInfo} -> Original failure:`, originalError);
          }
          if (inTransaction) {
            try {
              await db.execAsync('ROLLBACK;');
            } catch (rollbackError: any) {
              if (isDev) {
                console.warn(`[SQL TRANSACTION ERROR] ${callerInfo} -> Rollback ignored:`, rollbackError?.message || rollbackError);
              }
            }
          }
          throw originalError;
        }
      }, 10, 100, `${callerInfo}.beginTx`);
    } catch (err) {
      executingProbe.finish(err);
      throw err;
    } finally {
      executingProbe.finish();
      isInsideTransaction = false;
    }
  };

  const nextMutex = writeMutex.then(execute, execute);
  writeMutex = nextMutex.catch(() => {});
  return nextMutex;
}
