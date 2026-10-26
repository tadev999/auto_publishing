import type { Ctx } from './context.js';
import { loadArticles } from './content.js';
import { LLM } from './llm.js';
import { produce, withLock } from './pipeline.js';
import * as ingest from './agents/ingest.js';
import * as planner from './agents/planner.js';
import * as publisher from './agents/publisher.js';
import { sameIdea, type IdeaIdentity } from './ideaIdentity.js';
import { Settings } from './config.js';
import { notify } from './integrations/telegram.js';

import { automationSchema, type AutomationConfig } from './automationConfig.js';
export * from './automationConfig.js';
export interface AutomationState {
  message: string;
  lastCycleAt: string | null;
  lastError: string | null;
  blocked: boolean;
}
export const AUTOMATION_KEY = 'automation';
export const AUTOMATION_STATE_KEY = 'automation_state';

export function automationConfig(ctx: Pick<Ctx, 'db'> & Partial<Pick<Ctx, 'settings'>>): AutomationConfig {
  return automationSchema.parse({
    enabled: false, dailyLimit: 3, horizonHours: 24, checkIntervalSeconds: 60,
    platforms: ctx.settings?.publish.platforms ?? ['youtube'],
    ...ctx.db.getKv(AUTOMATION_KEY, {}),
  });
}

export function automationState(ctx: Pick<Ctx, 'db'>): AutomationState {
  return ctx.db.getKv(AUTOMATION_STATE_KEY, {
    message: 'Chưa bật tự động vận hành.', lastCycleAt: null, lastError: null, blocked: false,
  });
}

export function blockAutomation(ctx: Pick<Ctx, 'db'>, error: string) {
  ctx.db.setKv(AUTOMATION_STATE_KEY, {
    ...automationState(ctx), blocked: true, lastError: error, message: 'Cần kiểm tra lỗi trước khi tiếp tục.',
  });
}

