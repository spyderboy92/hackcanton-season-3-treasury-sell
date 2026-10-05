const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const output = mkdtempSync(path.join(tmpdir(), 'treasury-ledger-tests-'));
try {
  const compile = spawnSync(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    'lib/ledger/server/config.ts', 'lib/ledger/server/auth.ts', 'lib/ledger/server/json-api.ts',
    '--rootDir', 'lib', '--outDir', output, '--module', 'commonjs', '--target', 'es2022',
    '--skipLibCheck', '--esModuleInterop', '--strict',
  ], { stdio: 'inherit' });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', 'tests/ledger-connection.test.cjs'], {
      stdio: 'inherit', env: { ...process.env, TEST_LEDGER_BUILD: output },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
