import db from '../db/database.js';

export function log(action, details = {}) {
  try {
    db.prepare(`INSERT INTO activity_log (action, details_json) VALUES (?, ?)`)
      .run(action, JSON.stringify(details));
  } catch (err) {
    console.error('Log write error:', err.message);
  }
}
