import { randomUUID } from 'crypto';

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${new URL(url).hostname})`);
  return res.json();
}

function buildJobId(source, externalId) {
  return `${source}:${externalId || randomUUID()}`;
}

export async function fetchJSearch(query, location, remotePreference, apiKey) {
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query: `${query} ${location || ''}`.trim(),
    num_pages: '10',
    date_posted: 'month',
    sort_by: 'date',
  });

  if (remotePreference === 'remote') params.set('remote_jobs_only', 'true');

  const data = await fetchJSON(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
  });

  return (data.data || []).map(j => ({
    id: buildJobId('jsearch', j.job_id),
    source: 'JSearch',
    url: j.job_apply_link || j.job_google_link,
    title: j.job_title,
    company: j.employer_name,
    location: j.job_city ? `${j.job_city}, ${j.job_state || j.job_country}` : j.job_country,
    salary: formatSalary(j.job_min_salary, j.job_max_salary, j.job_salary_currency),
    employment_type: j.job_employment_type,
    remote_type: j.job_is_remote ? 'remote' : 'on-site',
    posted_at: j.job_posted_at_datetime_utc || null,
    raw_text: [j.job_title, j.employer_name, stripHtml(j.job_description)].filter(Boolean).join('\n\n'),
  }));
}

export async function fetchAdzuna(query, location, appId, apiKey) {
  if (!appId || !apiKey) return [];

  const country = 'us';
  const params = new URLSearchParams({
    app_id: appId,
    app_key: apiKey,
    results_per_page: '50',
    what: query,
  });
  if (location) params.set('where', location);

  const data = await fetchJSON(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`
  );

  return (data.results || []).map(j => ({
    id: buildJobId('adzuna', j.id),
    source: 'Adzuna',
    url: j.redirect_url,
    title: j.title,
    company: j.company?.display_name,
    location: j.location?.display_name,
    salary: formatSalary(j.salary_min, j.salary_max, 'USD'),
    employment_type: j.contract_time,
    remote_type: null,
    posted_at: j.created ? new Date(j.created).toISOString() : null,
    raw_text: [j.title, j.company?.display_name, stripHtml(j.description)].filter(Boolean).join('\n\n'),
  }));
}

// Enrich JSearch jobs that have short/missing descriptions by calling the
// job-details endpoint. Capped at maxFetches to protect free-tier quota.
export async function enrichJSearchDescriptions(jobs, apiKey, maxFetches = 15) {
  if (!apiKey) return jobs;

  const needsDetail = jobs.filter(j => {
    const descLen = (j.raw_text || '').length - (j.title || '').length - (j.company || '').length;
    return j.source === 'JSearch' && descLen < 250;
  }).slice(0, maxFetches);

  if (needsDetail.length === 0) return jobs;

  const detailMap = new Map();
  await Promise.allSettled(
    needsDetail.map(async job => {
      const rawId = job.id.slice('jsearch:'.length);
      try {
        const data = await fetchJSON(
          `https://jsearch.p.rapidapi.com/job-details?job_id=${encodeURIComponent(rawId)}&extended_publisher_details=false`,
          { headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } }
        );
        const d = data?.data?.[0];
        if (d?.job_description) detailMap.set(job.id, d.job_description);
      } catch {}
    })
  );

  return jobs.map(job => {
    if (!detailMap.has(job.id)) return job;
    return {
      ...job,
      raw_text: [job.title, job.company, stripHtml(detailMap.get(job.id))].filter(Boolean).join('\n\n'),
    };
  });
}

// ── HTML entity decoder ───────────────────────────────────────────────────────
const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—', '&lsquo;': '\u2018',
  '&rsquo;': '\u2019', '&ldquo;': '\u201c', '&rdquo;': '\u201d',
  '&bull;': '•', '&middot;': '·', '&hellip;': '…', '&trade;': '™',
  '&reg;': '®', '&copy;': '©', '&frac12;': '½', '&frac14;': '¼',
  '&frac34;': '¾', '&times;': '×', '&divide;': '÷',
};

function decodeEntities(str) {
  // Named entities
  str = str.replace(/&[a-zA-Z]+;/g, m => HTML_ENTITIES[m] || m);
  // Decimal numeric entities &#8217;
  str = str.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  // Hex numeric entities &#x2019;
  str = str.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  return str;
}

