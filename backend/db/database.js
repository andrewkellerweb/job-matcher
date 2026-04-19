import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'jobsearch.db'));

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    url TEXT,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    salary TEXT,
    employment_type TEXT,
    remote_type TEXT,
    raw_text TEXT,
    skills_json TEXT,
    keyword_score REAL,
    llm_score REAL,
    insights_json TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resume (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    filename TEXT,
    raw_text TEXT,
    structured_json TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    keywords TEXT,
    location TEXT,
    remote_preference TEXT DEFAULT 'any',
    salary_min INTEGER,
    salary_max INTEGER,
    insight_threshold INTEGER DEFAULT 40,
    jsearch_api_key TEXT,
    adzuna_app_id TEXT,
    adzuna_api_key TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO profile (id) VALUES (1);
`);

try { db.exec(`ALTER TABLE profile ADD COLUMN claude_verified INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE resume ADD COLUMN file_path TEXT`); } catch {}
try { db.exec(`ALTER TABLE resume ADD COLUMN file_mimetype TEXT`); } catch {}
try { db.exec(`ALTER TABLE profile ADD COLUMN include_no_salary INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE profile ADD COLUMN min_experience INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN posted_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE resume ADD COLUMN additional_context TEXT`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function purgeOldJobs() {
  db.exec(`DELETE FROM jobs WHERE fetched_at < datetime('now', '-30 days')`);
  db.exec(`DELETE FROM activity_log WHERE created_at < datetime('now', '-30 days')`);
}

export default db;
