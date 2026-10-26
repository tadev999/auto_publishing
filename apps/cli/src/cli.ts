#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pc from 'picocolors';
import {
  MissingSecret,
  SECRET_NAMES,
  loadArticles,
  makeCtx,
  VideoStatus,
  TikTok,
  LLM,
  produce,
  withLock,
  agents,
  resetDatabase,
} from '@endo/core';

const analyticsAgent = agents.analytics;
const ingestAgent = agents.ingest;
const plannerAgent = agents.planner;
const publisherAgent = agents.publisher;

const program = new Command();
program
  .name('endo')
  .description('Endogenism → Reels & TikTok, fully automated (Pure Node.js / TypeScript)')
  .version('0.1.0');

const AGENT_COLORS: Record<string, (text: string) => string> = {
  ingest: pc.cyan,
  planner: pc.blue,
  writer: pc.green,
  critic: pc.magenta,
  voice: pc.yellow,
  visual: pc.cyan,
  render: pc.blue,
  qa: pc.magenta,
  upload: pc.white,
  publisher: pc.green,
  analytics: pc.yellow,
};

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function printEvent(e: any): void {
  const colorFn = AGENT_COLORS[e.agent] || pc.white;
  const vid = e.video_id ? `#${String(e.video_id).padEnd(4)}` : '     ';
  let ts = '';
  try {
    ts = new Date(e.ts).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    ts = e.ts;
  }

  let msg = e.message;
  if (e.level === 'error') msg = pc.red(msg);
  else if (e.level === 'warning') msg = pc.yellow(msg);

  console.log(`${pc.dim(ts)} ${colorFn(e.agent.padStart(9))} ${vid} ${msg}`);
}

async function handleAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    if (err instanceof MissingSecret) {
      console.error(pc.red(`✗ ${err.message}`));
      process.exit(2);
    }
    console.error(pc.red(`✗ Lỗi: ${err.message || err}`));
    process.exit(1);
  }
}

