/**
 * QA Agent - Được tích hợp vào Tổng Biên Tập & Kiểm Định (Critic Agent)
 * Giữ file này để tương thích ngược với CLI, pipeline và test suites.
 */
import { Ctx } from '../context.js';
import { LLM } from '../llm.js';
import * as critic from './critic.js';

export const AGENT = 'qa';
export const VISION_PROMPT = critic.VISION_PROMPT;

export async function runOne(ctx: Ctx, llm: LLM, video: any): Promise<void> {
  return critic.runVisionQA(ctx, llm, video);
}
