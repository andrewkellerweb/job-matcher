import db from '../db/database.js';

function normalizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().trim();
  }
}

function compositeKey(job) {
  return [
    (job.company || '').toLowerCase().trim(),
    (job.title || '').toLowerCase().trim(),
    (job.location || '').toLowerCase().trim(),
  ].join('|');
}

export function isDuplicate(job) {
  if (job.url) {
    const normalized = normalizeUrl(job.url);
    const existing = db.prepare('SELECT id FROM jobs WHERE url LIKE ?').get(`%${normalized}%`);
    if (existing) return true;
  }

  const key = compositeKey(job);
  const all = db.prepare('SELECT company, title, location FROM jobs').all();
  return all.some(row => compositeKey(row) === key);
}

export function deduplicateBatch(jobs) {
  const seen = new Map();
  const unique = [];

  for (const job of jobs) {
    const urlKey = job.url ? normalizeUrl(job.url) : null;
    const compKey = compositeKey(job);
    const key = urlKey || compKey;

    if (!seen.has(key)) {
      seen.set(key, true);
      if (urlKey) seen.set(compKey, true);
      unique.push(job);
    }
  }

  return unique;
}
