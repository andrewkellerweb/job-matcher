import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT action, details_json, created_at FROM activity_log ORDER BY created_at DESC`
  ).all();

  const lines = rows.map(r => {
    const details = r.details_json ? JSON.parse(r.details_json) : {};
    const parts = Object.entries(details).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
    return `[${r.created_at}] ${r.action}${parts ? ' ' + parts : ''}`;
  });

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="job-matcher-log.txt"');
  res.send(lines.join('\n'));
});

export default router;
