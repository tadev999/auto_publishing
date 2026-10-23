import { Settings } from '../config.js';
import { ApiError, fetchWithRetry } from './http.js';

const BASE = 'https://api.elevenlabs.io/v1';

export interface Speech {
  audio: Buffer;
  characters: string[];
  starts: number[];
  ends: number[];
}

export async function synthesize(settings: Settings, text: string): Promise<Speech> {
  const v = settings.voice;
  const voiceId = settings.secret('ELEVENLABS_VOICE_ID');
  const apiKey = settings.secret('ELEVENLABS_API_KEY');

  const resp = await fetchWithRetry(`${BASE}/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    params: { output_format: 'mp3_44100_128' },
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: v.model_id,
      language_code: v.language_code,
      voice_settings: {
        stability: v.stability,
        similarity_boost: v.similarity_boost,
        style: v.style,
        use_speaker_boost: true,
        speed: v.speed,
      },
    }),
    timeoutMs: 180000,
  });

  const data = (await resp.json()) as any;
  const alignment = data.alignment || data.normalized_alignment;
  if (!alignment) {
    throw new ApiError('ElevenLabs response has no alignment data');
  }

  return {
    audio: Buffer.from(data.audio_base64, 'base64'),
    characters: alignment.characters,
    starts: alignment.character_start_times_seconds,
    ends: alignment.character_end_times_seconds,
  };
}
