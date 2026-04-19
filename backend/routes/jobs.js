import { Router } from 'express';
import db from '../db/database.js';
import { log } from '../services/logger.js';
import { fetchJSearch, fetchAdzuna, fetchGreenhouse, fetchLever, enrichJSearchDescriptions } from '../services/jobFetcher.js';
import { scoreKeywords, extractJobSkills } from '../services/keywordScorer.js';
import { scoreWithClaude, isClaudeAvailable } from '../services/claudeScorer.js';
import { deduplicateBatch, isDuplicate } from '../services/deduplicator.js';

const router = Router();

function enrichFetchError(source, err) {
  const msg = err?.message || '';
  const status = msg.match(/HTTP (\d+)/)?.[1];
  if (source === 'JSearch') {
    if (!status) return { source, message: 'Could not connect to JSearch.', hint: 'Check your internet connection.' };
    if (status === '401' || status === '403') return { source, message: 'Invalid JSearch API key.', hint: 'Go to Profile → API Keys and update your RapidAPI key.' };
    if (status === '429') return { source, message: 'JSearch rate limit exceeded.', hint: 'You\'ve hit the free tier limit. Try again later or upgrade your RapidAPI plan.' };
    return { source, message: `JSearch returned HTTP ${status}.`, hint: 'Check your API key in Profile → API Keys.' };
  }
  if (source === 'Adzuna') {
    if (!status) return { source, message: 'Could not connect to Adzuna.', hint: 'Check your internet connection.' };
    if (status === '400') return { source, message: 'Adzuna rejected the request.', hint: 'Try adding a Location in Profile → Search Preferences, or check your Adzuna credentials.' };
    if (status === '401' || status === '403') return { source, message: 'Invalid Adzuna credentials.', hint: 'Go to Profile → API Keys and verify your Adzuna App ID and API Key.' };
    return { source, message: `Adzuna returned HTTP ${status}.`, hint: 'Check your Adzuna credentials in Profile → API Keys.' };
  }
  return { source, message: msg, hint: '' };
}

router.get('/', (req, res) => {
  const { sort = 'fetched_at', order = 'desc', source, minScore } = req.query;

  const allowed = ['fetched_at', 'keyword_score', 'llm_score', 'title', 'company'];
  const sortCol = allowed.includes(sort) ? sort : 'fetched_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  let query = 'SELECT * FROM jobs WHERE 1=1';
  const params = [];

  if (source) { query += ' AND source = ?'; params.push(source); }
  if (minScore) { query += ' AND keyword_score >= ?'; params.push(Number(minScore)); }

  query += ` ORDER BY ${sortCol} ${sortDir}`;

  const jobs = db.prepare(query).all(...params).map(j => ({
    ...j,
    skills_json: j.skills_json ? JSON.parse(j.skills_json) : [],
    insights_json: j.insights_json ? JSON.parse(j.insights_json) : null,
  }));

  res.json(jobs);
});

router.get('/search', async (req, res) => {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  const resume = db.prepare('SELECT structured_json, additional_context FROM resume WHERE id = 1').get();

  if (!profile) return res.status(400).json({ error: 'Profile not configured' });

  const resumeStructured = resume?.structured_json ? JSON.parse(resume.structured_json) : null;
  const additionalContext = resume?.additional_context || '';
  const insightThreshold = profile.insight_threshold ?? 40;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    log('job_search_start', { keywords: profile.keywords, location: profile.location, remote_preference: profile.remote_preference });
  send('status', { message: 'Fetching jobs...' });

    const [jsearchJobs, adzunaJobs] = await Promise.allSettled([
      fetchJSearch(profile.keywords, profile.location, profile.remote_preference, profile.jsearch_api_key),
      fetchAdzuna(profile.keywords, profile.location, profile.adzuna_app_id, profile.adzuna_api_key),
    ]);

    const fetchErrors = [];
    if (jsearchJobs.status === 'rejected') fetchErrors.push(enrichFetchError('JSearch', jsearchJobs.reason));
    if (adzunaJobs.status === 'rejected') fetchErrors.push(enrichFetchError('Adzuna', adzunaJobs.reason));

    let allJobs = [
      ...(jsearchJobs.status === 'fulfilled' ? jsearchJobs.value : []),
      ...(adzunaJobs.status === 'fulfilled' ? adzunaJobs.value : []),
    ];

    allJobs = deduplicateBatch(allJobs).filter(j => !isDuplicate(j));

    // Enrich short JSearch descriptions via the job-details endpoint
    if (profile.jsearch_api_key) {
      send('status', { message: 'Fetching full job descriptions...' });
      allJobs = await enrichJSearchDescriptions(allJobs, profile.jsearch_api_key);
    }

    send('status', { message: `Processing ${allJobs.length} new jobs...` });

    const claudeAvailable = isClaudeAvailable();
    let scored = 0;

    for (const job of allJobs) {
      const skills = extractJobSkills(job.raw_text || '');
      let keywordScore = null;
      let llmScore = null;
      let insights = null;

      if (resumeStructured) {
        const kResult = scoreKeywords(resumeStructured, job.raw_text || '', profile.keywords || '');
        keywordScore = kResult.score;

        if (claudeAvailable && keywordScore >= insightThreshold) {
          const llmResult = await scoreWithClaude(
            resumeStructured,
            job.raw_text || '',
            job.title,
            job.company,
            additionalContext
          );
          if (llmResult) {
            llmScore = llmResult.score;
            insights = llmResult;
          }
        }
      }

      db.prepare(`
        INSERT OR REPLACE INTO jobs
          (id, source, url, title, company, location, salary, employment_type, remote_type,
           raw_text, skills_json, keyword_score, llm_score, insights_json, posted_at, fetched_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(
        job.id, job.source, job.url, job.title, job.company, job.location,
        job.salary, job.employment_type, job.remote_type,
        job.raw_text, JSON.stringify(skills),
        keywordScore, llmScore,
        insights ? JSON.stringify(insights) : null,
        job.posted_at || null
      );

      scored++;
      if (scored % 5 === 0) send('progress', { scored, total: allJobs.length });
    }

    log('job_search_complete', {
      added: allJobs.length,
      sources: ['JSearch', 'Adzuna'],
      jsearch_ok: jsearchJobs.status === 'fulfilled',
      adzuna_ok: adzunaJobs.status === 'fulfilled',
      fetch_errors: fetchErrors.map(e => `${e.source}: ${e.message}`),
    });
    send('done', { added: allJobs.length, fetchErrors });
    res.end();
  } catch (err) {
    log('job_search_error', { error: err.message });
    send('error', { message: err.message });
    res.end();
  }
});

router.post('/:id/analyze', async (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const resume = db.prepare('SELECT structured_json, additional_context FROM resume WHERE id = 1').get();
  if (!resume?.structured_json) return res.status(400).json({ error: 'No resume imported' });

  const resumeStructured = JSON.parse(resume.structured_json);
  const additionalContext = resume?.additional_context || '';

  if (!isClaudeAvailable()) {
    return res.status(503).json({ error: 'Claude Code not available' });
  }

  const insights = await scoreWithClaude(resumeStructured, job.raw_text || '', job.title, job.company, additionalContext);
  if (!insights) return res.status(500).json({ error: 'Claude analysis failed' });

  db.prepare('UPDATE jobs SET llm_score = ?, insights_json = ? WHERE id = ?')
    .run(insights.score, JSON.stringify(insights), job.id);

  res.json(insights);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
