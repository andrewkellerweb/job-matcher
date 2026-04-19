import { Router } from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import db from '../db/database.js';
import { parseResumeFile, parseResumeText, extractProfileFromResume } from '../services/resumeParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../data/uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.get('/', (req, res) => {
  const resume = db.prepare('SELECT * FROM resume WHERE id = 1').get();
  if (!resume) return res.json(null);
  res.json({
    ...resume,
    structured_json: resume.structured_json ? JSON.parse(resume.structured_json) : null,
  });
});

router.get('/file', (req, res) => {
  const resume = db.prepare('SELECT file_path, file_mimetype, filename FROM resume WHERE id = 1').get();
  if (!resume?.file_path || !existsSync(resume.file_path)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Disposition', `inline; filename="${resume.filename}"`);
  res.setHeader('Content-Type', resume.file_mimetype || 'application/octet-stream');
  res.sendFile(resume.file_path);
});

router.post('/import', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { rawText, structured } = await parseResumeFile(req.file.path, req.file.mimetype);
    const profileSuggestions = extractProfileFromResume(structured);

    db.prepare(`
      INSERT OR REPLACE INTO resume (id, filename, raw_text, structured_json, file_path, file_mimetype, imported_at)
      VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
    `).run(req.file.originalname, rawText, JSON.stringify(structured), req.file.path, req.file.mimetype);

    res.json({ structured, profileSuggestions });
  } catch (err) {
    console.error('Resume parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/reparse', async (req, res) => {
  const resume = db.prepare('SELECT raw_text, file_path, file_mimetype FROM resume WHERE id = 1').get();
  if (!resume) return res.status(404).json({ error: 'No resume' });

  try {
    let structured;
    if (resume.file_path && existsSync(resume.file_path)) {
      ({ structured } = await parseResumeFile(resume.file_path, resume.file_mimetype));
    } else {
      ({ structured } = parseResumeText(resume.raw_text || ''));
    }
    db.prepare('UPDATE resume SET structured_json = ? WHERE id = 1').run(JSON.stringify(structured));
    res.json({ structured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/structured', (req, res) => {
  const structured = req.body;
  if (!structured) return res.status(400).json({ error: 'No data' });

  db.prepare(`UPDATE resume SET structured_json = ? WHERE id = 1`)
    .run(JSON.stringify(structured));

  res.json({ ok: true });
});

router.put('/additional-context', (req, res) => {
  const { additional_context } = req.body;
  db.prepare(`UPDATE resume SET additional_context = ? WHERE id = 1`)
    .run(additional_context || null);
  res.json({ ok: true });
});

export default router;
