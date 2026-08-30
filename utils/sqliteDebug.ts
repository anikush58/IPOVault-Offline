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

  return db.runAsync(sql, sanitizedParams);
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

  return db.getFirstAsync<T>(sql, sanitizedParams);
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

  return db.getAllAsync<T>(sql, sanitizedParams);
}

/**
 * Executes an async action within a single, explicit SQLite transaction.
 * Preserves and reports the ORIGINAL action error, preventing secondary rollback rejections from masking it.
 */
export async function runWithTransaction<T>(
  db: SQLiteDatabase,
  action: () => Promise<T>,
  callerInfo: string = 'Unknown'
): Promise<T> {
  let inTransaction = false;
  try {
    await db.execAsync('BEGIN TRANSACTION;');
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
          console.warn(`[SQL TRANSACTION ERROR] ${callerInfo} -> Rollback ignored (transaction already closed/rolled back):`, rollbackError?.message || rollbackError);
        }
      }
    }
    throw originalError;
  }
}
