import { Router } from 'express';
import db from '../db/database.js';
import { log } from '../services/logger.js';

const router = Router();

router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  res.json(profile || {});
});

router.put('/', (req, res) => {
  const {
    keywords, location, remote_preference, salary_min,
    insight_threshold, jsearch_api_key, adzuna_app_id, adzuna_api_key,
    include_no_salary, min_experience, greenhouse_companies, lever_companies,
  } = req.body;

  db.prepare(`
    UPDATE profile SET
      keywords = ?,
      location = ?,
      remote_preference = ?,
      salary_min = ?,
      insight_threshold = ?,
      jsearch_api_key = ?,
      adzuna_app_id = ?,
      adzuna_api_key = ?,
      include_no_salary = ?,
      min_experience = ?,
      greenhouse_companies = ?,
      lever_companies = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    keywords, location, remote_preference, salary_min || null,
    insight_threshold ?? 40, jsearch_api_key, adzuna_app_id, adzuna_api_key,
    include_no_salary ? 1 : 0,
    min_experience ?? 0,
    greenhouse_companies || null,
    lever_companies || null
  );

  log('profile_saved', { has_jsearch_key: !!jsearch_api_key, has_adzuna: !!(adzuna_app_id && adzuna_api_key), location: !!location });
  res.json({ ok: true });
});

export default router;
