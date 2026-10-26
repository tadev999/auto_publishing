import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export interface AccessOptions {
  host: string;
  publicOrigin?: string;
  username?: string;
  password?: string;
}

export function accessControl(options: AccessOptions): RequestHandler {
  const local = ['127.0.0.1', '::1', 'localhost'].includes(options.host);
  const origin = options.publicOrigin ? new URL(options.publicOrigin).origin : undefined;
  const exposed = !local || Boolean(origin && !['127.0.0.1', '[::1]', 'localhost'].includes(new URL(origin).hostname));
  if (exposed && (!origin || !options.username || (options.password?.length || 0) < 16)) {
    throw new Error('Remote access requires PUBLIC_ORIGIN, STUDIO_USER and STUDIO_PASSWORD (at least 16 characters).');
  }
  if (exposed && !origin?.startsWith('https://')) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS for remote access. Put the server behind a TLS reverse proxy.');
  }
  if (Boolean(options.username) !== Boolean(options.password)) {
    throw new Error('Set both STUDIO_USER and STUDIO_PASSWORD.');
  }
  const expected = options.username && options.password
    ? createHash('sha256').update(`Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`).digest()
    : null;
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    const host = req.headers.host;
    const allowedHost = origin ? new URL(origin).host : null;
    if (!host || (allowedHost ? host !== allowedHost : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))) {
      res.status(403).json({ error: 'Untrusted Host header.' });
      return;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && req.headers.origin !== (origin || `http://${host}`))) {
      res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      return;
    }
    if (expected) {
      const actual = createHash('sha256').update(req.headers.authorization || '').digest();
      if (!timingSafeEqual(expected, actual)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Endogenism Studio", charset="UTF-8"');
        res.status(401).send('Authentication required.');
        return;
      }
    }
    next();
  };
}
