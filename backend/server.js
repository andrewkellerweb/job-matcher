import express from 'express';
import cors from 'cors';
import { purgeOldJobs } from './db/database.js';
import jobsRouter from './routes/jobs.js';
import resumeRouter from './routes/resume.js';
import profileRouter from './routes/profile.js';
import claudeRouter from './routes/claude.js';
import debugRouter from './routes/debug.js';
import logRouter from './routes/log.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(express.json());

app.use('/api/jobs', jobsRouter);
app.use('/api/resume', resumeRouter);
app.use('/api/profile', profileRouter);
app.use('/api/claude', claudeRouter);

app.use('/api/debug', debugRouter);
app.use('/api/log', logRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));

purgeOldJobs();

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