// 1. DOCTOR
program
  .command('doctor')
  .description('Kiểm tra bí mật API, công cụ và tài nguyên trước khi chạy')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      const s = ctx.settings;
      console.log(pc.bold('=== endo doctor ===\n'));

      const useInstagram = s.publish.platforms.includes('instagram');
      const useTikTok = s.publish.platforms.includes('tiktok');
      const useYouTube = s.publish.platforms.includes('youtube');

      console.log(pc.bold('1. API Keys & Secrets:'));
      for (const name of SECRET_NAMES) {
        const optional = name.startsWith('TELEGRAM');
        const ok = Boolean(s.env[name]);
        let status = '';
        if (ok) {
          status = pc.green('✓');
        } else if ((name === 'ANTHROPIC_API_KEY' || name === 'OPENAI_API_KEY') && s.env['GEMINI_API_KEY']) {
          status = pc.dim('– (dùng Gemini)');
        } else if (name === 'GEMINI_API_KEY' && s.env['ANTHROPIC_API_KEY'] && s.env['OPENAI_API_KEY']) {
          status = pc.dim('– (dùng Claude/GPT)');
        } else if (name === 'GEMINI_API_KEY' || name === 'ANTHROPIC_API_KEY' || name === 'OPENAI_API_KEY') {
          status = pc.yellow('✗ cần GEMINI_API_KEY (hoặc Claude+GPT)');
        } else if (name === 'PEXELS_API_KEY' && s.env['PIXABAY_API_KEY']) {
          status = pc.dim('– (dùng Pixabay)');
        } else if (name === 'PIXABAY_API_KEY' && s.env['PEXELS_API_KEY']) {
          status = pc.dim('– (dùng Pexels)');
        } else if (name === 'PIXABAY_API_KEY' || name === 'PEXELS_API_KEY') {
          status = pc.yellow('✗ cần 1 trong 2 (Pixabay/Pexels)');
        } else if ((name.startsWith('R2_') || name.startsWith('IG_')) && !useInstagram) {
          status = pc.dim('– (tạm đóng / chưa bật Instagram)');
        } else if (name.startsWith('TIKTOK_') && !useTikTok) {
          status = pc.dim('– (tạm đóng / chưa bật TikTok)');
        } else if (name.startsWith('YOUTUBE_') && !useYouTube) {
          status = pc.dim('– (chưa bật YouTube)');
        } else if (optional) {
          status = pc.yellow('– (tuỳ chọn)');
        } else {
          status = pc.red('✗ thiếu');
        }
        console.log(`  ${name.padEnd(25)} ${status}`);
      }

      console.log(pc.bold('\n2. Binary tools:'));
      const { requireBin } = await import('@endo/core');
      for (const bin of ['node', 'npx', 'ffmpeg', 'ffprobe']) {
        let ok = false;
        try {
          if (bin === 'ffmpeg' || bin === 'ffprobe') {
            requireBin(bin);
            ok = true;
          } else {
            const { execSync } = await import('node:child_process');
            execSync(`which ${bin}`, { stdio: 'ignore' });
            ok = true;
          }
        } catch {}
        console.log(`  ${bin.padEnd(25)} ${ok ? pc.green('✓') : pc.red('✗ chưa cài')}`);
      }

      console.log(pc.bold('\n3. Dự án & Nội dung:'));
      const remotionOk = fs.existsSync(path.join(s.path('remotion_dir'), 'node_modules'));
      console.log(
        `  ${'remotion/node_modules'.padEnd(25)} ${
          remotionOk ? pc.green('✓') : pc.red('✗ chạy npm install trong remotion/')
        }`
      );

      const articles = loadArticles(s.path('content_dir'));
      console.log(`  ${'Bài viết gốc'.padEnd(25)} ${articles.length} bài`);

      const ideas = ctx.db.one<any>('SELECT COUNT(*) AS n FROM ideas')?.n ?? 0;
      console.log(
        `  ${'Kho ý tưởng'.padEnd(25)} ${
          ideas ? `${ideas} ý tưởng` : pc.yellow('trống — chạy endo ingest')
        }`
      );

      console.log(`  ${'Kênh xuất bản'.padEnd(25)} ${pc.cyan(s.publish.platforms.join(', '))}`);

      if (useTikTok) {
        const ttTokens = ctx.db.getKv('tiktok_tokens');
        console.log(
          `  ${'TikTok OAuth'.padEnd(25)} ${
            ttTokens ? pc.green('✓') : pc.yellow('chưa — chạy endo tiktok-auth')
          }`
        );
        console.log(`  ${'TikTok mode'.padEnd(25)} ${s.publish.tiktok_mode}`);
      }

      console.log(`  ${'Chế độ đăng'.padEnd(25)} ${s.publish.dry_run ? pc.yellow('DRY RUN') : pc.green('LIVE')}`);
      console.log(
        `  ${'Tạm dừng'.padEnd(25)} ${ctx.db.getKv('paused') ? pc.red('CÓ') : pc.green('không')}\n`
      );
    })
  );

// 2. INGEST
program
  .command('ingest')
  .description('Tách các bài viết thành các ý tưởng video (ingest ideas)')
  .option('-f, --force', 'Ép chạy lại cả các bài chưa đổi')
  .option('-l, --limit <number>', 'Giới hạn số bài xử lý', parseInt)
  .option('-a, --article <id>', 'Chỉ bài này, e.g. bai-001')
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      const llm = new LLM(ctx.settings);
      await ingestAgent.run(ctx, llm, {
        force: opts.force,
        limit: opts.limit,
        only: opts.article,
      });
    })
  );

// 3. PLAN
program
  .command('plan')
  .description('Lên lịch phát sóng cho các ngày tới')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      plannerAgent.run(ctx);
    })
  );

// 4. PRODUCE
program
  .command('produce')
  .description('Sản xuất video: Write → Critic → Voice → Render → QA → Upload')
  .option('-l, --limit <number>', 'Xử lý tối đa N video', parseInt)
  .option('-v, --video <ids...>', 'Chỉ những video IDs này')
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      const llm = new LLM(ctx.settings);
      const vids = opts.video ? opts.video.map((id: string) => parseInt(id, 10)) : undefined;
      const stats = await produce(ctx, llm, { limit: opts.limit, videoIds: vids });
      console.log('Thống kê:', stats);
    })
  );

