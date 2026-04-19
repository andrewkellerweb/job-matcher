import { useState, useEffect, useRef } from 'react';
import ScoreBadge from '../components/ScoreBadge.jsx';

const BASE = 'http://localhost:3001';

const WORK_TYPE_OPTIONS = [
  { value: 'remote',  label: 'Remote' },
  { value: 'hybrid',  label: 'Hybrid' },
  { value: 'on-site', label: 'On-site' },
];

const POSTING_DATE_OPTIONS = [
  { value: '1',   label: '1 day' },
  { value: '3',   label: '3 days' },
  { value: '7',   label: '7 days' },
  { value: 'all', label: 'All' },
];

const SALARY_OPTIONS = [
  { value: '', label: 'No minimum' },
  ...Array.from({ length: 16 }, (_, i) => {
    const k = 50 + i * 10;
    return { value: String(k * 1000), label: `$${k}k+` };
  }),
];


function parseSalaryMin(salaryStr) {
  if (!salaryStr) return null;
  // Match comma-grouped numbers like "80,000" or plain "80000"
  const nums = [...salaryStr.matchAll(/[\d,]+/g)]
    .map(m => Number(m[0].replace(/,/g, '')))
    .filter(n => n > 1000);
  return nums.length > 0 ? nums[0] : null;
}

