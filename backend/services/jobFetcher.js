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
    raw_text: [j.job_title, j.employer_name, j.job_description].filter(Boolean).join('\n\n'),
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
    raw_text: [j.title, j.company?.display_name, j.description].filter(Boolean).join('\n\n'),
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
      raw_text: [job.title, job.company, detailMap.get(job.id)].filter(Boolean).join('\n\n'),
    };
  });
}

// ── Strip HTML tags from description text ─────────────────────────────────────
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
