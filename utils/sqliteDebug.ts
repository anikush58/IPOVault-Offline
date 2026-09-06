import { SQLiteDatabase } from 'expo-sqlite';

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
  if (!__DEV__) return true;
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
async function retryOnLock<T>(fn: () => Promise<T>, retries = 4, baseDelayMs = 150): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLocked = err?.message?.toLowerCase().includes('locked') || String(err).toLowerCase().includes('locked');
      if (isLocked && attempt < retries - 1) {
        const delay = baseDelayMs * (attempt + 1);
        if (__DEV__) {
          console.warn(`[SQL LOCK RETRY] Database locked. Retrying attempt ${attempt + 1}/${retries} in ${delay}ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  return fn();
}

export async function safeRunAsync(
  db: SQLiteDatabase,
  sql: string,
  params: any[] = [],
  callerInfo: string = 'Unknown'
): Promise<any> {
  validateSqlInsertCounts(sql, params, callerInfo);
  const sanitizedParams = params.map((p, idx) => {
    if (p === undefined) {
      if (__DEV__) {
        console.warn(`[SQL BIND WARNING] ${callerInfo} -> Parameter at index ${idx + 1} is UNDEFINED. Converting to null. SQL:`, sql);
      }
      return null;
    }
    return p;
  });

  return retryOnLock(() => db.runAsync(sql, sanitizedParams));
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

  return retryOnLock(() => db.getFirstAsync<T>(sql, sanitizedParams));
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

  return retryOnLock(() => db.getAllAsync<T>(sql, sanitizedParams));
}

export async function safeExecAsync(
  db: SQLiteDatabase,
  sql: string,
  callerInfo: string = 'Unknown'
): Promise<void> {
  return retryOnLock(() => db.execAsync(sql));
}

/**
 * Executes an async action within a single, explicit SQLite transaction.
 * Preserves and reports the ORIGINAL action error, preventing secondary rollback rejections from masking it.
 * Retries on lock contention.
 */
export async function runWithTransaction<T>(
  db: SQLiteDatabase,
  action: () => Promise<T>,
  callerInfo: string = 'Unknown'
): Promise<T> {
  if (typeof (db as any).withTransactionAsync === 'function') {
    return retryOnLock(() => (db as any).withTransactionAsync(action));
  }

  return retryOnLock(async () => {
    let inTransaction = false;
    try {
      await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
      inTransaction = true;
      const result = await action();
      await db.execAsync('COMMIT;');
      inTransaction = false;
      return result;
    } catch (originalError: any) {
      if (__DEV__) {
        console.error(`[SQL TRANSACTION ERROR] ${callerInfo} -> Original failure:`, originalError);
      }
      if (inTransaction) {
        try {
          await db.execAsync('ROLLBACK;');
        } catch (rollbackError: any) {
          if (__DEV__) {
            console.warn(`[SQL TRANSACTION ERROR] ${callerInfo} -> Rollback ignored:`, rollbackError?.message || rollbackError);
          }
        }
      }
      throw originalError;
    }
  });
}
