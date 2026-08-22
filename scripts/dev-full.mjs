/**
 * Local full stack: Vite web (3000) + collab WS (1234) + API (8000) + intelligence (8091).
 *
 *   npm run dev:full
 *
 * Requires:
 *   - apps/api/.env with RECOMBYN_INTELLIGENCE_URL=http://127.0.0.1:8091
 *   - intelligence venv at ../recombyn-intelligence or set INTELLIGENCE_DIR
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';

const intelligenceDir =
  process.env.INTELLIGENCE_DIR ||
  path.resolve(root, '../recombyn-intelligence');

function intelligencePython() {
  const venvPy = path.join(
    intelligenceDir,
    win ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  );
  if (fs.existsSync(venvPy)) return venvPy;
  return win ? 'python' : 'python3';
}

const children = [];

function run(name, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: opts.cwd || root,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
    shell: win,
  });
  child.on('exit', (code, signal) => {
    for (const c of children) {
      if (c !== child && !c.killed) c.kill('SIGTERM');
    }
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
  children.push(child);
  console.log(`[dev:full] started ${name}`);
}

run('web', npm, ['run', 'dev', '--workspace=apps/web']);
run('collab', npm, ['run', 'dev', '--workspace=apps/collab']);
run('api', npm, ['run', 'dev:api']);
run(
  'intelligence',
  intelligencePython(),
  ['-m', 'uvicorn', 'recombyn_intelligence_service.app:app', '--host', '127.0.0.1', '--port', '8091'],
  {
    cwd: intelligenceDir,
    env: {
      PYTHONPATH: path.join(intelligenceDir, 'src'),
      INTELLIGENCE_SERVICE_API_KEY: process.env.INTELLIGENCE_SERVICE_API_KEY || 'dev-key',
    },
  }
);

console.log('');
console.log('[dev:full] URLs');
console.log('  web          http://localhost:3000');
console.log('  api          http://localhost:8000/docs');
console.log('  collab ws    ws://localhost:1234');
console.log('  intelligence http://127.0.0.1:8091/health');
console.log('');
console.log('[dev:full] Image toolbar vision tools need apps/api/.env:');
console.log('  RECOMBYN_INTELLIGENCE_MODE=cloud');
console.log('  RECOMBYN_INTELLIGENCE_URL=http://127.0.0.1:8091');
console.log('  RECOMBYN_INTELLIGENCE_API_KEY=dev-key');
console.log('  See docs/vision-intelligence.md');
console.log('');

function shutdown() {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