function filterJobs(jobList, opts) {
  return jobList.filter(job => {
    if (opts.role_title) {
      // Comma-separated terms are OR conditions; words within a term are AND
      const terms = opts.role_title.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const title = (job.title || '').toLowerCase();
      const anyTermMatches = terms.some(term =>
        term.split(/\s+/).filter(Boolean).every(w => title.includes(w))
      );
      if (!anyTermMatches) return false;
    }
    if (opts.location) {
      const loc = (job.location || '').toLowerCase();
      if (!loc.includes(opts.location.toLowerCase())) return false;
    }
    // remote_preference is now an array; empty = any
    if (opts.remote_preference.length > 0) {
      if (!opts.remote_preference.includes(job.remote_type)) return false;
    }
    if (!opts.include_no_salary && !job.salary) return false;
    if (opts.salary_min && opts.salary_min !== '') {
      const minRequired = Number(opts.salary_min);
      if (job.salary) {
        const salMin = parseSalaryMin(job.salary);
        if (salMin !== null && salMin < minRequired) return false;
      }
    }
    if (opts.posting_date && opts.posting_date !== 'all') {
      const days = Number(opts.posting_date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      if (!job.posted_at || new Date(job.posted_at) < cutoff) return false;
    }
    return true;
  });
}

function workTypeLabel(t) {
  if (t === 'remote') return 'Remote';
  if (t === 'hybrid') return 'Hybrid';
  if (t === 'on-site') return 'On-site';
  return null;
}

function isHeaderLine(line) {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  if (/^[•\-\*\d]/.test(t)) return false;
  if (/[,;]/.test(t)) return false;
  if (/[a-z]{2}[.!?]$/.test(t)) return false;
  return /^[A-Z]/.test(t);
}

function JDText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else if (isHeaderLine(trimmed)) {
      elements.push(
        <div key={i} style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginTop: 16, marginBottom: 4 }}>
          {trimmed}
        </div>
      );
    } else if (/^[•\-\*]/.test(trimmed)) {
      elements.push(
        <div key={i} style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 14, position: 'relative', lineHeight: 1.6 }}>
          <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>•</span>
          {trimmed.replace(/^[•\-\*]\s*/, '')}
        </div>
      );
    } else {
      elements.push(
        <div key={i} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {trimmed}
        </div>
      );
    }
    i++;
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{elements}</div>;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [tab, setTab] = useState('basic');
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [searchError, setSearchError] = useState('');
  const [lastSearchInfo, setLastSearchInfo] = useState(null);
  const [showSearchOptions, setShowSearchOptions] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    role_title: '',
    location: '',
    remote_preference: [],   // array of 'remote'|'hybrid'|'on-site'; empty = any
    salary_min: '',
    include_no_salary: true,
    posting_date: 'all',
  });
  const [sortBy, setSortBy] = useState('date');
  const [sourceStatuses, setSourceStatuses] = useState({}); // { label: { status, count, message } }
  const [showSourceBar, setShowSourceBar] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [aiDone, setAiDone] = useState(false);
  const [jdJob, setJdJob] = useState(null);
  const sourceBarTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const searchOptsPanelRef = useRef(null);
  const searchOptsButtonRef = useRef(null);

  useEffect(() => {
    loadJobs();
    fetch(`${BASE}/api/profile`).then(r => r.json()).then(p => {
      // Convert stored string remote_preference to array
      const stored = p.remote_preference;
      let remoteArr = [];
      if (stored && stored !== 'any') {
        const mapped = stored === 'onsite' ? 'on-site' : stored;
        remoteArr = [mapped];
      }
      setSearchOptions({
        role_title: p.keywords || '',
        location: p.location || '',
        remote_preference: remoteArr,
        salary_min: p.salary_min ? String(p.salary_min) : '',
        include_no_salary: p.include_no_salary !== 0,
        posting_date: 'all',
      });
    });
  }, []);

  useEffect(() => {
    if (!showSearchOptions) return;
    function onClickOutside(e) {
      if (
        searchOptsPanelRef.current && !searchOptsPanelRef.current.contains(e.target) &&
        searchOptsButtonRef.current && !searchOptsButtonRef.current.contains(e.target)
      ) {
        setShowSearchOptions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSearchOptions]);

  async function loadJobs() {
    const data = await fetch(`${BASE}/api/jobs?sort=keyword_score&order=desc`).then(r => r.json());
    setJobs(data);
  }

  function setOpt(field, value) {
    setSearchOptions(o => ({ ...o, [field]: value }));
  }

  async function saveSearchOptions(opts) {
    // Convert array back to the string the backend/JSearch expect
    const remoteStr = opts.remote_preference.length === 1
      ? (opts.remote_preference[0] === 'on-site' ? 'onsite' : opts.remote_preference[0])
      : 'any';
    const current = await fetch(`${BASE}/api/profile`).then(r => r.json());
    await fetch(`${BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current,
        keywords: opts.role_title,
        location: opts.location,
        remote_preference: remoteStr,
        salary_min: opts.salary_min,
        include_no_salary: opts.include_no_salary,
      }),
    });
  }

  function startSearch() {
    if (searching) return;
    setSearching(true);
    setStatusMsg('Starting search…');
    setSearchError('');
    setSelected(new Set());
    setAiDone(false);
    setShowSearchOptions(false);
    setSourceStatuses({});
    setShowSourceBar(true);
    if (sourceBarTimerRef.current) clearTimeout(sourceBarTimerRef.current);
    saveSearchOptions(searchOptions);

    const es = new EventSource(`${BASE}/api/jobs/search`);
    eventSourceRef.current = es;

    es.addEventListener('source_status', e => {
      const { source, status, count, message } = JSON.parse(e.data);
      setSourceStatuses(prev => ({ ...prev, [source]: { status, count, message } }));
    });
    es.addEventListener('status', e => setStatusMsg(JSON.parse(e.data).message));
    es.addEventListener('progress', e => {
      const { scored, total } = JSON.parse(e.data);
      setStatusMsg(`Processing ${scored} / ${total}…`);
    });
    let completed = false;
    es.addEventListener('done', e => {
      completed = true;
      es.close();
      setSearching(false);
      setStatusMsg('');
      const { added, fetchErrors } = JSON.parse(e.data);
      setLastSearchInfo({ added, fetchErrors: fetchErrors || [] });
      setStep(2);
      loadJobs();
      // Collapse source bar after a delay unless there were errors
      sourceBarTimerRef.current = setTimeout(() => setShowSourceBar(false), 5000);
    });
    es.addEventListener('error', e => {
      if (!e.data) return;
      completed = true;
      const msg = JSON.parse(e.data).message;
      setSearchError(msg);
      setSourceStatuses(prev => ({ ...prev, '⚠ Fatal error': { status: 'error', message: msg } }));
      setStatusMsg('');
      es.close();
      setSearching(false);
    });
    es.onerror = () => {
      if (completed || es.readyState === EventSource.CLOSED) return;
      completed = true;
      const msg = 'Search could not connect to the backend.';
      setSearchError(msg);
      setSourceStatuses(prev => ({ ...prev, '⚠ Connection': { status: 'error', message: msg } }));
      setStatusMsg('');
      es.close();
      setSearching(false);
    };
  }

  useEffect(() => {
    function onReimport() {
      setJobs([]);
      setSelected(new Set());
      setLastSearchInfo(null);
      startSearch();
    }
    window.addEventListener('debug-reimport', onReimport);
    return () => window.removeEventListener('debug-reimport', onReimport);
  }, []);

  async function processMatches() {
    const ids = [...selected];
    setProcessingIds(new Set(ids));
    for (const id of ids) {
      try {
        const insights = await fetch(`${BASE}/api/jobs/${encodeURIComponent(id)}/analyze`, {
          method: 'POST',
        }).then(r => r.json());
        setJobs(prev => prev.map(j =>
          j.id === id ? { ...j, insights_json: insights, llm_score: insights.score } : j
        ));
      } catch {}
      setProcessingIds(p => { const next = new Set(p); next.delete(id); return next; });
    }
    setAiDone(true);
    setTab('ai');
  }

  const baseJobs = tab === 'ai' ? jobs.filter(j => j.insights_json != null) : jobs;
  const filteredJobs = filterJobs(baseJobs, searchOptions);
  const displayedJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === 'date') {
      const da = a.posted_at ? new Date(a.posted_at) : new Date(0);
      const db2 = b.posted_at ? new Date(b.posted_at) : new Date(0);
      return db2 - da;
    }
    if (sortBy === 'match') {
      const sa = tab === 'ai' ? (a.llm_score ?? a.keyword_score ?? 0) : (a.keyword_score ?? 0);
      const sb = tab === 'ai' ? (b.llm_score ?? b.keyword_score ?? 0) : (b.keyword_score ?? 0);
      return sb - sa;
    }
    return 0;
  });

  const allSelected = displayedJobs.length > 0 && displayedJobs.every(j => selected.has(j.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayedJobs.map(j => j.id)));
    }
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page">

      <div className="page-header">
        <h1 className="page-title">Job Search</h1>
      </div>

      {/* Step bar */}
      <div className="step-bar">
        <div className="step-item step-active">
          <span className="step-num">①</span>
          <div className="step-actions">
            <button className="btn btn-primary btn-sm" onClick={startSearch} disabled={searching}>
              {searching
                ? <><span className="spinner" style={{ width: 12, height: 12 }} />{statusMsg || 'Searching…'}</>
                : 'Import Job Posts'}
            </button>
          </div>
        </div>

        <span className="step-divider">|</span>

        <div className="step-item step-active">
          <span className="step-num">②</span>
          <span className="step-label">Select Jobs</span>
        </div>

        <span className="step-divider">|</span>

        <div className="step-item step-active">
          <span className="step-num">③</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={processMatches}
            disabled={selected.size === 0 || processingIds.size > 0}
          >
            {processingIds.size > 0
              ? <><span className="spinner" style={{ width: 12, height: 12 }} />Processing…</>
              : 'Process Matches'}
          </button>
        </div>
      </div>

      {/* Source status bar */}
      <div className={`source-status-bar${showSourceBar ? ' open' : ''}`}>
        <div className="source-status-inner">
          {Object.entries(sourceStatuses).map(([source, { status, count, message }]) => (
            <div key={source} className={`source-status-row source-status-${status}`}>
              <span className="source-status-icon">
                {status === 'fetching' ? <span className="spinner" style={{ width: 11, height: 11 }} /> : status === 'done' ? '✓' : '✕'}
              </span>
              <span className="source-status-label">{source}</span>
              {status === 'done' && <span className="source-status-count">{count} found</span>}
              {status === 'error' && <span className="source-status-msg">{message}</span>}
            </div>
          ))}
          {Object.keys(sourceStatuses).length === 0 && searching && (
            <div className="source-status-row" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              <span className="spinner" style={{ width: 11, height: 11 }} /> Connecting…
            </div>
          )}
        </div>
      </div>

      {/* Filters toggle + Sort */}
      <div className="filters-row">
        <button
          ref={searchOptsButtonRef}
          className={`btn btn-ghost btn-sm${showSearchOptions ? ' btn-active' : ''}`}
          onClick={() => setShowSearchOptions(o => !o)}
        >
          Filters {showSearchOptions ? '▲' : '▼'}
        </button>
        <div className="sort-control">
          <span className="sort-label">Sort By</span>
          <select className="select select-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date">Date</option>
            <option value="match">Match</option>
          </select>
        </div>
      </div>

      {/* Search Options panel */}
      {showSearchOptions && (
        <div className="search-options-panel" ref={searchOptsPanelRef}>
          <div className="search-options-grid">

            <div className="form-group">
              <label className="label">Title</label>
              <input
                className="input"
                placeholder="e.g. Senior Data Engineer"
                value={searchOptions.role_title}
                onChange={e => setOpt('role_title', e.target.value)}
              />
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Separate roles by a comma
              </span>
            </div>
            <div className="form-group">
              <label className="label">Location</label>
              <input
                className="input"
                placeholder="e.g. San Francisco, CA"
                value={searchOptions.location}
                onChange={e => setOpt('location', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Work Type</label>
              <div className="checkbox-group">
                {WORK_TYPE_OPTIONS.map(o => (
                  <label key={o.value} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={searchOptions.remote_preference.includes(o.value)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...searchOptions.remote_preference, o.value]
                          : searchOptions.remote_preference.filter(v => v !== o.value);
                        setOpt('remote_preference', next);
                      }}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="label">Posting Date</label>
              <select className="select" value={searchOptions.posting_date} onChange={e => setOpt('posting_date', e.target.value)}>
                {POSTING_DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Minimum salary</label>
              <select className="select" value={searchOptions.salary_min} onChange={e => setOpt('salary_min', e.target.value)}>
                {SALARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label className="checkbox-label" style={{ marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={searchOptions.include_no_salary}
                  onChange={e => setOpt('include_no_salary', e.target.checked)}
                />
                Include postings without salary
              </label>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={startSearch} disabled={searching}>
              {searching
                ? <><span className="spinner" style={{ width: 12, height: 12 }} />{statusMsg || 'Searching…'}</>
                : '⌕ Import Job Posts'}
            </button>
          </div>
        </div>
      )}

      {/* Fetch errors */}
      {lastSearchInfo?.fetchErrors?.length > 0 && (
        <div className="fetch-errors">
          {lastSearchInfo.fetchErrors.map((e, i) => (
            <div key={i} className="fetch-error-item">
              <span className="fetch-error-source">{e.source}</span>
              <span className="fetch-error-msg">{e.message}</span>
              {e.hint && <span className="fetch-error-hint">{e.hint}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {jobs.length > 0 && (
        <div className="tabs">
          <button
            className={`tab${tab === 'basic' ? ' tab-active' : ''}`}
            onClick={() => setTab('basic')}
          >
            Basic Match
          </button>
          <button
            className={`tab${tab === 'ai' ? ' tab-active' : ''}${!aiDone ? ' tab-disabled' : ''}`}
            onClick={() => aiDone && setTab('ai')}
            disabled={!aiDone}
            title={!aiDone ? 'Run Process Matches first' : undefined}
          >
            AI Match
          </button>
        </div>
      )}

      {/* Job count + select all */}
      {displayedJobs.length > 0 && (
        <div className="jobs-list-header">
          <label className="checkbox-label" style={{ margin: 0 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            Select all
          </label>
          <span className="jobs-count">{displayedJobs.length} Results</span>
        </div>
      )}

      {/* Empty state */}
      {displayedJobs.length === 0 ? (
        <div className="empty-state">
          {searchError ? (
            <><h3>Search failed</h3><p>{searchError}</p></>
          ) : jobs.length > 0 ? (
            <><h3>No results match your filters</h3><p>Try adjusting your Filters to see more listings.</p></>
          ) : lastSearchInfo ? (
            <><h3>No new listings found</h3><p>All previously seen jobs are already in your list.</p></>
          ) : (
            <><h3>No jobs yet</h3><p>Hit Search Jobs to pull listings.</p></>
          )}
        </div>
      ) : (
        <div className="jobs-list">
          {displayedJobs.map(job => {
            const isSelected = selected.has(job.id);
            const isProcessing = processingIds.has(job.id);

            return (
              <div
                key={job.id}
                className={`job-card${isSelected ? ' job-selected' : ''}`}
                onClick={() => setJdJob(job)}
              >
                <input
                  type="checkbox"
                  className="job-checkbox"
                  checked={isSelected}
                  onChange={e => toggleSelect(job.id, e)}
                  onClick={e => e.stopPropagation()}
                />

                <div className="job-scores">
                  {job.keyword_score != null && (
                    <div className="job-score-cell">
                      <ScoreBadge score={job.keyword_score} type="keyword" />
                      <span className="job-score-label">KW</span>
                    </div>
                  )}
                  {job.llm_score != null && (
                    <div className="job-score-cell">
                      <ScoreBadge score={job.llm_score} type="Claude" />
                      <span className="job-score-label">AI</span>
                    </div>
                  )}
                  {isProcessing && <span className="spinner" style={{ alignSelf: 'center' }} />}
                </div>

                <div className="job-info">
                  <div className="job-title">{job.title}</div>
                  <div className="job-meta">
                    <span>{job.company}</span>
                    {job.location && <><span className="meta-sep">·</span><span>{job.location}</span></>}
                    {job.salary && <><span className="meta-sep">·</span><span>{job.salary}</span></>}
                    {job.remote_type && workTypeLabel(job.remote_type) && (
                      <><span className="meta-sep">·</span>
                      <span className={`badge badge-worktype badge-worktype-${job.remote_type}`}>
                        {workTypeLabel(job.remote_type)}
                      </span></>
                    )}
                  </div>
                  {job.posted_at && (
                    <div className="job-card-footer">
                      <span className="job-posted">Posted {formatDate(job.posted_at)}</span>
                    </div>
                  )}
                </div>

                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-sm"
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0, alignSelf: 'center' }}
                  >
                    Apply ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* JD Modal */}
      {jdJob && (
        <div className="jd-overlay" onClick={() => setJdJob(null)}>
          <div className="jd-modal" onClick={e => e.stopPropagation()}>
            <div className="jd-modal-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="jd-field-row">
                  <span className="jd-field-label">Title</span>
                  <span className="jd-modal-title">{jdJob.title}</span>
                </div>
                <div className="jd-field-row">
                  <span className="jd-field-label">Company</span>
                  <span className="jd-modal-meta">{jdJob.company}</span>
                </div>
                {jdJob.location && (
                  <div className="jd-field-row">
                    <span className="jd-field-label">Location</span>
                    <span className="jd-modal-meta">{jdJob.location}</span>
                  </div>
                )}
                {jdJob.remote_type && workTypeLabel(jdJob.remote_type) && (
                  <div className="jd-field-row">
                    <span className="jd-field-label">Work Type</span>
                    <span className={`badge badge-worktype badge-worktype-${jdJob.remote_type}`}>
                      {workTypeLabel(jdJob.remote_type)}
                    </span>
                  </div>
                )}
                {jdJob.salary && (
                  <div className="jd-field-row">
                    <span className="jd-field-label">Salary</span>
                    <span className="jd-modal-meta">{jdJob.salary}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {jdJob.url && (
                  <a href={jdJob.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                    Apply ↗
                  </a>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setJdJob(null)}>✕</button>
              </div>
            </div>

            <div className="jd-modal-body">
              {jdJob.insights_json && (
                <div className="jd-insights">
                  <div className="jd-score-row">
                    {jdJob.keyword_score != null && <ScoreBadge score={jdJob.keyword_score} type="keyword" />}
                    {jdJob.llm_score != null && <ScoreBadge score={jdJob.llm_score} type="Claude" />}
                  </div>
                  {jdJob.insights_json.summary && (
                    <p className="jd-summary">{jdJob.insights_json.summary}</p>
                  )}
                  {jdJob.insights_json.strengths?.length > 0 && (
                    <div className="jd-section">
                      <div className="jd-section-label">Strengths</div>
                      <ul>{jdJob.insights_json.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                  {jdJob.insights_json.gaps?.length > 0 && (
                    <div className="jd-section">
                      <div className="jd-section-label">Gaps</div>
                      <ul>{jdJob.insights_json.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
              {jdJob.raw_text && <JDText text={jdJob.raw_text} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
