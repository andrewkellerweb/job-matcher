import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

router.post('/reset', (req, res) => {
  db.exec(`DELETE FROM jobs`);
  db.exec(`DELETE FROM resume`);
  db.prepare(`UPDATE profile SET
    claude_verified = 0,
    jsearch_api_key = NULL,
    adzuna_app_id = NULL,
    adzuna_api_key = NULL,
    keywords = NULL,
    location = NULL,
    remote_preference = 'any',
    salary_min = NULL,
    salary_max = NULL,
    insight_threshold = 40,
    updated_at = datetime('now')
  WHERE id = 1`).run();
  res.json({ ok: true });
});

router.post('/clear-resume-profile', (req, res) => {
  db.exec(`DELETE FROM resume`);
  db.prepare(`UPDATE profile SET
    jsearch_api_key = NULL,
    adzuna_app_id = NULL,
    adzuna_api_key = NULL,
    keywords = NULL,
    location = NULL,
    remote_preference = 'any',
    salary_min = NULL,
    salary_max = NULL,
    insight_threshold = 40,
    updated_at = datetime('now')
  WHERE id = 1`).run();
  res.json({ ok: true });
});

router.post('/disconnect-claude', (req, res) => {
  db.prepare('UPDATE profile SET claude_verified = 0 WHERE id = 1').run();
  res.json({ ok: true });
});

router.post('/clear-jobs', (req, res) => {
  db.exec(`DELETE FROM jobs`);
  res.json({ ok: true });
});

export default router;