// 5. DAILY
program
  .command('daily')
  .description('Tự động chạy định kỳ: Lên lịch và sản xuất')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      const llm = new LLM(ctx.settings);
      const { acquired } = await withLock(ctx, 'daily', async () => {
        plannerAgent.run(ctx);
        const stats = await produce(ctx, llm);
        console.log('Hoàn tất daily:', stats);
      });
      if (!acquired) {
        console.log(pc.yellow('daily đang chạy ở tiến trình khác — bỏ qua.'));
      }
    })
  );

// 6. PUBLISH
program
  .command('publish')
  .description('Đăng các video đã tới giờ slot')
  .option('-v, --video-id <id>', 'Đăng ngay 1 video cụ thể', parseInt)
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      const { acquired } = await withLock(ctx, 'publish', async () => {
        if (opts.videoId) {
          const v = ctx.db.video(opts.videoId);
          if (!v) {
            console.error(pc.red(`Không tìm thấy video #${opts.videoId}`));
            return;
          }
          await publisherAgent.publishVideo(ctx, v);
          console.log(`Đã xuất bản video #${opts.videoId}`);
        } else {
          const count = await publisherAgent.run(ctx);
          console.log(`Đã xuất bản ${count} video.`);
        }
      });
      if (!acquired) {
        console.log(pc.yellow('publish đang chạy ở tiến trình khác — bỏ qua.'));
      }
    })
  );

// 7. ANALYTICS
program
  .command('analytics')
  .description('Thu thập số liệu đo lường 24h/72h')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      const { acquired } = await withLock(ctx, 'analytics', async () => {
        const count = await analyticsAgent.collect(ctx);
        console.log(`Đã thu thập số liệu cho ${count} lượt phát.`);
      });
      if (!acquired) {
        console.log(pc.yellow('analytics đang chạy ở tiến trình khác — bỏ qua.'));
      }
    })
  );

// 8. REPORT
program
  .command('report')
  .description('Xem báo cáo tuần')
  .option('--no-send', 'Không gửi tới Telegram')
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      const text = await analyticsAgent.weeklyReport(ctx, opts.send);
      console.log(pc.cyan('\n' + text + '\n'));
    })
  );

// 9. STATUS
program
  .command('status')
  .description('Tổng quan pipeline và hàng đợi video')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      const counts: Record<string, number> = {};
      for (const r of ctx.db.all<any>(
        'SELECT status, COUNT(*) AS n FROM videos GROUP BY status'
      )) {
        counts[r.status] = r.n;
      }

      console.log(pc.bold('Trạng thái video:'));
      console.log(
        Object.values(VideoStatus)
          .map((st) => `${st}: ${pc.bold(counts[st] || 0)}`)
          .join(' | ')
      );

      const ideas: Record<string, number> = {};
      for (const r of ctx.db.all<any>(
        'SELECT status, COUNT(*) AS n FROM ideas GROUP BY status'
      )) {
        ideas[r.status] = r.n;
      }
      console.log(
        `Kho ý tưởng: ${ideas.available || 0} còn · ${ideas.used || 0} đã dùng · ${
          ideas.skipped || 0
        } bị loại\n`
      );

      const upcoming = ctx.db.all<any>(
        `SELECT v.id, v.slot_at, v.format, v.episode, v.status, v.article_id, v.script, v.critic
         FROM videos v WHERE v.status NOT IN ('published', 'measured', 'failed') ORDER BY v.slot_at LIMIT 15`
      );

      console.log(pc.bold('Sắp tới:'));
      for (const v of upcoming) {
        const script = v.script ? (typeof v.script === 'string' ? JSON.parse(v.script) : v.script) : {};
        const review = v.critic ? (typeof v.critic === 'string' ? JSON.parse(v.critic) : v.critic) : {};
        const hook =
          script.final_beats && script.final_beats[0]
            ? script.final_beats[0].text
            : '';
        console.log(
          `#${String(v.id).padEnd(4)} ${formatLocal(v.slot_at).padEnd(18)} ${v.format.padEnd(10)} #${v.episode} ` +
          `[${v.status}] ${v.article_id} Điểm: ${review.total || '-'} | ${hook.slice(0, 50)}`
        );
      }

      if (ctx.db.getKv('paused')) {
        console.log(pc.red('\n⏸  Đăng bài đang TẠM DỪNG'));
      }
    })
  );

