import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, '..');

export interface Slot {
  time: string;
  format: string;
}

export interface RampStep {
  until_day: number;
  formats: string[];
}

export interface ScheduleCfg {
  queue_days: number;
  slots: Slot[];
  ramp_up: RampStep[];
  current_mach_ratio: number;
  same_article_gap_days: number;
  remake_after_days: number;
}

export interface FormatCfg {
  label: string;
  duration: [number, number];
  visual: string;
  music_mood: string;
}

export interface CriticCfg {
  max_rounds: number;
  pass_total: number;
  pass_philosophy: number;
  weights: Record<string, number>;
}

export interface RenderCfg {
  fps: number;
  width: number;
  height: number;
  tail_seconds: number;
  music_volume: number;
  loudness_lufs: number;
  duration_slack: [number, number];
}

export interface PublishCfg {
  platforms: string[];
  dry_run: boolean;
  instagram_graph_version: string;
  instagram_ai_disclosure: string;
  tiktok_mode: string;
  tiktok_ai_label: boolean;
  max_attempts: number;
}

export interface AnalyticsCfg {
  score_weights: Record<string, number>;
  remake_top_ratio: number;
}

export interface VoiceCfg {
  model_id: string;
  language_code: string;
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
}

export class MissingSecret extends Error {
  constructor(public readonly secretName: string) {
    super(`Missing secret ${secretName}. Add it to .env (see .env.example).`);
    this.name = 'MissingSecret';
  }
}

export const SECRET_NAMES = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID',
  'PEXELS_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'IG_USER_ID',
  'IG_ACCESS_TOKEN',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_REDIRECT_URI',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
] as const;

export class Settings {
  timezone!: string;
  brand!: Record<string, any>;
  paths!: Record<string, string>;
  models!: Record<string, string>;
  voice!: VoiceCfg;
  schedule!: ScheduleCfg;
  formats!: Record<string, FormatCfg>;
  critic!: CriticCfg;
  render!: RenderCfg;
  publish!: PublishCfg;
  analytics!: AnalyticsCfg;
  env: Record<string, string> = {};

  constructor(raw: any) {
    Object.assign(this, raw);
  }

  path(key: string): string {
    const p = this.paths[key];
    return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
  }

  get dataDir(): string {
    const d = this.path('data_dir');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  get dbPath(): string {
    return path.join(this.dataDir, 'app.db');
  }

  secret(name: string, required = true): string {
    const val = this.env[name] || process.env[name] || '';
    if (required && !val) {
      throw new MissingSecret(name);
    }
    return val;
  }
}

let cachedSettings: Settings | null = null;

export function getSettings(configPath?: string): Settings {
  if (cachedSettings && !configPath) return cachedSettings;

  const envFile = path.resolve(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }

  const p = configPath ? path.resolve(configPath) : path.resolve(ROOT, 'config', 'settings.yaml');
  const fileContent = fs.readFileSync(p, 'utf8');
  const raw = yaml.load(fileContent) as any;

  raw.env = {};
  for (const name of SECRET_NAMES) {
    raw.env[name] = process.env[name] || '';
  }

  cachedSettings = new Settings(raw);
  return cachedSettings;
}
