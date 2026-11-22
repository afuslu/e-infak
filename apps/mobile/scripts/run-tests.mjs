import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(os.tmpdir(), 'einfak-mobile-tests');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const tsconfigPath = path.join(outDir, 'tsconfig.test.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      outDir,
      rootDir: path.join(root, 'src'),
      module: 'commonjs',
      target: 'es2022',
      moduleResolution: 'node',
      esModuleInterop: true,
      skipLibCheck: true,
      baseUrl: root,
      paths: { '@/*': ['src/*'] },
    },
    files: [
      path.join(root, 'src/lib/access.ts'),
      path.join(root, 'src/lib/format.ts'),
      path.join(root, 'src/lib/storage.ts'),
      path.join(root, 'src/lib/api.ts'),
      path.join(root, 'src/lib/offlineQueue.ts'),
    ],
  })
);

const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
execFileSync(tsc, ['-p', tsconfigPath], { stdio: 'inherit' });

execFileSync(process.execPath, ['--test', path.join(root, 'tests', 'core.test.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, MOBILE_TEST_DIST: outDir },
});
