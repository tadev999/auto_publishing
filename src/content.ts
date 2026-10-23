import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Ctx } from './context.js';

const MACH_RE = /^mach-(\d+)-/;
const BAI_RE = /^bai-(\d+)\.md$/;

export interface Article {
  id: string;
  mach_slug: string;
  machSlug: string;
  mach_index: number;
  machIndex: number;
  mach_title: string;
  machTitle: string;
  number: number;
  title: string;
  path: string;
  body: string;
  content_hash: string;
  contentHash: string;
}

function ordered(folder: string, names: string[]): string[] {
  const metaPath = path.join(folder, '_meta.json');
  if (!fs.existsSync(metaPath)) {
    return names.slice().sort();
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const order: Record<string, number> = meta.order || {};
    return names.slice().sort((a, b) => {
      const oa = order[a] !== undefined ? order[a] : 10000;
      const ob = order[b] !== undefined ? order[b] : 10000;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  } catch {
    return names.slice().sort();
  }
}

export function loadArticles(contentDir: string): Article[] {
  if (!fs.existsSync(contentDir)) return [];

  const entries = fs.readdirSync(contentDir, { withFileTypes: true });
  const machs = entries
    .filter((e) => e.isDirectory() && MACH_RE.test(e.name))
    .map((e) => e.name);

  const articles: Article[] = [];

  for (const machSlug of ordered(contentDir, machs)) {
    const folder = path.join(contentDir, machSlug);
    const machMatch = machSlug.match(MACH_RE);
    const machIndex = machMatch ? parseInt(machMatch[1], 10) : 1;

    let machTitle = machSlug;
    const metaPath = path.join(folder, '_meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        machTitle = JSON.parse(fs.readFileSync(metaPath, 'utf8')).title || machSlug;
      } catch {}
    }

    const files = fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isFile() && BAI_RE.test(e.name))
      .map((e) => e.name);

    for (const name of ordered(folder, files)) {
      const filePath = path.join(folder, name);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(raw);
      const numMatch = name.match(BAI_RE);
      const number = numMatch ? parseInt(numMatch[1], 10) : 1;
      const body = parsed.content.trim();
      const contentHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');

      articles.push({
        id: name.replace(/\.md$/, ''),
        mach_slug: machSlug,
        machSlug,
        mach_index: machIndex,
        machIndex,
        mach_title: machTitle,
        machTitle,
        number,
        title: (parsed.data.title as string) || name,
        path: filePath,
        body,
        content_hash: contentHash,
        contentHash,
      });
    }
  }

  return articles;
}

export function articleBody(ctx: Ctx, articleId: string): string {
  const row = ctx.db.one<{ path: string }>('SELECT path FROM articles WHERE id = ?', articleId);
  if (!row) {
    throw new Error(`Article ${articleId} has not been ingested`);
  }
  const raw = fs.readFileSync(row.path, 'utf8');
  return matter(raw).content.trim();
}

export function normalize(text: string): string {
  text = text.replace(/[*_`>#]/g, '');
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
