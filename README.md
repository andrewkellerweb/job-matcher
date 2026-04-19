# Job Matcher

A local-first job search tool that pulls listings from multiple sources, scores them against your resume using keyword analysis and AI, and helps you identify and apply to the best-fit roles.

Built as a personal productivity app — no accounts, no SaaS, no data sent anywhere except the APIs you configure.

---

## Features

### Job Import
- Pulls listings from **JSearch** (via RapidAPI) and **Adzuna**, sorted by most recent first
- Fetches full job descriptions for listings with short/missing text via the JSearch details endpoint
- Deduplicates across sources so you never see the same listing twice
- Streams import progress in real time via Server-Sent Events

### Keyword Scoring (Basic Match)
- Scores each job against your resume using ATS-aware keyword matching
- Filters out stopwords (articles, prepositions, filler) — only meaningful skill terms are compared
- Weighted scoring: ATS-critical terms count 2× (e.g. `pmp`, `agile`, `aws`, `stakeholder management`)
- **Dynamically adjusts** based on your Title filter — entering "Program Manager" automatically boosts PM-relevant terms; "Data Engineer" boosts data/cloud terms, etc.
- Covers 100+ role types across engineering, product, program management, data, design, sales, and leadership

### AI Match (Claude)
- Sends selected jobs to Claude for deep analysis against your resume
- Returns a match score, written summary, strengths, and gaps
- Uses your uploaded resume + any Additional Context you've written (projects, interview answers, etc.)
- Only runs on jobs you explicitly select — keeps API usage intentional

### Resume
- Upload PDF, DOCX, or plain text
- Parsed into structured sections (summary, skills, experience, education, certifications)
- **Additional Context** textarea for anything your resume doesn't capture — used by both the keyword scorer and Claude

### Filters & Sort
- **Title** — comma-separated OR filter (e.g. "Program Manager, Project Manager")
- **Location** — substring match on job location
- **Work Type** — checkboxes for Remote / Hybrid / On-site
- **Posting Date** — 1 day / 3 days / 7 days / All
- **Minimum Salary** — filters jobs with parsed salary below threshold (jobs without salary shown unless unchecked)
- **Min Experience** — experience filter passed to the search API
- **Sort By** — Date (newest first) or Match (highest keyword score first)

### 3-Step Workflow
1. **Import Jobs** — run a search with your configured filters
2. **Select Jobs** — review the scored list, check the ones worth analyzing
3. **Process Matches** — run Claude AI analysis on selected jobs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Vite |
| Backend | Node.js, Express |
| Database | SQLite via `node:sqlite` (built-in, no ORM) |
| AI | Claude (via Claude Code SDK) |
| Resume parsing | `pdf-parse`, `mammoth` (DOCX) |
| Streaming | Server-Sent Events (SSE) |
| Job sources | JSearch (RapidAPI), Adzuna |

---

## Requirements

- **Node.js 22+** — required for the built-in `node:sqlite` module
- **Claude Code CLI** — installed and authenticated (`claude` in PATH)
- **RapidAPI account** — subscribed to the [JSearch API](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
- **Adzuna account** — API credentials from [developer.adzuna.com](https://developer.adzuna.com)

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/andrewkellerweb/job-matcher.git
cd job-matcher
npm run install:all
```

### 2. Start the app

```bash
npm start
```

This starts both servers concurrently:
- **Backend** → `http://localhost:3001`
- **Frontend** → `http://localhost:5173`

### 3. Configure API keys

Open the app and go to **Setup**. Enter:

| Field | Where to get it |
|---|---|
| JSearch API Key | RapidAPI dashboard → JSearch → API Key |
| Adzuna App ID | developer.adzuna.com → your app |
| Adzuna API Key | developer.adzuna.com → your app |

### 4. Upload your resume

Go to **Resume** and drop in your PDF, DOCX, or text file. Optionally add context in the **Additional Context** box — anything your resume doesn't fully capture (side projects, specific achievements, tools you've used but didn't list).

### 5. Search for jobs

Go to **Job Search**, open **Filters**, set your **Title** and any other preferences, and click **Import Jobs**.

---

## Project Structure

```
job-matcher/
├── backend/
│   ├── db/
│   │   └── database.js          # SQLite schema + migrations
│   ├── routes/
│   │   ├── jobs.js              # Job search, scoring, AI analysis
│   │   ├── resume.js            # Resume upload, parsing, context
│   │   ├── profile.js           # User preferences + API keys
│   │   ├── claude.js            # Claude availability check
│   │   ├── debug.js             # Debug tools + activity log
│   │   └── log.js               # Log download endpoint
│   ├── services/
│   │   ├── jobFetcher.js        # JSearch, Adzuna, Greenhouse, Lever clients
│   │   ├── keywordScorer.js     # ATS keyword scoring engine
│   │   ├── claudeScorer.js      # Claude AI analysis
│   │   ├── resumeParser.js      # PDF/DOCX/text parsing + structured extraction
│   │   ├── deduplicator.js      # Cross-source job deduplication
│   │   └── logger.js            # Activity logging
│   └── server.js
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Jobs.jsx         # Main job search UI (3-step workflow)
│       │   ├── Resume.jsx       # Resume upload + additional context
│       │   └── Profile.jsx      # Setup / API key configuration
│       ├── components/
│       │   ├── Navigation.jsx
│       │   ├── ScoreBadge.jsx
│       │   ├── DebugMenu.jsx
│       │   └── InsightsPanel.jsx
│       ├── App.jsx
│       └── index.css
├── data/                        # SQLite database (gitignored)
└── package.json                 # Root scripts (start, install:all)
```

---

## Data & Privacy

- All data is stored **locally** in `data/jobsearch.db` (SQLite)
- The `data/` directory is gitignored — your resume, API keys, and job history are never committed
- API keys are stored in the local database only
- Job data is sent to Claude only when you explicitly click **Process Matches**

---

## Planned Features

- Application status tracking (Saved → Applied → Interviewing → Offer/Rejected)
- Claude-generated cover letters per job
- Interview prep question generation
- CSV export of job list with scores
- Re-score existing jobs after resume update
- Notes field per job card
- Greenhouse / Lever direct integration via company slug

---

## License

MIT
