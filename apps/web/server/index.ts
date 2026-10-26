import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { Settings } from '@endo/core/config';
import { createStudioApp } from './app.js';
import { acquireServerLock } from './lock.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.AUTO_PUBLISHING_ROOT || path.join(workspace, '../..'));
const dev = process.argv.includes('--dev');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
if (!fs.existsSync(path.join(root, 'apps/cli/dist/cli.js'))) {
  throw new Error('CLI is not built. Run npm run build from the repository root first.');
}
const settings = new Settings(yaml.load(fs.readFileSync(path.join(root, 'config/settings.yaml'), 'utf8')));
const dataDir = settings.dataDir;
const releaseLock = acquireServerLock(dataDir);
let studio: ReturnType<typeof createStudioApp>;
try {
  studio = createStudioApp({
    root, dataDir, settings,
    scheduler: process.env.STUDIO_SCHEDULER !== 'off',
    access: { host, publicOrigin: process.env.PUBLIC_ORIGIN, username: process.env.STUDIO_USER, password: process.env.STUDIO_PASSWORD },
  });
} catch (error) {
  releaseLock();
  throw error;
}
const server = http.createServer(studio.app);
let vite: Awaited<ReturnType<typeof import('vite')['createServer']>> | undefined;

async function start() {
  if (dev) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: workspace,
      server: { middlewareMode: true, hmr: { server } },
    });
    studio.app.use(vite.middlewares);
  } else {
    const dist = path.join(workspace, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Web UI is not built. Run npm run build first.');
    studio.app.use(express.static(dist));
    studio.app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  let selected = port;
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(selected, host);
      });
      break;
    } catch (error) {
      if (!process.env.PORT && selected < port + 10 && error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
        console.warn(`Port ${selected} is occupied; trying ${selected + 1}.`);
        selected++;
      } else throw error;
    }
  }
  console.log(`\nEndogenism Studio: ${process.env.PUBLIC_ORIGIN || `http://${host === '::1' ? '[::1]' : host}:${selected}`}\nPress Ctrl+C to stop.\n`);
}

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await studio.close();
  await vite?.close();
  server.closeAllConnections();
  releaseLock();
}
process.once('SIGINT', () => { void close().catch((error) => { console.error(error); process.exitCode = 1; }); });
process.once('SIGTERM', () => { void close().catch((error) => { console.error(error); process.exitCode = 1; }); });
start().catch(async (error: unknown) => {
  console.error('[Startup failed]', error);
  await close();
  process.exitCode = 1;
});
