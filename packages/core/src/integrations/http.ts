export class ApiError extends Error {
  status?: number;
  data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export function buildUrl(base: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return base;
  const url = new URL(base);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      url.searchParams.set(key, String(val));
    }
  }
  return url.toString();
}

export async function fetchWithRetry(
  url: string,
  options: RequestOptions = {},
  maxAttempts: number = 4
): Promise<Response> {
  const { params, timeoutMs = 60000, ...fetchInit } = options;
  const finalUrl = buildUrl(url, params);

  let attempt = 0;
  let delay = 2000;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(finalUrl, {
        ...fetchInit,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.status === 429 || resp.status >= 500) {
        if (attempt >= maxAttempts) {
          const body = await resp.text().catch(() => '');
          throw new ApiError(
            `${fetchInit.method || 'GET'} ${finalUrl} -> ${resp.status}: ${body.slice(0, 500)}`,
            resp.status
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 30000);
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new ApiError(
          `${fetchInit.method || 'GET'} ${finalUrl} -> ${resp.status}: ${body.slice(0, 500)}`,
          resp.status
        );
      }

      return resp;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err instanceof ApiError && err.status && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt >= maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }

  throw new ApiError(`Request failed after ${maxAttempts} attempts: ${finalUrl}`);
}
