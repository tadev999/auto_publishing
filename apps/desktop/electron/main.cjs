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

function getCliPath() {
  const candidates = [
    path.join(PROJECT_ROOT, 'apps', 'cli', 'dist', 'cli.js'),
    path.join(PROJECT_ROOT, 'dist', 'cli.js'),
  ];
  return candidates.find((c) => fsSync.existsSync(c)) || candidates[0];
}

function getWalkthroughPath() {
  const candidates = [
    path.join(PROJECT_ROOT, 'apps', 'cli', 'dist', 'demo_walkthrough.js'),
    path.join(PROJECT_ROOT, 'dist', 'demo_walkthrough.js'),
  ];
  return candidates.find((c) => fsSync.existsSync(c)) || candidates[0];
}

const CLI_PATH = getCliPath();
const WALKTHROUGH_PATH = getWalkthroughPath();

console.log('Endogenism Studio Root:', PROJECT_ROOT);
console.log('CLI Path:', CLI_PATH);
console.log('Walkthrough Path:', WALKTHROUGH_PATH);

let mainWindow = null;
let lastEventTs = '';

const activeChildProcesses = new Set();

function registerChildProcess(child) {
  activeChildProcesses.add(child);
  const cleanup = () => activeChildProcesses.delete(child);
  child.on('close', cleanup);
  child.on('exit', cleanup);
  child.on('error', cleanup);
}

function killAllRunningAgents() {
  console.log(`[Main] Stopping all active child processes (${activeChildProcesses.size} running)...`);
  for (const child of activeChildProcesses) {
    try {
      if (child.pid && !child.killed) {
        process.kill(child.pid, 'SIGTERM');
        setTimeout(() => {
          try {
            if (child.pid && !child.killed) {
              process.kill(child.pid, 'SIGKILL');
            }
          } catch {}
        }, 500);
      }
    } catch (e) {
      console.error('Error killing child process:', e);
    }
  }
  activeChildProcesses.clear();

  // Dọn dẹp các locks còn tồn đọng trong data/locks
  const lockDir = path.join(DATA_DIR, 'locks');
  if (fsSync.existsSync(lockDir)) {
    try {
      const files = fsSync.readdirSync(lockDir);
      for (const f of files) {
        const lp = path.join(lockDir, f);
        try {
          const content = fsSync.readFileSync(lp, 'utf8').trim();
          const pid = parseInt(content, 10);
          if (pid && !isNaN(pid)) {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {}
          }
          fsSync.unlinkSync(lp);
        } catch {}
      }
    } catch {}
  }
}

