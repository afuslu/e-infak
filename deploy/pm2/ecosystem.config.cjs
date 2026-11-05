const path = require('path');

// ─────────────────────────────────────────────────────────────
// E-İnfak 2.0 – PM2 Blue/Green Production Ecosystem
// ─────────────────────────────────────────────────────────────
// Backend  : Uvicorn (FastAPI)   → blue 8020 / green 8021
// Frontend : Next.js (next start) → blue 3000 / green 3001
// Celery   : Worker + Beat        → active release üzerinden
// ─────────────────────────────────────────────────────────────

const projectRoot = process.env.EINFAK_ROOT || '/var/www/e-infak';
const slotRoot = (slot) => path.join(projectRoot, 'slots', slot);
const backendRoot = (slot) => path.join(slotRoot(slot), 'services', 'backend');
const backendBin = (slot, executable) => path.join(backendRoot(slot), 'venv', 'bin', executable);
const frontendRoot = (slot) => path.join(slotRoot(slot), 'apps', 'web');

// ── Backend (Uvicorn FastAPI) ──────────────────────────────
const backendApp = (slot, port) => ({
  name: `einfak-backend-${slot}`,
  cwd: backendRoot(slot),
  script: backendBin(slot, 'uvicorn'),
  args: [
    'app.main:app',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--workers', process.env.UVICORN_WORKERS || '3',
    '--timeout-keep-alive', '5',
    '--timeout-graceful-shutdown', '30',
    '--access-log',
    '--proxy-headers',
  ].join(' '),
  interpreter: 'none',
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  kill_timeout: 35000,
  time: true,
});

// ── Frontend (Next.js SSR) ─────────────────────────────────
const frontendApp = (slot, port) => ({
  name: `einfak-frontend-${slot}`,
  cwd: frontendRoot(slot),
  script: path.join(frontendRoot(slot), 'node_modules', '.bin', 'next'),
  args: `start --port ${port} --hostname 127.0.0.1`,
  interpreter: 'none',
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  kill_timeout: 15000,
  time: true,
  env: {
    NODE_ENV: 'production',
    PORT: String(port),
  },
});

// ── Celery (active backend symlink üzerinden) ──────────────
const activeBackendRoot = path.join(projectRoot, 'backend-active');

module.exports = {
  apps: [
    // Blue/Green slots
    backendApp('blue', 8020),
    backendApp('green', 8021),
    frontendApp('blue', 3000),
    frontendApp('green', 3001),

    // Celery Worker
    {
      name: 'einfak-celery-worker',
      cwd: activeBackendRoot,
      script: path.join(activeBackendRoot, 'venv', 'bin', 'celery'),
      args: '-A app.tasks worker --loglevel=info --concurrency=2',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 65000,
      time: true,
    },

    // Celery Beat
    {
      name: 'einfak-celery-beat',
      cwd: activeBackendRoot,
      script: path.join(activeBackendRoot, 'venv', 'bin', 'celery'),
      args: '-A app.tasks beat --loglevel=info',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 35000,
      time: true,
    },
  ],
};
