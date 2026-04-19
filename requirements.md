# Enhanced Job Search — Requirements & Build Summary

## Overview

A local web app that aggregates job descriptions from multiple APIs, compares them against an imported resume using keyword scoring and Claude AI, and displays ranked results with ATS insights. All data stays local. Solves a gap in tools like teal.hq and LinkedIn, which don't let you sort by match score or industry.


## Goals

- Pull job listings from multiple sources in one click
- Score each listing against the user's resume automatically
- Surface ATS gaps and suggested resume edits via Claude
- Keep everything local — no cloud sync, no separate AI subscription


## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | Node.js + Express (port 3001) | Lightweight, works locally |
| Frontend | React + Vite (port 5173) | Fast dev experience |
| Database | SQLite via `node:sqlite` (built-in, Node v22+) | No compile step, single file |
| AI | Claude Code SDK (subprocess via `spawnSync`) | Uses user's existing Claude subscription |
| Resume parsing | pdf-parse + mammoth | PDF and DOCX support |


## Architecture

```
frontend (Vite:5173) ──fetch──► backend (Express:3001) ──► SQLite (data/jobsearch.db)
                                        │
                                        └──► Claude binary (~/.../claude.app)
```

All frontend API calls use absolute `http://localhost:3001/api/...` URLs so they work in both the browser and the preview panel. CORS is configured to allow all `localhost` ports.


## Features Built

### Setup / Onboarding

A gate in `App.jsx` checks 4 conditions before showing the main app:
1. Resume uploaded
2. Profile saved (location or salary set)
3. JSearch API key entered
4. Adzuna credentials entered

The setup page walks through each step sequentially with sub-steps for API key retrieval (rapidapi.com, adzuna.co.uk).

### Resume Page

- **Upload**: drag-and-drop or click-to-browse; accepts PDF, DOCX, plain text (max 10 MB)
- **Re-upload**: replace resume at any time
- **View file**: opens original uploaded file in a new tab
- **Editable sections**: Full Name, Title, Summary, Skills (per section), Work Experience (per role), Education, Certifications
- **Skills display**: the parser detects labeled sub-sections (e.g. "CORE COMPETENCIES:", "TECHNICAL PROFICIENCIES:") and shows a separate textarea for each
- **Experience display**: each role is split into its own textarea using date-line detection
- **Auto-reparse**: if structured data is missing key fields, the frontend triggers a fresh parse from the stored file on load
- **Save**: persists edits back to the database

### Job Search Page

- **Search Jobs** button triggers a fetch from all configured sources
- Progress streamed via SSE (Server-Sent Events)
- Results list shows: title, company, location, salary, source badge, remote badge, match score
- Score badge color: green (high), yellow (mid), gray (low)
- Click a job card to expand and see Claude insights
- Sort by: keyword score, Claude score, date added, title, company
- Filter by source when multiple are present
- Errors surface inline (not just a spinner that never resolves)

### Profile Page

- **Location** and **Remote preference** (Any / Remote only / Hybrid / On-site only)
- **Minimum salary** dropdown ($50k–$200k in $10k steps, or "No minimum")
- **Include jobs with no salary listed** checkbox (checked by default)
- **Insight Threshold** — keyword match % above which Claude analysis runs (default 40%)
- **API Keys**: JSearch (RapidAPI), Adzuna App ID, Adzuna API Key
- **Claude section**: shows connection status; "Connect Claude" button when disconnected
- **Save button** is grayed out until a field is changed

### Claude Integration

- Claude is invoked via the Claude Code binary at `~/Library/Application Support/Claude/claude-code/{version}/claude.app/Contents/MacOS/claude`
- `findClaudeBinary()` scans the versioned directory dynamically — no hardcoded path
- `claude_verified` flag stored in DB; set when the user clicks "Connect Claude" (sends a real test prompt)
- Status endpoint reads the DB flag, not just binary presence
- If Claude is unavailable, the app runs in keyword-only mode; scores still display


## Data Model

### `jobs` table
```
id, source, url, title, company, location, salary, employment_type,
remote_type, raw_text, skills_json, keyword_score, llm_score,
insights_json, fetched_at
```
- Jobs older than 30 days are purged on startup

### `resume` table
```
id, filename, raw_text, structured_json, file_path, file_mimetype, imported_at
```
- `structured_json` shape: `{ name, title, summary, skills[], skills_sections[], experience, experience_roles[], education, certifications }`

### `profile` table
```
id, keywords, location, remote_preference, salary_min, insight_threshold,
jsearch_api_key, adzuna_app_id, adzuna_api_key, include_no_salary,
claude_verified, updated_at
```


## Matching Strategy

1. **Keyword overlap scoring** — runs on all jobs, zero tokens, free. Compares resume skills and title against job raw text.
2. **Claude scoring** — runs only on jobs above the Insight Threshold. Returns score (0–100), missing skills, keyword gaps, suggested resume edits, industry mismatch flag, ATS risk assessment.
3. Resume text is flattened at query time for Claude; prompt caching reduces token usage on repeat calls.


## Job Sources

| Source | Status | Notes |
|---|---|---|
| JSearch (RapidAPI) | Active | Aggregates LinkedIn, Indeed, Google Jobs; free tier |
| Adzuna | Active | Multi-source aggregator with salary data |
| Greenhouse | Planned | No auth required; direct ATS postings |
| Lever | Planned | Public REST API |

Deduplication: by URL first; falls back to composite key (company + title + location + date).


## Deduplication

Greenhouse and Lever postings can appear in JSearch, so the app deduplicates by URL first, then by a composite key of company + title + location + posted date.


## Debug Menu

Bottom-left ⚙ button (always visible) provides:
- **Reset everything** — wipes jobs, resume, profile API fields, Claude verification
- **Disconnect Claude** — clears `claude_verified` only
- **Clear resume & profile data** — deletes resume and resets profile fields (preserves Claude connection)
- **Clear all jobs** — deletes job listings only


## Design

- Light green theme with tonal variation between sections
- Claude-style typography, minimum 15px body text
- Responsive card-based layout
- SSE-based progress bar during job search


## Privacy

All data is stored locally in `data/jobsearch.db`. Nothing is sent to external servers except:
- Job API calls (JSearch, Adzuna) using the user's own API keys
- Claude calls routed through the user's local Claude Code session


## API Keys

Adzuna Application ID: a30defb7
Adzuna API Key: 1596f55f0a01b038a875cd522afd6709
JSearch API Key: 5e782045b8msh618f7babc5338b0p19c4b4jsnfe21943ff0cd
