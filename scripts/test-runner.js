const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, '__tests__');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts') || f.endsWith('.spec.ts')).sort();

console.log(`========================================================================`);
console.log(`IPOVault Automated Regression Test Runner`);
console.log(`Found ${files.length} test suites.`);
console.log(`========================================================================\n`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  process.stdout.write(`• Running ${file.padEnd(55)} `);
  try {
    execSync(`node -e "
      const Module = require('module');
      const path = require('path');
      const orig = Module._resolveFilename;
      Module._resolveFilename = function(req, parent, isMain, options) {
        if (req.startsWith('@/')) req = path.join('${rootDir}', req.slice(2));
        return orig.call(this, req, parent, isMain, options);
      };
      require('sucrase/register');
      require('./__tests__/${file}');
    "`, {
      cwd: rootDir,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    console.log('✓ PASS');
    passed++;
  } catch (err) {
    console.log('❌ FAIL');
    failed++;
    const errMsg = err.stderr ? err.stderr.toString().trim() : (err.stdout ? err.stdout.toString().trim() : err.message);
    failures.push({ file, err: errMsg });
  }
}

console.log(`\n========================================================================`);
console.log(`SUMMARY: ${passed} Passed, ${failed} Failed out of ${files.length} total suites.`);
console.log(`========================================================================\n`);

if (failures.length > 0) {
  console.error('Failed Suites:');
  for (const f of failures) {
    console.error(`\n[${f.file}]:\n${f.err}`);
  }
  process.exit(1);
} else {
  console.log('All test suites executed and passed successfully!');
  process.exit(0);
}