// Fix common UTF-8-misread-as-latin-1 artifacts (Mojibake)
function fixMojibake(str) {
  return str
    .replace(/â€™/g, '\u2019')  // right single quote '
    .replace(/â€˜/g, '\u2018')  // left single quote '
    .replace(/â€œ/g, '\u201c')  // left double quote "
    .replace(/â€/g,  '\u201d')  // right double quote "
    .replace(/â€"/g, '\u2013')  // en dash –
    .replace(/â€"/g, '\u2014')  // em dash —
    .replace(/â€¦/g, '\u2026')  // ellipsis …
    .replace(/Ã©/g,  '\u00e9')  // é
    .replace(/Ã¨/g,  '\u00e8')  // è
    .replace(/Ã /g,  '\u00e0')  // à
    .replace(/Ã¢/g,  '\u00e2')  // â
    .replace(/Ã®/g,  '\u00ee')  // î
    .replace(/Ã´/g,  '\u00f4')  // ô
    .replace(/Ã»/g,  '\u00fb')  // û
    .replace(/Ã§/g,  '\u00e7')  // ç
    .replace(/Ã¼/g,  '\u00fc')  // ü
    .replace(/Ã¶/g,  '\u00f6')  // ö
    .replace(/Ã¤/g,  '\u00e4'); // ä
}

// ── Strip HTML tags, preserving paragraph/list structure as newlines ──────────
function stripHtml(html) {
  if (!html) return '';

  let text = html;

  // Convert block-level elements to newlines BEFORE stripping tags
  // Double newline for paragraph-like breaks
  text = text.replace(/<\/?(p|div|section|article|header|footer|main|aside|blockquote)\b[^>]*>/gi, '\n\n');
  // Single newline for line breaks and headings
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(h[1-6])\b[^>]*>/gi, '\n\n');
  // List items get a bullet + newline
  text = text.replace(/<li\b[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');
  // List containers get a newline
  text = text.replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n');
  // Table cells/rows
  text = text.replace(/<\/?(tr|td|th)\b[^>]*>/gi, '\n');

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeEntities(text);

  // Fix encoding artifacts
  text = fixMojibake(text);

  // Normalize whitespace while preserving intentional line breaks:
  // 1. Collapse spaces/tabs within a line
  text = text.replace(/[ \t]+/g, ' ');
  // 2. Trim each line
  text = text.split('\n').map(l => l.trim()).join('\n');
  // 3. Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // 4. Trim leading/trailing whitespace
  text = text.trim();

  return text;
}

// ── Derive a useful RemoteOK tag from the user's query ───────────────────────
function extractTag(query) {
  const words = query.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
  const priority = ['engineer', 'developer', 'manager', 'designer', 'analyst',
                    'director', 'product', 'marketing', 'sales', 'devops', 'data'];
  for (const role of priority) {
    if (words.includes(role)) return role;
  }
  return words[0] || 'manager';
}

export async function fetchRemoteOK(query) {
  const tag = extractTag(query);
  const data = await fetchJSON(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
    headers: { 'User-Agent': 'job-matcher-app/1.0' },
  });

  const jobs = Array.isArray(data) ? data.filter(j => j.id && j.position) : [];

  // Filter to titles that loosely match any term from the query
  const queryWords = query.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  const matches = jobs.filter(j => {
    const title = (j.position || '').toLowerCase();
    return queryWords.some(w => title.includes(w));
  });

  return matches.map(j => ({
    id: buildJobId('remoteok', String(j.id)),
    source: 'RemoteOK',
    url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`,
    title: j.position,
    company: j.company,
    location: j.location || 'Remote',
    salary: formatSalary(j.salary_min, j.salary_max, 'USD'),
    employment_type: null,
    remote_type: 'remote',
    posted_at: j.date ? new Date(j.date).toISOString() : null,
    raw_text: [j.position, j.company, stripHtml(j.description)].filter(Boolean).join('\n\n'),
  }));
}

export async function fetchRemotive(query) {
  // Remotive's search param doesn't work on the free tier; fetch all and filter
  const data = await fetchJSON('https://remotive.com/api/remote-jobs');
  const queryWords = query.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  const filtered = (data.jobs || []).filter(j => {
    const title = (j.title || '').toLowerCase();
    return queryWords.some(w => title.includes(w));
  });

  return filtered.map(j => ({
    id: buildJobId('remotive', String(j.id)),
    source: 'Remotive',
    url: j.url,
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    salary: j.salary || null,
    employment_type: j.job_type || null,
    remote_type: 'remote',
    posted_at: j.publication_date ? new Date(j.publication_date).toISOString() : null,
    raw_text: [j.title, j.company_name, stripHtml(j.description)].filter(Boolean).join('\n\n'),
  }));
}

export async function fetchGreenhouse(company) {
  const data = await fetchJSON(
    `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`
  );

  return (data.jobs || []).map(j => ({
    id: buildJobId('greenhouse', j.id),
    source: 'Greenhouse',
    url: j.absolute_url,
    title: j.title,
    company,
    location: j.location?.name,
    salary: null,
    employment_type: null,
    remote_type: j.location?.name?.toLowerCase().includes('remote') ? 'remote' : null,
    posted_at: j.updated_at ? new Date(j.updated_at).toISOString() : null,
    raw_text: [j.title, j.location?.name, stripHtml(j.content)].filter(Boolean).join('\n\n'),
  }));
}

export async function fetchLever(company) {
  const data = await fetchJSON(`https://api.lever.co/v0/postings/${company}?mode=json`);

  return (data || []).map(j => ({
    id: buildJobId('lever', j.id),
    source: 'Lever',
    url: j.hostedUrl,
    title: j.text,
    company,
    location: j.categories?.location,
    salary: null,
    employment_type: j.categories?.commitment,
    remote_type: j.categories?.location?.toLowerCase().includes('remote') ? 'remote' : null,
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    raw_text: [j.text, j.categories?.location, j.descriptionPlain, j.additionalPlain]
      .filter(Boolean)
      .join('\n\n'),
  }));
}

function formatSalary(min, max, currency) {
  if (!min && !max) return null;
  const fmt = n => n ? `${currency || ''}${Math.round(n).toLocaleString()}` : null;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min) || fmt(max);
}