function runSql(query) {
  return new Promise((resolve) => {
    if (!fsSync.existsSync(DB_PATH)) {
      return resolve([]);
    }
    execFile(
      '/usr/bin/sqlite3',
      ['-cmd', '.timeout 5000', '-json', DB_PATH, query],
      (err, stdout) => {
        if (err) {
          console.error('SQL Error:', err.message);
          return resolve([]);
        }
        try {
          resolve(JSON.parse(stdout || '[]'));
        } catch {
          resolve([]);
        }
      }
    );
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

  mainWindow.webContents.on('did-fail-load', () => {
    if (DEV_URL) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(DEV_URL);
        }
      }, 1000);
    }
  });

  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      console.log(`[Renderer Error]: ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Event Poller: kiểm tra sự kiện mới trong SQLite mỗi 0.5 giây
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
  }, 500);
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
      registerChildProcess(child);

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
      registerChildProcess(child);

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

ipcMain.handle('pipeline:stop-all', async () => {
  killAllRunningAgents();
  try {
    await runSql("INSERT INTO kv(key, value) VALUES('paused', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true';");
  } catch {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log:event', {
      level: 'warning',
      text: '⏹ [DỪNG KHẨN CẤP] Đã dừng tất cả các tiến trình Agent và giải phóng lock.',
    });
  }
  return { success: true };
});

ipcMain.handle('system:reset-database', async (_e, options = {}) => {
  killAllRunningAgents();
  lastEventTs = '';

  const nodeBin = findNodeBin();
  const args = ['reset', '--yes'];
  if (options.keepMedia) {
    args.push('--keep-media');
  }

  return new Promise((resolve) => {
    execFile(
      nodeBin,
      [CLI_PATH, ...args],
      { cwd: PROJECT_ROOT, env: { ...process.env, AUTO_PUBLISHING_ROOT: PROJECT_ROOT } },
      (err, stdout, stderr) => {
        if (err) {
          console.error('Reset error:', err, stderr);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log:event', {
              level: 'error',
              text: `Lỗi khi reset database: ${err.message}`,
            });
          }
          return resolve({ success: false, error: err.message });
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log:event', {
            level: 'info',
            text: '🧹 Đã xoá sạch Database & Dữ liệu sản xuất. Hệ thống đã reset về trạng thái trắng ban đầu!',
          });
        }
        resolve({ success: true, output: stdout });
      }
    );
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
  const remotionCandidates = [
    path.join(PROJECT_ROOT, 'apps', 'remotion'),
    path.join(PROJECT_ROOT, 'remotion'),
  ];
  const remotionDir = remotionCandidates.find((c) => fsSync.existsSync(c)) || remotionCandidates[0];
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
  const SKILL_TITLES = {
    'hook-writing': 'Kỹ Thuật 3 Hook Giữ Chân 2s',
    'viral-storytelling': 'Nghệ Thuật Kể Chuyện Lan Tỏa',
    'humor-satire': 'Hài Hước & Châm Biếm Nhẹ',
    'short-form-retention': 'Tối Ưu Retention Tổng Thể 9:16',
    'endogenism-guardrails': 'Bảo Vệ Triết Lý & Luật Cứng',
    'hardcore-critique': 'Phản Biện Thép & Soi Chi Tiết',
    'compliance-qa': 'Kiểm Định Xuất Xưởng & Safe-Zone 9:16',
    'endogenism-voice': 'Giọng Văn Đồng Hành Sâu Lắng',
    'voice-emotional': 'Ngữ Điệu & Nhịp Thở Cảm Xúc',
    'visual-cinematic': 'Thị Giác Điện Ảnh (Cinematic B-Roll)',
    'motion-typography': 'Kinetic Motion Typography 9:16',
    'content-curation': 'Chắt Lọc Tinh Hoa Ý Tưởng',
    'golden-hour-strategy': 'Chiến Lược Khung Giờ Vàng',
    'algorithm-distribution': 'Tối Ưu Thuật Toán TikTok/Reels',
    'retention-analytics': 'Phân Tích Biểu Đồ Giữ Chân Khán Giả',
    'format-cau-hoi': 'Format: Câu Hỏi Phản Tư (15–20s)',
    'format-doc-cham': 'Format: Đọc Chậm Chiêm Nghiệm (20–30s)',
    'format-goi-ten': 'Format: Gọi Tên Cảm Xúc (30–45s)',
    'format-ngo-nhan': 'Format: Phá Vỡ Ngộ Nhận (30–40s)',
    'format-thuc-hanh': 'Format: Bài Tập Thực Hành (40–60s)',
  };

  const DEFAULT_PROFILES = {
    planner: {
      id: 'planner',
      name: 'Trưởng Ban Nội Dung',
      title: 'Trưởng Ban Nội Dung & Chiến Lược',
      role: 'planner',
      department: 'Phòng Kế Hoạch & Đề Tài',
      avatarIcon: '📚',
      color: '#06b6d4',
      model: 'gpt-4o',
      temperature: 0.4,
      equippedSkills: [
        'content-curation',
        'golden-hour-strategy',
        'format-cau-hoi',
        'format-doc-cham',
        'endogenism-guardrails',
      ],
    },
    writer: {
      id: 'writer',
      name: 'Biên Kịch',
      title: 'Biên Kịch Trưởng (Claude 3.7)',
      role: 'writer',
      department: 'Phòng Sáng Tác Kịch Bản',
      avatarIcon: '✍️',
      color: '#10b981',
      model: 'claude-3-7-sonnet',
      temperature: 0.85,
      equippedSkills: [
        'hook-writing',
        'viral-storytelling',
        'short-form-retention',
        'humor-satire',
        'endogenism-voice',
        'format-ngo-nhan',
      ],
    },
    critic: {
      id: 'critic',
      name: 'Tổng Biên Tập',
      title: 'Tổng Biên Tập & Thẩm Định (GPT-4o)',
      role: 'critic',
      department: 'Ban Kiểm Duyệt Chất Lượng',
      avatarIcon: '⚖️',
      color: '#a855f7',
      model: 'gpt-4o',
      temperature: 0.2,
      equippedSkills: [
        'hardcore-critique',
        'compliance-qa',
        'endogenism-guardrails',
        'short-form-retention',
      ],
    },
    producer: {
      id: 'producer',
      name: 'Kỹ Sư Sản Xuất',
      title: 'Kỹ Sư Sản Xuất Video (Remotion)',
      role: 'producer',
      department: 'Studio Sản Xuất Audio & Visual',
      avatarIcon: '🎬',
      color: '#eab308',
      model: 'remotion-engine',
      temperature: 0.3,
      equippedSkills: [
        'voice-emotional',
        'visual-cinematic',
        'motion-typography',
        'endogenism-voice',
        'short-form-retention',
      ],
    },
    publisher: {
      id: 'publisher',
      name: 'Điều Phối Phát Hành',
      title: 'Điều Phối Phát Hành & Tăng Trưởng',
      role: 'publisher',
      department: 'Trung Tâm Phát Hành & Tăng Trưởng',
      avatarIcon: '🚀',
      color: '#22c55e',
      model: 'social-pub-v1',
      temperature: 0.4,
      equippedSkills: [
        'algorithm-distribution',
        'retention-analytics',
        'golden-hour-strategy',
        'viral-storytelling',
      ],
    },
  };

  const skillsDir = path.join(PROJECT_ROOT, 'skills');
  let availableSkills = [];
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillPath = path.join(skillsDir, ent.name, 'SKILL.md');
      let description = 'Kỹ năng chuyên môn cho Agent';
      try {
        const raw = await fs.readFile(skillPath, 'utf8');
        const matchDesc = raw.match(/description:\s*(.+)/);
        if (matchDesc) description = matchDesc[1].trim();
      } catch {}

      let category = 'writing';
      let icon = '⚡';
      let badge = 'SKILL';
      let targetRoles = ['writer'];

      if (ent.name.startsWith('format-')) {
        category = 'formats';
        icon = '📜';
        badge = 'FORMAT';
        targetRoles = ['writer', 'planner'];
      } else if (ent.name.includes('guardrail')) {
        category = 'core';
        icon = '🛡️';
        badge = 'TRIẾT LÝ';
        targetRoles = ['critic', 'writer', 'planner'];
      } else if (ent.name.includes('voice')) {
        category = 'production';
        icon = '🎙️';
        badge = 'VOICE';
        targetRoles = ['producer', 'writer'];
      } else if (ent.name.includes('hook')) {
        category = 'writing';
        icon = '🪝';
        badge = 'HOOK';
        targetRoles = ['writer'];
      } else if (ent.name.includes('retention') || ent.name.includes('analytics')) {
        category = 'retention';
        icon = '⚡';
        badge = 'RETENTION';
        targetRoles = ['publisher', 'writer', 'producer', 'critic'];
      } else if (ent.name.includes('critique') || ent.name.includes('qa')) {
        category = 'quality';
        icon = '🔍';
        badge = 'KIỂM ĐỊNH';
        targetRoles = ['critic'];
      } else if (ent.name.includes('cinematic') || ent.name.includes('typography')) {
        category = 'production';
        icon = '🎬';
        badge = 'SẢN XUẤT';
        targetRoles = ['producer'];
      } else if (ent.name.includes('curation') || ent.name.includes('strategy') || ent.name.includes('golden')) {
        category = 'strategy';
        icon = '🗓️';
        badge = 'KẾ HOẠCH';
        targetRoles = ['planner', 'publisher'];
      } else if (ent.name.includes('distribution') || ent.name.includes('algorithm')) {
        category = 'distribution';
        icon = '🚀';
        badge = 'PHÁT HÀNH';
        targetRoles = ['publisher'];
      } else if (ent.name.includes('storytelling') || ent.name.includes('humor')) {
        category = 'writing';
        icon = '🔥';
        badge = 'SÁNG TÁC';
        targetRoles = ['writer'];
      }

      availableSkills.push({
        id: ent.name,
        name: ent.name,
        title: SKILL_TITLES[ent.name] || ent.name,
        description,
        category,
        icon,
        badge,
        targetRoles,
      });
    }
  } catch (err) {
    console.error('Failed to list skills:', err);
  }

  let savedProfiles = { ...DEFAULT_PROFILES };
  try {
    const rows = await runSql("SELECT value FROM kv WHERE key = 'agent_skills';");
    if (rows && rows[0]?.value) {
      const parsed = JSON.parse(rows[0].value);
      // Kiểm tra nếu database cũ có profiles bị trùng lặp kỹ năng thì ghi đè bằng default
      for (const [key, val] of Object.entries(parsed)) {
        if (val && Array.isArray(val.equippedSkills) && val.equippedSkills.length > 0) {
          const isGenericDuplicate =
            key !== 'writer' &&
            val.equippedSkills.length === 3 &&
            val.equippedSkills.includes('hook-writing') &&
            val.equippedSkills.includes('endogenism-guardrails');
          if (!isGenericDuplicate) {
            savedProfiles[key] = { ...DEFAULT_PROFILES[key], ...val };
          }
        }
      }
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

function readEnvFile() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const envVars = { ...process.env };
  if (fsSync.existsSync(envPath)) {
    const content = fsSync.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        envVars[key] = val;
      }
    }
  }
  return envVars;
}

function getTokensHealth() {
  const env = readEnvFile();
  const check = (key) => {
    const val = env[key] || '';
    if (!val || val.includes('your_') || val.includes('placeholder')) {
      return { configured: false, status: 'missing', preview: 'Chưa cấu hình' };
    }
    const preview = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : '••••••••';
    return { configured: true, status: 'ok', preview };
  };

  return {
    gemini: check('GEMINI_API_KEY'),
    openai: check('OPENAI_API_KEY'),
    anthropic: check('ANTHROPIC_API_KEY'),
    elevenlabs: check('ELEVENLABS_API_KEY'),
    pixabay: check('PIXABAY_API_KEY'),
    pexels: check('PEXELS_API_KEY'),
    tiktok: check('TIKTOK_ACCESS_TOKEN'),
    instagram: check('INSTAGRAM_ACCESS_TOKEN'),
    youtube: {
      configured: Boolean(env['YOUTUBE_CLIENT_ID'] && env['YOUTUBE_REFRESH_TOKEN']),
      status: (env['YOUTUBE_CLIENT_ID'] && env['YOUTUBE_REFRESH_TOKEN']) ? 'ok' : 'missing',
      preview: env['YOUTUBE_CLIENT_ID'] ? 'OAuth Configured' : 'Chưa cấu hình',
    },
    r2_storage: check('R2_ACCESS_KEY_ID'),
    telegram: check('TELEGRAM_BOT_TOKEN'),
  };
}

ipcMain.handle('system:get-tokens-status', async () => {
  return getTokensHealth();
});

let schedulerInterval = null;
let isSchedulerRunning = false;

function startBackgroundScheduler() {
  if (schedulerInterval) return;
  console.log('⏰ Starting Background Publishing Scheduler Daemon (interval: 60s)...');

  schedulerInterval = setInterval(async () => {
    if (isSchedulerRunning) return;
    try {
      isSchedulerRunning = true;
      // 1. Kiểm tra video đến giờ slot_at
      const readyVideos = await runSql(
        `SELECT id, format, slot_at, status FROM videos WHERE status IN ('ready', 'qa_passed') AND slot_at IS NOT NULL AND slot_at <= datetime('now') LIMIT 3;`
      );

      if (readyVideos && readyVideos.length > 0) {
        console.log(`[Scheduler Daemon] Phát hiện ${readyVideos.length} video tới lịch xuất bản!`);
        for (const v of readyVideos) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scheduler:tick', {
              action: 'auto_publish',
              videoId: v.id,
              slot_at: v.slot_at,
            });
          }
          const nodeBin = findNodeBin();
          const pubChild = spawn(nodeBin, [CLI_PATH, 'publish', '--video-id', String(v.id)], {
            cwd: PROJECT_ROOT,
            env: { ...process.env, AUTO_PUBLISHING_ROOT: PROJECT_ROOT },
          });
          registerChildProcess(pubChild);
        }
      }
    } catch (err) {
      console.error('[Scheduler Daemon Error]:', err.message);
    } finally {
      isSchedulerRunning = false;
    }
  }, 60000);
}

app.whenReady().then(() => {
  createWindow();
  startBackgroundScheduler();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (schedulerInterval) clearInterval(schedulerInterval);
  if (process.platform !== 'darwin') app.quit();
});
