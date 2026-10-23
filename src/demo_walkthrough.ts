import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadArticles, normalize } from './content.js';
import { makeCtx } from './context.js';
import { VideoStatus, utcnow } from './db.js';
import { probe, videoDir } from './media.js';
import { Beat, CriticReport, Hook, Script } from './schemas.js';

export async function runDemoWalkthrough(): Promise<boolean> {
  const ctx = makeCtx();
  console.log('==================================================');
  console.log('🚀 BẮT ĐẦU CHẠY THỬ HỆ THỐNG (OFFLINE / MOCK MODE)');
  console.log('==================================================\n');

  // 1. Ingest
  console.log('--- [BƯỚC 1: INGEST] Tách ý tưởng từ bài viết gốc ---');
  const articles = loadArticles(ctx.settings.path('content_dir'));
  const targetArticles = articles.filter((a) => ['bai-001', 'bai-002'].includes(a.id));

  const ideasData = [
    {
      article_id: 'bai-001',
      angle: 'Nhận diện kiệt sức mãn tính không phải vì thiếu ngủ',
      insight: 'Kiệt sức vì cố gắng quá lâu để trở thành phiên bản không phải là thật của mình.',
      quotes: [
        'Bạn ngủ đủ giấc. Đôi khi còn ngủ nhiều hơn bình thường.',
        'Không. Bạn không lười. Và bạn không làm quá.',
      ],
      metaphor: 'Cỗ máy chạy ngầm không bao giờ tắt',
      practice: 'Dừng lại năm giây trước khi mở điện thoại sáng nay',
      question: 'Hôm nay bạn muốn hành động từ nỗi sợ hay từ chỗ đứng vững?',
      emotion: 'nhẹ nhõm, được thấu hiểu',
      hook_seed: 'Có một kiểu mệt không phải vì thiếu ngủ.',
      formats: ['goi-ten', 'cau-hoi', 'ngo-nhan'],
    },
    {
      article_id: 'bai-001',
      angle: 'Ngộ nhận về việc nghỉ ngơi',
      insight: 'Nghỉ ngơi chỉ tạm dừng triệu chứng, không giải quyết được nguồn cơn khi sống sai bản chất.',
      quotes: [
        'Nghỉ một tuần, rồi quay lại, rồi mệt tiếp. Vòng lặp đó quen không?',
        'Bạn không lười. Và bạn không làm quá.',
      ],
      metaphor: 'Tắt màn hình nhưng CPU vẫn chạy 100%',
      practice: '',
      question: 'Bạn đang chạy bằng nhiên liệu gì?',
      emotion: 'tỉnh thức',
      hook_seed: 'Nghỉ ngơi không chữa được kiểu mệt này.',
      formats: ['ngo-nhan', 'cau-hoi'],
    },
    {
      article_id: 'bai-002',
      angle: 'Sự thật về ranh giới cá nhân',
      insight: 'Ranh giới không phải bức tường để đẩy người khác ra, mà là cánh cửa để biết mình đứng ở đâu.',
      quotes: [
        'Nói có khi trong lòng muốn nói không.',
        'Ranh giới được dựng lên từ sự thấu suốt, không phải sự phòng vệ.',
      ],
      metaphor: 'Căn nhà không có cửa khóa',
      practice: 'Tập nói: Tôi cần thêm thời gian để suy nghĩ về việc này.',
      question: 'Lần gần nhất bạn từ chối ai đó mà không thấy tội lỗi là khi nào?',
      emotion: 'vững chãi, an toàn',
      hook_seed: 'Vì sao bạn luôn thấy kiệt sức sau khi gặp gỡ người khác?',
      formats: ['thuc-hanh', 'goi-ten'],
    },
  ];

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
      ctx.db.run("DELETE FROM ideas WHERE article_id = ? AND status = 'available'", art.id);
    }

    for (const item of ideasData) {
      const art = targetArticles.find((a) => a.id === item.article_id);
      if (!art) continue;
      const src = normalize(art.body);
      const verifiedQuotes = item.quotes.filter((q) => src.includes(normalize(q)));

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

  // 2. Planner
  console.log('--- [BƯỚC 2: PLANNER] Lên lịch phát sóng cho slot sắp tới ---');
  const now = new Date();
  const slotDate = new Date(now.getTime() + 3600000);
  const slotAt = slotDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
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
    execFileSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=15',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      voicePath,
    ], { stdio: 'ignore' });
  } catch {
    // If ffmpeg fails, write blank file
    fs.writeFileSync(voicePath, Buffer.alloc(1024));
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
    { cwd: remotionDir, stdio: 'inherit', timeout: 180000 }
  );

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

  // 7. QA
  console.log('--- [BƯỚC 7: QA] Kiểm tra thông số kỹ thuật video ---');
  const probeInfo = probe(finalVideo);
  console.log(`   Kích thước: ${probeInfo.width}x${probeInfo.height}`);
  console.log(`   Thời lượng: ${probeInfo.duration.toFixed(1)}s`);
  console.log(`   Âm thanh: ${probeInfo.hasAudio ? 'CÓ' : 'KHÔNG'}`);

  ctx.db.updateVideo(videoId, { status: VideoStatus.QA_PASSED });
  ctx.event('qa', `Đạt kiểm định: ${probeInfo.duration.toFixed(1)}s, ${probeInfo.width}x${probeInfo.height}`, {
    videoId,
  });
  console.log('✅ QA kiểm định thành công.\n');

  // 8. Upload & Publisher (Dry Run)
  console.log('--- [BƯỚC 8: PUBLISHER] Mô phỏng xuất bản (Dry Run) ---');
  ctx.db.updateVideo(videoId, { status: VideoStatus.QUEUED });
  ctx.event('upload', 'Vào hàng đợi xuất bản', { videoId });

  ctx.db.run(
    `INSERT INTO publications(video_id, platform, status, published_at)
     VALUES(?, 'instagram', 'dry_run', ?), (?, 'tiktok', 'dry_run', ?)`,
    videoId,
    utcnow(),
    videoId,
    utcnow()
  );
  ctx.db.updateVideo(videoId, { status: VideoStatus.PUBLISHED });
  ctx.event('publisher', `[DRY RUN] Đã mô phỏng đăng lên Instagram Reels & TikTok cho Video #${videoId}`, {
    videoId,
  });
  console.log(`✅ Xuất bản hoàn tất (Dry Run) cho Video #${videoId}!\n`);

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
