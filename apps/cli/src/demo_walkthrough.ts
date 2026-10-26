import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  loadArticles,
  normalize,
  makeCtx,
  VideoStatus,
  utcnow,
  probe,
  requireBin,
  runFfmpeg,
  videoDir,
  Beat,
  CriticReport,
  Hook,
  Script,
} from '@endo/core';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemoWalkthrough(): Promise<boolean> {
  const ctx = makeCtx();
  console.log('==================================================');
  console.log('🚀 BẮT ĐẦU CHẠY THỬ HỆ THỐNG (OFFLINE / MOCK MODE)');
  console.log('==================================================\n');

  // 1. Ingest
  console.log('--- [BƯỚC 1: INGEST] Tách ý tưởng từ bài viết gốc ---');
  const articles = loadArticles(ctx.settings.path('content_dir'));
  const targetArticles = articles.filter((a) => ['bai-001', 'bai-002'].includes(a.id));

  const fixturePath = path.resolve(ctx.settings.path('data_dir'), '../packages/core/src/fixtures/demo_ideas.json');
  let ideasData: any[] = [];
  if (fs.existsSync(fixturePath)) {
    ideasData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  } else {
    // Fallback nếu chạy ở môi trường build production
    const fallbackPath = path.resolve(process.cwd(), 'packages/core/src/fixtures/demo_ideas.json');
    if (fs.existsSync(fallbackPath)) {
      ideasData = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
    }
  }

  ctx.db.tx(() => {
    for (const art of targetArticles) {
      ctx.db.run(
        `INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash, ingested_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title`,
        art.id,
        art.machSlug,
        art.machIndex,
        art.machTitle,
        art.number,
        art.title,
        art.path,
        art.contentHash,
        utcnow()
      );
      ctx.db.run(
        "DELETE FROM ideas WHERE article_id = ? AND status = 'available' AND id NOT IN (SELECT idea_id FROM videos WHERE idea_id IS NOT NULL)",
        art.id
      );
    }

    for (const item of ideasData) {
      const art = targetArticles.find((a) => a.id === item.article_id);
      if (!art) continue;
      const src = normalize(art.body);
      const verifiedQuotes = (item.quotes || []).filter((q: string) => src.includes(normalize(q)));

      ctx.db.run(
        `INSERT INTO ideas(article_id, angle, insight, quotes, metaphor, practice, question, emotion,
                             hook_seed, formats, primary_format, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.article_id,
        item.angle,
        item.insight,
        JSON.stringify(verifiedQuotes),
        item.metaphor,
        item.practice,
        item.question,
        item.emotion,
        item.hook_seed,
        JSON.stringify(item.formats),
        item.formats[0],
        utcnow()
      );
      ctx.event('ingest', `Tách thành công ý tưởng: "${item.angle}" từ ${item.article_id}`);
    }
  });

  const countIdeas = ctx.db.one<any>('SELECT COUNT(*) AS n FROM ideas').n;
  console.log(`✅ Ingest xong. Tổng số ý tưởng trong kho: ${countIdeas}\n`);
  await sleep(2200);

  // 2. Planner
  console.log('--- [BƯỚC 2: PLANNER] Lên lịch phát sóng cho slot sắp tới ---');
  const now = new Date();
  const existingSlots = new Set(
    (ctx.db.all<any>("SELECT slot_at FROM videos WHERE status != 'failed'") || []).map((r) => r.slot_at)
  );
  let slotTime = now.getTime() + 3600000;
  while (existingSlots.has(new Date(slotTime).toISOString().replace(/\.\d{3}Z$/, 'Z'))) {
    slotTime += 3600000;
  }
  const slotAt = new Date(slotTime).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const formatName = 'goi-ten';

  const ideaRow = ctx.db.one<any>(
    "SELECT * FROM ideas WHERE status = 'available' AND primary_format = ? LIMIT 1",
    formatName
  );
  if (!ideaRow) {
    throw new Error(`Không tìm thấy ý tưởng cho format ${formatName}`);
  }

  let videoId = 0;
  ctx.db.tx(() => {
    videoId = ctx.db.run(
      `INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, created_at, updated_at)
       VALUES(?, ?, ?, ?, 1, ?, ?, ?)`,
      ideaRow.id,
      ideaRow.article_id,
      formatName,
      slotAt,
      VideoStatus.PLANNED,
      utcnow(),
      utcnow()
    );
    ctx.db.run("UPDATE ideas SET status = 'used' WHERE id = ?", ideaRow.id);
  });
  ctx.event('planner', `Lên lịch Video #${videoId} (${formatName} #1) lúc ${slotAt}`, { videoId });
  console.log(`✅ Đã tạo Video #${videoId} trong hàng đợi với trạng thái PLANNED.\n`);
  await sleep(2200);

  // 3. Writer
  console.log('--- [BƯỚC 3: WRITER] Viết kịch bản mẫu với 3 hook styles ---');
  const mockScript: Script = {
    hooks: [
      {
        style: 'reversal',
        text: 'Có một kiểu kiệt sức mà ngủ mười tiếng mỗi đêm cũng không thể nào đỡ được.',
      },
      {
        style: 'naming',
        text: 'Bạn không lười. Bạn chỉ đang kiệt sức vì mang một chiếc mặt nạ quá lâu.',
      },
      {
        style: 'question',
        text: 'Mỗi sáng thức dậy, câu hỏi đầu tiên xuất hiện trong đầu bạn là gì?',
      },
    ],
    beats: [
      {
        role: 'line',
        text: 'Chúng ta thường nghĩ mệt mỏi là do công việc, do thiếu ngủ, do áp lực bên ngoài.',
        emphasis: ['mệt mỏi', 'áp lực'],
      },
      {
        role: 'myth',
        text: 'Nhưng có một năng lượng hao tổn ngầm: việc bạn phải gồng mình để làm vừa lòng tất cả.',
        emphasis: ['hao tổn ngầm', 'gồng mình'],
      },
      {
        role: 'truth',
        text: 'Khi bạn không dám nói từ chối, chính cơ thể bạn sẽ phải lên tiếng bằng sự suy kiệt.',
        emphasis: ['từ chối', 'suy kiệt'],
      },
      {
        role: 'close',
        text: 'Sống thật với cảm xúc của mình không phải ích kỷ, đó là cách duy nhất để tồn tại.',
        emphasis: ['sống thật', 'cách duy nhất'],
      },
    ],
    caption: 'Kiệt sức mãn tính không bắt đầu từ cơ bắp, nó bắt đầu từ việc bạn từ chối lắng nghe chính mình.',
    hashtags: ['#noisinh', '#endogenism', '#chualanh', '#tamly'],
    visual_keywords: ['lonely rainy window', 'quiet morning tea', 'slow ocean waves'],
    self_check: 'Script viết theo đúng luật cứng Endogenism.',
  };

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.SCRIPTED,
    script: mockScript,
  });
  ctx.event('writer', 'Hoàn thành bản nháp kịch bản vòng 1 với 3 hook', { videoId });
  console.log('✅ Writer tạo kịch bản xong:');
  console.log(`   Hook: ${mockScript.hooks[0].text}\n`);
  await sleep(2200);

  // 4. Critic
  console.log('--- [BƯỚC 4: CRITIC] Thẩm định chất lượng kịch bản ---');
  const mockCritic: CriticReport = {
    scores: {
      hook: 9.0,
      philosophy: 9.5,
      single_idea: 9.0,
      voice: 9.0,
      ending: 8.5,
      readability: 9.0,
    },
    best_hook_index: 0,
    violations: [],
    feedback: ['Nhịp điệu rất tốt, giọng ấm và đúng phong cách Nội Sinh.'],
  };

  const finalBeats: Beat[] = [
    { role: 'hook', text: mockScript.hooks[0].text, emphasis: ['kiệt sức'] },
    ...mockScript.beats,
  ];
  const finalScript = { ...mockScript, final_beats: finalBeats };

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.APPROVED,
    script: finalScript,
    critic: {
      round: 1,
      total: 9.1,
      passed: true,
      scores: mockCritic.scores,
      best_hook_index: 0,
      violations: [],
      feedback: mockCritic.feedback,
    },
    critic_rounds: 1,
    hook_style: mockScript.hooks[0].style,
  });
  ctx.event('critic', 'DUYỆT vòng 1: 9.1/10 · hook [reversal]', { videoId });
  console.log('✅ Critic thông qua kịch bản với điểm 9.1/10.\n');
  await sleep(2200);

  // 5. Voice
  console.log('--- [BƯỚC 5: VOICE] Tạo giọng đọc mẫu và căn chỉnh phụ đề ---');
  const outDir = videoDir(ctx.settings.dataDir, videoId);
  const publicDir = path.join(outDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const voicePath = path.join(publicDir, 'voice.mp3');
  // Generate 15s clean tone MP3
  try {
    runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=15',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      voicePath,
    ]);
  } catch (err) {
    console.warn('Voice fallback generation error:', err);
  }

  // Create timed captions
  const pages: any[] = [];
  let t = 0.5;
  for (const beat of finalBeats) {
    const wordsList = beat.text.split(' ');
    const pageDuration = 2.5;
    const wordInterval = pageDuration / wordsList.length;
    const wordsObj = wordsList.map((w, idx) => ({
      text: w,
      start: Number((t + idx * wordInterval).toFixed(2)),
      end: Number((t + (idx + 1) * wordInterval).toFixed(2)),
      emphasis: beat.emphasis.some((e) => w.toLowerCase().includes(e.toLowerCase())),
    }));
    pages.push({
      start: Number(t.toFixed(2)),
      end: Number((t + pageDuration).toFixed(2)),
      role: beat.role,
      words: wordsObj,
    });
    t += pageDuration + 0.3;
  }

  const captionsData = {
    speech_end: Number(t.toFixed(2)),
    duration: Number((t + 1.0).toFixed(2)),
    pages,
  };
  fs.writeFileSync(path.join(outDir, 'captions.json'), JSON.stringify(captionsData, null, 2), 'utf-8');

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.VOICED,
    media: {
      voice: 'voice.mp3',
      captions: 'captions.json',
      speech_seconds: captionsData.speech_end,
    },
  });
  ctx.event('voice', `Giọng đọc ${captionsData.speech_end}s · ${pages.length} khung phụ đề`, { videoId });
  console.log(`✅ Voice hoàn tất: thời lượng ${captionsData.duration}s.\n`);
  await sleep(2200);

  // 6. Visual & Render
  console.log('--- [BƯỚC 6: RENDER] Dựng video dọc 9:16 bằng Remotion ---');
  const remotionDir = ctx.settings.path('remotion_dir');
  const propsPath = path.join(outDir, 'props.json');
  const props = {
    format: formatName,
    label: 'GỌI TÊN',
    episode: 1,
    handle: '@noisinh.vn',
    pages: captionsData.pages,
    durationInSeconds: captionsData.duration,
    voice: 'voice.mp3',
    music: null,
    musicVolume: 0.15,
    clips: [],
    seed: videoId,
  };
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2), 'utf-8');

  const finalVideo = path.join(outDir, 'video.mp4');
  console.log('Đang gọi Remotion render (1080x1920 h264)...');
  try {
    execFileSync(
      'npx',
      [
        'remotion',
        'render',
        'src/index.ts',
        formatName,
        finalVideo,
        `--props=${propsPath}`,
        `--public-dir=${publicDir}`,
        '--codec=h264',
        '--crf=20',
        '--log=error',
      ],
      { cwd: remotionDir, stdio: 'inherit', timeout: 120000 }
    );
  } catch {
    console.log('Remotion render timeout/bận, sử dụng FFmpeg render chuẩn 9:16...');
    runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'nullsrc=s=1080x1920:d=15.5:r=30',
      '-i',
      voicePath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      finalVideo,
    ]);
  }

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.RENDERED,
    media: {
      voice: 'voice.mp3',
      captions: 'captions.json',
      video: 'video.mp4',
    },
  });
  ctx.event('render', `Dựng xong video MP4 -> ${finalVideo}`, { videoId });
  console.log(`✅ Render hoàn tất: ${finalVideo}\n`);
  await sleep(2200);

  // 7. QA
  console.log('--- [BƯỚC 7: QA] Kiểm tra thông số kỹ thuật video ---');
  const probeInfo = probe(finalVideo);
  console.log(`   Kích thước: ${probeInfo.width}x${probeInfo.height}`);
  console.log(`   Thời lượng: ${probeInfo.duration.toFixed(1)}s`);
  console.log(`   Âm thanh: ${probeInfo.hasAudio ? 'CÓ' : 'KHÔNG'}`);

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.QA_PASSED,
    media: {
      voice: 'voice.mp3',
      captions: 'captions.json',
      video: 'video.mp4',
      video_path: finalVideo,
      width: probeInfo.width,
      height: probeInfo.height,
      duration: probeInfo.duration,
    },
  });
  ctx.event('qa', `Đạt kiểm định: ${probeInfo.duration.toFixed(1)}s, ${probeInfo.width}x${probeInfo.height} (9:16 Full HD)`, {
    videoId,
  });
  console.log('✅ QA kiểm định thành công.\n');
  await sleep(2200);

  // 8. Upload & Publisher (Distribution to TikTok & Instagram Reels)
  console.log('--- [BƯỚC 8: ĐIỀU PHỐI & PHÁT HÀNH] Xuất bản đa nền tảng theo Khung Giờ Vàng ---');
  ctx.db.updateVideo(videoId, { status: VideoStatus.QUEUED });
  ctx.event('upload', `Đóng gói siêu dữ liệu Video #${videoId}: 1080x1920, thẻ hashtag #noisinh #endogenism #tamly #chualanh`, {
    videoId,
  });
  console.log('📦 Điều phối: Đã đóng gói metadata, phụ đề và thẻ tag.');
  await sleep(2200);

  console.log('🚀 Điều phối: Đang phân phối lên TikTok (@noisinh.vn) và Instagram Reels...');
  ctx.db.run(
    `INSERT INTO publications(video_id, platform, status, published_at)
     VALUES(?, 'tiktok', 'published', ?), (?, 'instagram', 'published', ?)`,
    videoId,
    utcnow(),
    videoId,
    utcnow()
  );

  ctx.event('publisher', `[TIKTOK] Đã xuất bản lên TikTok @noisinh.vn lúc khung giờ vàng · ID: tt_${videoId}_live`, {
    videoId,
  });
  await sleep(2200);

  ctx.event('publisher', `[INSTAGRAM] Đã xuất bản lên Reels @noisinh.vn với audio gốc · ID: ig_${videoId}_reels`, {
    videoId,
  });
  await sleep(2200);

  ctx.db.updateVideo(videoId, { status: VideoStatus.PUBLISHED });

  ctx.event('analytics', `Kích hoạt tiến trình giám sát số liệu Retention Rate (giữ chân 3s) và View Completion sau 24h`, {
    videoId,
  });
  console.log(`✅ Xuất bản hoàn tất cho Video #${videoId} trên cả TikTok & Instagram Reels!\n`);
  await sleep(2200);

  console.log('==================================================');
  console.log('🎉 TOÀN BỘ QUY TRÌNH MULTI-AGENT ĐÃ CHẠY THÀNH CÔNG (100% NODE/TS)!');
  console.log(`File video hoàn chỉnh: ${finalVideo}`);
  console.log('==================================================');

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemoWalkthrough().catch((err) => {
    console.error('Demo walkthrough failed:', err);
    process.exit(1);
  });
}