// 10. SHOW
program
  .command('show <videoId>')
  .description('Chi tiết toàn bộ thông tin của 1 video')
  .action((videoId) =>
    handleAction(async () => {
      const ctx = makeCtx();
      const v = ctx.db.video(parseInt(videoId, 10));
      if (!v) {
        console.error(pc.red(`Không tìm thấy video #${videoId}`));
        return;
      }

      const script = v.script ? (typeof v.script === 'string' ? JSON.parse(v.script) : v.script) : {};
      const review = v.critic ? (typeof v.critic === 'string' ? JSON.parse(v.critic) : v.critic) : {};
      const media = v.media ? (typeof v.media === 'string' ? JSON.parse(v.media) : v.media) : {};

      console.log(
        pc.bold(
          `\nVideo #${v.id} · ${v.format} #${v.episode} · ${formatLocal(v.slot_at)} · ${v.article_id} · [${v.status}]`
        )
      );
      if (v.error) console.log(pc.red(`Lỗi: ${v.error}`));

      if (script.hooks) {
        console.log('\nHooks:');
        for (const h of script.hooks) {
          console.log(`  [${h.style}] ${h.text}`);
        }
      }
      if (script.final_beats || script.beats) {
        console.log('\nBeats:');
        for (const b of script.final_beats || script.beats) {
          console.log(`  ${b.role.padStart(10)}: ${b.text}`);
        }
      }
      if (script.caption) {
        console.log(`\nCaption: ${script.caption}`);
        console.log(`Tags: ${(script.hashtags || []).join(' ')}`);
      }

      if (review.round) {
        console.log(
          `\nCritic vòng ${review.round}: tổng ${review.total}/10 · Điểm: ${JSON.stringify(review.scores)}`
        );
        for (const f of [...(review.violations || []), ...(review.feedback || [])]) {
          console.log(`  - ${f}`);
        }
      }

      if (media.video) {
        console.log(`\nVideo path: ${ctx.settings.dataDir}/media/${String(v.id).padStart(5, '0')}/${media.video}`);
      }

      const pubs = ctx.db.all<any>('SELECT * FROM publications WHERE video_id = ?', v.id);
      if (pubs.length > 0) {
        console.log('\nXuất bản:');
        for (const p of pubs) {
          console.log(`  ${p.platform}: ${p.status} ${p.permalink || ''} ${p.error || ''}`);
        }
      }

      console.log('\nDòng thời gian:');
      const events = ctx.db.all<any>('SELECT * FROM events WHERE video_id = ? ORDER BY id', v.id);
      for (const e of events) {
        printEvent(e);
      }
      console.log();
    })
  );

// 11. WATCH
program
  .command('watch')
  .description('Theo dõi live feed hoạt động của các agents')
  .option('-n, --history <count>', 'Số sự kiện gần nhất', (v) => parseInt(v, 10), 20)
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      let rows = ctx.db.all<any>(
        'SELECT * FROM events ORDER BY id DESC LIMIT ?',
        opts.history
      ).reverse();

      let lastId = 0;
      for (const e of rows) {
        printEvent(e);
        lastId = e.id;
      }

      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        rows = ctx.db.all<any>('SELECT * FROM events WHERE id > ? ORDER BY id', lastId);
        for (const e of rows) {
          printEvent(e);
          lastId = e.id;
        }
      }
    })
  );

// 12. PAUSE / RESUME
program
  .command('pause')
  .description('Dừng khẩn cấp: ngừng đăng bài')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      ctx.db.setKv('paused', true);
      ctx.event('publisher', '⏸  TẠM DỪNG đăng bài', { level: 'warning' });
      console.log(pc.yellow('Đã tạm dừng xuất bản.'));
    })
  );

program
  .command('resume')
  .description('Tiếp tục xuất bản')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      ctx.db.setKv('paused', false);
      ctx.event('publisher', '▶  Tiếp tục đăng bài');
      console.log(pc.green('Đã tiếp tục xuất bản.'));
    })
  );