export function localDay(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export async function runAutomation(ctx: Ctx): Promise<void> {
  const config = automationConfig(ctx);
  if (!config.enabled || automationState(ctx).blocked || ctx.db.getKv('paused', false)) return;
  ctx = { ...ctx, settings: new Settings({
    ...ctx.settings, publish: { ...ctx.settings.publish, platforms: config.platforms },
  }) };
  const { acquired } = await withLock(ctx, 'automation', async () => {
    const now = new Date();
    const state = (message: string) => ctx.db.setKv(AUTOMATION_STATE_KEY, {
      message, lastCycleAt: now.toISOString(), lastError: null, blocked: false,
    } satisfies AutomationState);
    try {
      state(`Đang kiểm tra hàng đợi và lịch trong ${config.horizonHours} giờ tới.`);
      const ambiguous = ctx.db.one<{ id: number }>(`SELECT id FROM publications WHERE status IN ('publishing', 'review_required') LIMIT 1`);
      if (ambiguous) throw new Error(`Publication #${ambiguous.id} chưa xác định kết quả. Kiểm tra trên nền tảng trước khi tiếp tục; không tự đăng lại.`);
      ctx.event('publisher', 'Tự động kiểm tra phát hành đến lịch', { phase: 'started' });
      await publisher.run(ctx, now, { preventDuplicates: true });
      ctx.event('publisher', 'Hoàn tất kiểm tra phát hành', { phase: 'finished' });
      const publishError = ctx.db.one<{ error: string }>(`SELECT p.error FROM publications p JOIN videos v ON v.id = p.video_id
        WHERE p.status IN ('pending', 'failed', 'review_required') AND p.error IS NOT NULL
          AND p.platform IN (${config.platforms.map(() => '?').join(',')})
          AND julianday(v.slot_at) <= julianday(?) LIMIT 1`, ...config.platforms, now.toISOString());
      if (publishError) throw new Error(publishError.error);
      const day = localDay(now, ctx.settings.timezone);
      const budgetKey = `automation_budget:${day}`;
      const budget = ctx.db.getKv(budgetKey, { production: 0, ingest: 0 });
      ctx.event('planner', `Tự động bổ sung lịch ${config.horizonHours} giờ; không làm lại ý tưởng đã dùng`, { phase: 'started' });
      let created = await planner.runWithProfile(ctx, now, { horizonHours: config.horizonHours, dailyLimit: config.dailyLimit });
      ctx.event('planner', `Bổ sung ${created} lịch mới`, { phase: 'finished' });
      let target = ctx.db.one<{ id: number; idea_id: number; status: string; error: string | null }>(`SELECT id, idea_id, status, error FROM videos
        WHERE status IN ('planned', 'scripted', 'approved', 'voiced', 'rendered', 'qa_passed')
          AND julianday(slot_at) <= julianday(?) ORDER BY julianday(slot_at), id LIMIT 1`,
        new Date(now.getTime() + config.horizonHours * 3600000).toISOString());
      if (!target && budget.production < config.dailyLimit && budget.ingest < config.dailyLimit) {
        const articles = loadArticles(ctx.settings.path('content_dir'));
        const unseen = articles.find((article) => {
          const row = ctx.db.one<{ content_hash: string }>('SELECT content_hash FROM articles WHERE id = ?', article.id);
          return !row || row.content_hash !== article.contentHash;
        });
        if (unseen) {
          budget.ingest++;
          ctx.db.setKv(budgetKey, budget);
          ctx.event('ingest', `Tự động nạp ${unseen.id}`, { phase: 'started' });
          await ingest.run(ctx, new LLM(ctx.settings), { only: unseen.id, limit: 1, failFast: true });
          ctx.event('ingest', `Đã nạp ${unseen.id}`, { phase: 'finished' });
          created += await planner.runWithProfile(ctx, now, { horizonHours: config.horizonHours, dailyLimit: config.dailyLimit });
          target = ctx.db.one(`SELECT id, idea_id, status, error FROM videos
            WHERE status IN ('planned', 'scripted', 'approved', 'voiced', 'rendered', 'qa_passed')
              AND julianday(slot_at) <= julianday(?) ORDER BY julianday(slot_at), id LIMIT 1`,
            new Date(now.getTime() + config.horizonHours * 3600000).toISOString());
        }
      }
      if (!target) {
        state(budget.production >= config.dailyLimit || budget.ingest >= config.dailyLimit
          ? 'Đã đạt giới hạn hôm nay; vẫn kiểm tra phát hành, bổ sung tiếp vào ngày sau.'
          : `Chưa có ý tưởng mới phù hợp với lịch ${config.horizonHours} giờ. Chờ slot tiếp theo hoặc bài nguồn mới; không tái sử dụng ý tưởng cũ.`);
        return;
      }
      if (target.error) throw new Error(`Video #${target.id}: ${target.error}. Cần kiểm tra trước khi tự chạy lại.`);
      const duplicate = ctx.db.one<{ id: number }>('SELECT id FROM videos WHERE idea_id = ? AND id != ? LIMIT 1', target.idea_id, target.id);
      if (duplicate) throw new Error(`Ý tưởng của video #${target.id} đã được dùng ở #${duplicate.id}. Không tự sản xuất bản trùng.`);
      const identity = ctx.db.one<IdeaIdentity>('SELECT article_id, angle, insight FROM ideas WHERE id = ?', target.idea_id)!;
      const previous = ctx.db.all<IdeaIdentity>(`SELECT i.article_id, i.angle, i.insight FROM ideas i
        JOIN videos v ON v.idea_id = i.id WHERE v.id != ?`, target.id);
      if (previous.some((idea) => sameIdea(identity, idea))) {
        throw new Error(`Video #${target.id} có ý tưởng trùng/gần trùng với lịch sử. Cần kiểm tra; không tự sản xuất.`);
      }
      if (budget.production >= config.dailyLimit) {
        state('Đạt giới hạn lượt sản xuất hôm nay; vẫn kiểm tra phát hành và sẽ tiếp tục vào ngày sau.');
        return;
      }
      budget.production++;
      ctx.db.setKv(budgetKey, budget);
      state(`Đang sản xuất video #${target.id} (${budget.production}/${config.dailyLimit} lượt hôm nay).`);
      await produce(ctx, new LLM(ctx.settings), { videoIds: [target.id], limit: 1, preventDuplicates: true });
      const fresh = ctx.db.video(target.id);
      if (fresh.error || fresh.status === 'failed') throw new Error(`Video #${target.id}: ${fresh.error || 'Sản xuất thất bại'}`);
      state(`Video #${target.id} đã sẵn sàng; tiếp tục kiểm tra ở chu kỳ sau.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      blockAutomation(ctx, message);
      ctx.event('automation', message, { level: 'error', phase: 'failed' });
      await notify(ctx.settings, `🚨 [Endogenism Studio - Cảnh Báo]\nTự động vận hành tạm dừng:\n${message}\n\nHệ thống đã chuyển sang chế độ Khóa An Toàn (Blocked).`);
      throw error;
    }
  });
  if (!acquired) throw new Error('Một chu kỳ tự động khác đang chạy; không khởi chạy trùng.');
}
