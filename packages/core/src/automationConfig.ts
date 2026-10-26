import { z } from 'zod';

export const automationPlatforms = ['youtube', 'instagram', 'tiktok'] as const;
export const automationSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(1).max(20),
  horizonHours: z.number().int().min(1).max(168),
  checkIntervalSeconds: z.number().int().min(30).max(3600),
  platforms: z.array(z.enum(automationPlatforms)).min(1).max(3)
    .refine((values) => new Set(values).size === values.length, 'Không chọn trùng nền tảng.'),
}).strict();
export type AutomationConfig = z.infer<typeof automationSchema>;