// 13. TIKTOK-AUTH
program
  .command('tiktok-auth')
  .description('OAuth xác thực tài khoản TikTok')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      const tt = new TikTok(ctx.settings, ctx.db);
      const { randomBytes } = await import('node:crypto');
      const state = randomBytes(16).toString('hex');
      const url = tt.authorizeUrl(state);

      console.log(pc.cyan('\n1. Mở link này trong trình duyệt, đăng nhập TikTok và bấm Cho phép:'));
      console.log(pc.underline(url));

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('\n2. Dán URL trình duyệt chuyển tới (hoặc chỉ mã code): ', async (answer) => {
        rl.close();
        let code = answer.trim();
        if (code.startsWith('http')) {
          const parsed = new URL(code);
          const returnedState = parsed.searchParams.get('state');
          if (returnedState !== state) {
            console.error(pc.red('✗ state không khớp — hãy chạy lại lệnh và dùng đúng link mới.'));
            process.exit(1);
          }
          code = parsed.searchParams.get('code') || '';
        }
        const tokens = await tt.exchangeCode(code);
        console.log(pc.green(`✓ Đã kết nối TikTok thành công. Quyền: ${tokens.scope}`));
      });
    })
  );

// 14. DEMO
program
  .command('demo')
  .description('Chạy thử toàn bộ chu trình multi-agent offline (không cần API keys)')
  .action(() =>
    handleAction(async () => {
      const { runDemoWalkthrough } = await import('./demo_walkthrough.js');
      await runDemoWalkthrough();
    })
  );

// 15. STOP ALL AGENTS
program
  .command('stop')
  .description('Dừng khẩn cấp: ngừng tất cả agent và giải phóng khóa tiến trình (locks)')
  .action(() =>
    handleAction(async () => {
      const ctx = makeCtx();
      ctx.db.setKv('paused', true);

      const lockDir = path.join(ctx.settings.dataDir, 'locks');
      let killed = 0;
      if (fs.existsSync(lockDir)) {
        for (const lf of fs.readdirSync(lockDir)) {
          const lp = path.join(lockDir, lf);
          try {
            const pid = parseInt(fs.readFileSync(lp, 'utf8').trim(), 10);
            if (pid && !isNaN(pid)) {
              try {
                process.kill(pid, 'SIGTERM');
                killed++;
              } catch {}
            }
            fs.unlinkSync(lp);
          } catch {}
        }
      }

      ctx.event('publisher', '⏹  ĐÃ DỪNG TẤT CẢ AGENT', { level: 'warning' });
      console.log(pc.yellow(`✓ Đã dừng các agent và dọn sạch locks (tiến trình dừng: ${killed}).`));
    })
  );

// 16. RESET
program
  .command('reset')
  .description('Dừng toàn bộ agent và xoá sạch database/media để chạy lại từ đầu')
  .option('-y, --yes', 'Bỏ qua xác nhận')
  .option('--keep-media', 'Giữ lại các file video/audio đã render trong data/media')
  .action((opts) =>
    handleAction(async () => {
      const ctx = makeCtx();
      ctx.db.close();

      const proceed = opts.yes
        ? true
        : await new Promise<boolean>((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question(
              pc.red('⚠️  Hành động này sẽ dừng các agent và XOÁ TOÀN BỘ dữ liệu (bài viết, ý tưởng, video, events) trong SQLite!\nBạn có chắc chắn muốn reset từ đầu? (y/N): '),
              (ans) => {
                rl.close();
                resolve(ans.trim().toLowerCase() === 'y');
              }
            );
          });

      if (!proceed) {
        console.log(pc.yellow('Đã hủy thao tác reset.'));
        return;
      }

      console.log(pc.cyan('Đang dừng các tiến trình và dọn dẹp database...'));

      // Dọn lock và kill tiến trình đang giữ lock
      const lockDir = path.join(ctx.settings.dataDir, 'locks');
      if (fs.existsSync(lockDir)) {
        for (const lf of fs.readdirSync(lockDir)) {
          const lp = path.join(lockDir, lf);
          try {
            const pid = parseInt(fs.readFileSync(lp, 'utf8').trim(), 10);
            if (pid && !isNaN(pid)) {
              try { process.kill(pid, 'SIGTERM'); } catch {}
            }
          } catch {}
        }
      }

      resetDatabase(ctx.settings.dataDir, { keepMedia: opts.keepMedia });
      console.log(pc.green('✓ Đã xoá database và khởi tạo lại trạng thái sạch sẽ ban đầu.'));
      console.log(pc.dim('Bây giờ bạn có thể bắt đầu lại bằng lệnh: endo ingest && endo plan'));
    })
  );

program.parse(process.argv);
