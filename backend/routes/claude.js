import { Router } from 'express';
import { isClaudeAvailable, verifyClaudeAuth } from '../services/claudeScorer.js';
import db from '../db/database.js';
import { log } from '../services/logger.js';

const router = Router();

router.get('/status', (req, res) => {
  const profile = db.prepare('SELECT claude_verified FROM profile WHERE id = 1').get();
  res.json({ available: !!profile?.claude_verified });
});

router.post('/verify', (req, res) => {
  if (!isClaudeAvailable()) {
    return res.json({ ok: false, error: 'Claude Code is not installed or not found.' });
  }
  const result = verifyClaudeAuth();
  if (result.ok) {
    db.prepare('UPDATE profile SET claude_verified = 1 WHERE id = 1').run();
    log('claude_connected', { method: 'verify' });
  } else {
    log('claude_connect_failed', { error: result.error });
  }
  res.json(result);
});

router.post('/disconnect', (req, res) => {
  db.prepare('UPDATE profile SET claude_verified = 0 WHERE id = 1').run();
  log('claude_disconnected');
  res.json({ ok: true });
});

export default router;
