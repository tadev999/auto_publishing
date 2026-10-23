// Endogenism Studio - Electron Main Process
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function findProjectRoot() {
  if (process.env.AUTO_PUBLISHING_ROOT && fsSync.existsSync(process.env.AUTO_PUBLISHING_ROOT)) {
    return process.env.AUTO_PUBLISHING_ROOT;
  }

  const appPath = app.isPackaged ? app.getAppPath() : __dirname;
  const candidates = [
    process.cwd(),
    path.resolve(appPath, '..', '..'),
    path.resolve(appPath, '..', '..', '..', '..', '..'),
    path.resolve(appPath, '..', '..', '..', '..'),
    path.resolve(__dirname, '..', '..'),
    '/Users/taduongngoc/Projects/auto_publishing',
  ];

  for (const cand of candidates) {
    if (
      cand &&
      fsSync.existsSync(cand) &&
      (fsSync.existsSync(path.join(cand, 'pyproject.toml')) || fsSync.existsSync(path.join(cand, 'PLAN.md')))
    ) {
      return cand;
    }
  }

  return '/Users/taduongngoc/Projects/auto_publishing';
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

function findNodeBin() {
  const candidates = [
    process.env.NODE_BIN,
    '/Users/taduongngoc/node-portable/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    'node',
  ];
  for (const c of candidates) {
    if (c && fsSync.existsSync(c)) return c;
  }
  return 'node';
}

const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');
const WALKTHROUGH_PATH = path.join(PROJECT_ROOT, 'dist', 'demo_walkthrough.js');

console.log('Endogenism Studio Root:', PROJECT_ROOT);
console.log('CLI Path:', CLI_PATH);
console.log('Walkthrough Path:', WALKTHROUGH_PATH);

let mainWindow = null;
let lastEventTs = '';

function runSql(query) {
  return new Promise((resolve) => {
    if (!fsSync.existsSync(DB_PATH)) {
      return resolve([]);
    }
    execFile('/usr/bin/sqlite3', ['-json', DB_PATH, query], (err, stdout) => {
      if (err) {
        console.error('SQL Error:', err.message);
        return resolve([]);
      }
      try {
        resolve(JSON.parse(stdout || '[]'));
      } catch {
        resolve([]);
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Endogenism Studio — AI Video Publishing',
    backgroundColor: '#07090e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Event Poller: kiểm tra sự kiện mới trong SQLite mỗi 1.5 giây
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const q = lastEventTs
        ? `SELECT * FROM events WHERE ts > '${lastEventTs}' ORDER BY ts ASC LIMIT 20;`
        : `SELECT * FROM events ORDER BY ts DESC LIMIT 15;`;
      const rows = await runSql(q);
      if (rows && rows.length > 0) {
        if (!lastEventTs) rows.reverse();
        lastEventTs = rows[rows.length - 1].ts;
        mainWindow.webContents.send('poll:events', rows);
      }
    } catch (e) {
      // Ignore background query errors
    }
  }, 1500);
}

// IPC Handlers
ipcMain.handle('db:get-status', async () => {
  const videoCounts = await runSql('SELECT status, count(*) as count FROM videos GROUP BY status;');
  const ideaCounts = await runSql('SELECT status, count(*) as count FROM ideas GROUP BY status;');
  const totalEvents = await runSql('SELECT count(*) as count FROM events;');
  return {
    videos: videoCounts,
    ideas: ideaCounts,
    eventsCount: totalEvents[0]?.count || 0,
  };
});

ipcMain.handle('db:get-videos', async () => {
  return runSql('SELECT * FROM videos ORDER BY slot_at DESC LIMIT 40;');
});

ipcMain.handle('db:get-video-detail', async (_e, id) => {
  const rows = await runSql(`SELECT * FROM videos WHERE id = ${parseInt(id, 10)};`);
  return rows[0] || null;
});

ipcMain.handle('db:get-events', async (_e, limit = 40) => {
  return runSql(`SELECT * FROM events ORDER BY ts DESC LIMIT ${parseInt(limit, 10)};`);
});

ipcMain.handle('pipeline:run-walkthrough', async () => {
  return new Promise((resolve) => {
    const nodeBin = findNodeBin();

    if (!fsSync.existsSync(WALKTHROUGH_PATH)) {
      const errMsg = `Không tìm thấy file ${WALKTHROUGH_PATH}. Hãy chạy npm run build.`;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log:event', { level: 'error', text: errMsg });
      }
      return resolve({ success: false, error: errMsg });
    }

    try {
      const child = spawn(nodeBin, [WALKTHROUGH_PATH], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, AUTO_PUBLISHING_ROOT: PROJECT_ROOT },
      });

      child.on('error', (err) => {
        console.error('Spawn error:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', {
            level: 'error',
            text: `Lỗi khởi chạy Node.js: ${err.message}`,
          });
        }
        resolve({ success: false, error: err.message });
      });

      child.stdout.on('data', (data) => {
        const text = data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', { level: 'info', text });
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', { level: 'error', text });
        }
      });

      child.on('close', (code) => {
        resolve({ success: code === 0, code });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('pipeline:run-command', async (_e, cmd, args = []) => {
  return new Promise((resolve) => {
    const nodeBin = findNodeBin();

    if (!fsSync.existsSync(CLI_PATH)) {
      const errMsg = `Không tìm thấy file ${CLI_PATH}. Hãy chạy npm run build.`;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log:event', { level: 'error', text: errMsg });
      }
      return resolve({ success: false, error: errMsg });
    }

    try {
      const child = spawn(nodeBin, [CLI_PATH, cmd, ...args], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, AUTO_PUBLISHING_ROOT: PROJECT_ROOT },
      });

      child.on('error', (err) => {
        console.error('CLI spawn error:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', {
            level: 'error',
            text: `Lỗi gọi lệnh endo: ${err.message}`,
          });
        }
        resolve({ success: false, error: err.message });
      });

      let output = '';
      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', { level: 'info', text });
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', { level: 'error', text });
        }
      });

      child.on('close', (code) => {
        resolve({ success: code === 0, code, output });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('media:open-video', async (_e, filePath) => {
  if (!filePath) return false;
  const target = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  try {
    await shell.openPath(target);
    return true;
  } catch (err) {
    console.error('Failed to open video:', err);
    return false;
  }
});

ipcMain.handle('remotion:open-studio', async () => {
  const remotionDir = path.join(PROJECT_ROOT, 'remotion');
  try {
    spawn('npm', ['run', 'studio'], {
      cwd: remotionDir,
      detached: true,
      stdio: 'ignore',
    }).unref();
    setTimeout(() => {
      shell.openExternal('http://localhost:3000');
    }, 2500);
    return true;
  } catch (e) {
    console.error('Failed to open remotion studio:', e);
    return false;
  }
});

ipcMain.handle('system:get-doctor', async () => {
  return new Promise((resolve) => {
    const nodeBin = findNodeBin();
    if (!fsSync.existsSync(CLI_PATH)) {
      return resolve({ output: `Không tìm thấy file ${CLI_PATH}. Hãy chạy npm run build.` });
    }
    execFile(nodeBin, [CLI_PATH, 'doctor'], { cwd: PROJECT_ROOT, env: process.env }, (err, stdout) => {
      resolve({ output: stdout || err?.message || '' });
    });
  });
});

ipcMain.handle('settings:get', async () => {
  const envPath = path.join(PROJECT_ROOT, '.env');
  try {
    const content = await fs.readFile(envPath, 'utf8');
    return { exists: true, content };
  } catch {
    return { exists: false, content: '' };
  }
});

ipcMain.handle('settings:save', async (_e, content) => {
  const envPath = path.join(PROJECT_ROOT, '.env');
  await fs.writeFile(envPath, content, 'utf8');
  return true;
});

ipcMain.handle('agent:get-skills', async () => {
  const skillsDir = path.join(PROJECT_ROOT, 'skills');
  let availableSkills = [];
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillPath = path.join(skillsDir, ent.name, 'SKILL.md');
      let description = 'Kỹ năng tùy biến cho Agent';
      try {
        const raw = await fs.readFile(skillPath, 'utf8');
        const matchDesc = raw.match(/description:\s*(.+)/);
        if (matchDesc) description = matchDesc[1].trim();
      } catch {}

      let category = 'writing';
      let icon = '⚡';
      let badge = 'SKILL';

      if (ent.name.startsWith('format-')) {
        category = 'formats';
        icon = '📜';
        badge = 'FORMAT';
      } else if (ent.name.includes('guardrail')) {
        category = 'core';
        icon = '🛡️';
        badge = 'TRIẾT LÝ';
      } else if (ent.name.includes('voice')) {
        category = 'production';
        icon = '🎙️';
        badge = 'VOICE';
      } else if (ent.name.includes('hook')) {
        category = 'writing';
        icon = '🪝';
        badge = 'HOOK';
      } else if (ent.name.includes('retention')) {
        category = 'retention';
        icon = '⚡';
        badge = 'RETENTION';
      } else if (ent.name.includes('critique')) {
        category = 'quality';
        icon = '🔍';
        badge = 'GIÁM KHẢO';
      } else if (ent.name.includes('cinematic')) {
        category = 'production';
        icon = '🎬';
        badge = 'VISUAL';
      } else if (ent.name.includes('storytelling')) {
        category = 'writing';
        icon = '🔥';
        badge = 'VIRAL';
      } else if (ent.name.includes('humor')) {
        category = 'writing';
        icon = '✨';
        badge = 'HÀI HƯỚC';
      }

      availableSkills.push({
        id: ent.name,
        name: ent.name,
        title: ent.name,
        description,
        category,
        icon,
        badge,
      });
    }
  } catch (err) {
    console.error('Failed to list skills:', err);
  }

  let savedProfiles = {};
  try {
    const rows = await runSql("SELECT value FROM kv WHERE key = 'agent_skills';");
    if (rows && rows[0]?.value) {
      savedProfiles = JSON.parse(rows[0].value);
    }
  } catch (err) {
    console.error('Failed to load agent skills from KV:', err);
  }

  return {
    availableSkills,
    savedProfiles,
  };
});

ipcMain.handle('agent:save-skills', async (_e, profiles) => {
  const jsonStr = JSON.stringify(profiles).replace(/'/g, "''");
  const query = `INSERT INTO kv(key, value) VALUES('agent_skills', '${jsonStr}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`;
  await runSql(query);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
