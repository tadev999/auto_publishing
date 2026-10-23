import fs from 'node:fs';
import path from 'node:path';
import {
  markEmphasis,
  paginate,
  spokenText,
  wordsFromAlignment,
} from '../captions.js';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { synthesize } from '../integrations/elevenlabs.js';
import { videoDir } from '../media.js';

export const AGENT = 'voice';

function rescaleSpans(
  spans: [number, number][],
  oldLen: number,
  newLen: number
): [number, number][] {
  const ratio = newLen / Math.max(oldLen, 1);
  return spans.map(([s, e]) => [Math.round(s * ratio), Math.round(e * ratio)]);
}

export async function runOne(ctx: Ctx, video: any): Promise<void> {
  const script = typeof video.script === 'string' ? JSON.parse(video.script) : video.script;
  const beats = script.final_beats || script.beats;
  let [text, spans] = spokenText(beats);

  const speech = await synthesize(ctx.settings, text);
  const aligned = speech.characters.join('');
  if (aligned !== text) {
    text = aligned;
    spans = rescaleSpans(spans, text.length, aligned.length);
  }

  const words = wordsFromAlignment(text, speech.starts, speech.ends, spans);
  markEmphasis(words, beats);

  const speechEnd = speech.ends.length > 0 ? speech.ends[speech.ends.length - 1] : 0.0;
  const duration = speechEnd + ctx.settings.render.tail_seconds;
  const pages = paginate(words, beats, duration);

  const out = videoDir(ctx.settings.dataDir, video.id);
  const publicDir = path.join(out, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(path.join(publicDir, 'voice.mp3'), speech.audio);
  fs.writeFileSync(
    path.join(out, 'captions.json'),
    JSON.stringify(
      {
        speech_end: speechEnd,
        duration,
        pages,
      },
      null,
      1
    ),
    'utf-8'
  );

  const media = video.media
    ? typeof video.media === 'string'
      ? JSON.parse(video.media)
      : video.media
    : {};
  media.voice = 'voice.mp3';
  media.captions = 'captions.json';
  media.speech_seconds = Number(speechEnd.toFixed(2));

  ctx.db.updateVideo(video.id, {
    status: VideoStatus.VOICED,
    media,
  });

  ctx.event(
    AGENT,
    `Giọng đọc ${speechEnd.toFixed(1)}s · ${words.length} từ · ${pages.length} khung phụ đề`,
    { videoId: video.id }
  );
}
