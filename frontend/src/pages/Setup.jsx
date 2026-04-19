import { useState, useEffect, useRef } from 'react';

function StepShell({ number, title, done, children }) {
  return (
    <div className={`setup-step${done ? ' setup-step-done' : ''}`}>
      <div className="setup-step-header">
        <div className={`setup-step-num${done ? ' done' : ''}`}>
          {done ? '✓' : number}
        </div>
        <div className="setup-step-title">{title}</div>
        {done && <span className="setup-step-badge">Complete</span>}
      </div>
      {!done && <div className="setup-step-body">{children}</div>}
    </div>
  );
}

export default function Setup({ onComplete }) {
  const [claudeOk, setClaudeOk] = useState(false);
  const [resumeOk, setResumeOk] = useState(false);
  const [jsearchOk, setJsearchOk] = useState(false);
  const [adzunaOk, setAdzunaOk] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  const [jsearchKey, setJsearchKey] = useState('');
  const [adzunaAppId, setAdzunaAppId] = useState('');
  const [adzunaApiKey, setAdzunaApiKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef();

  const allDone = claudeOk && resumeOk && jsearchOk && adzunaOk;

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkClaude, 5000);
    return () => clearInterval(interval);
  }, []);

  async function checkAll() {
    await Promise.all([checkClaude(), checkResume(), checkKeys()]);
  }

  async function checkClaude() {
    try {
      const d = await fetch('http://localhost:3001/api/claude/status').then(r => r.json());
      setClaudeOk(d.available);
    } catch {}
  }

  async function verifyClaude() {
    setVerifying(true);
    setVerifyError(null);
    try {
      const d = await fetch('http://localhost:3001/api/claude/verify', { method: 'POST' }).then(r => r.json());
      if (d.ok) {
        setClaudeOk(true);
      } else {
        setVerifyError(d.error || 'Verification failed. Make sure Claude Code is logged in.');
      }
    } catch {
      setVerifyError('Could not reach the backend. Is the server running?');
    } finally {
      setVerifying(false);
    }
  }

  async function checkResume() {
    try {
      const d = await fetch('http://localhost:3001/api/resume').then(r => r.json());
      setResumeOk(!!d);
    } catch {}
  }

  async function checkKeys() {
    try {
      const p = await fetch('http://localhost:3001/api/profile').then(r => r.json());
      setJsearchKey(p.jsearch_api_key || '');
      setAdzunaAppId(p.adzuna_app_id || '');
      setAdzunaApiKey(p.adzuna_api_key || '');
      setJsearchOk(!!p.jsearch_api_key);
      setAdzunaOk(!!(p.adzuna_app_id && p.adzuna_api_key));
    } catch {}
  }

  async function saveKeys(e) {
    e.preventDefault();
    setSavingKeys(true);
    const current = await fetch('http://localhost:3001/api/profile').then(r => r.json());
    await fetch('http://localhost:3001/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current,
        jsearch_api_key: jsearchKey,
        adzuna_app_id: adzunaAppId,
        adzuna_api_key: adzunaApiKey,
      }),
    });
    setSavingKeys(false);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
    await checkKeys();
  }

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append('resume', file);
    try {
      const res = await fetch('http://localhost:3001/api/resume/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.profileSuggestions?.keywords) {
        const profile = await fetch('http://localhost:3001/api/profile').then(r => r.json());
        if (!profile.keywords) {
          await fetch('http://localhost:3001/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...profile, keywords: data.profileSuggestions.keywords }),
          });
        }
      }
      setResumeOk(true);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-inner">
        <div className="setup-hero">
          <h1 className="setup-title">Enhanced <span>Job Search</span></h1>
          <p className="setup-subtitle">
            Complete the steps below to get started. Your data stays local.
          </p>
        </div>

        <div className="setup-steps">
          {/* Step 1 — Claude */}
          <StepShell number={1} title="Connect Claude" done={claudeOk}>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <a
                href="https://claude.ai/download"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                Download Claude ↗
              </a>
              <button className="btn btn-primary" onClick={verifyClaude} disabled={verifying}>
                {verifying ? <><span className="spinner" /> Connecting…</> : 'Connect Claude'}
              </button>
            </div>
            {verifyError && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{verifyError}</p>
            )}
          </StepShell>

          {/* Step 2 — Resume */}
          <StepShell number={2} title="Upload Your Resume" done={resumeOk}>
            <p className="setup-hint">PDF, DOCX, or plain text.</p>
            <div
              className={`drop-zone${dragOver ? ' drag-over' : ''}`}
              style={{ marginTop: 12, padding: 32 }}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className="drop-zone-icon">{uploading ? '⏳' : '📄'}</div>
              <div className="drop-zone-text">
                {uploading ? 'Parsing…' : 'Drop file here or click to browse'}
              </div>
            </div>
            {uploadError && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{uploadError}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
          </StepShell>

          {/* Step 3 — JSearch */}
          <StepShell number={3} title="Add JSearch API Key" done={jsearchOk}>
            <ol className="setup-substeps">
              <li><strong>3a:</strong> Go to <a href="https://rapidapi.com" target="_blank" rel="noreferrer">rapidapi.com</a> and sign up for a free/Basic plan.</li>
              <li><strong>3b:</strong> Search for <strong>JSearch</strong> in the API marketplace and select the first version.</li>
              <li><strong>3c:</strong> Find the <em>X-RapidAPI-Key</em> and paste it below and click Save.</li>
            </ol>
            <form onSubmit={saveKeys} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input
                className="input"
                type="password"
                placeholder="RapidAPI key"
                value={jsearchKey}
                onChange={e => setJsearchKey(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={savingKeys || !jsearchKey}>
                {keySaved ? '✓' : 'Save'}
              </button>
            </form>
          </StepShell>

          {/* Step 4 — Adzuna */}
          <StepShell number={4} title="Add Adzuna Credentials" done={adzunaOk}>
            <ol className="setup-substeps">
              <li>Adzuna is a free job aggregator with salary data.</li>
              <li><strong>4a:</strong> Register for an Adzuna account <a href="https://developer.adzuna.com/signup" target="_blank" rel="noreferrer">here</a>.</li>
              <li><strong>4b:</strong> Check your email and validate the account.</li>
              <li><strong>4c:</strong> Log in and go to <strong>Dashboard &gt; API Access Details</strong> and find your Application ID and Key, paste them here, and click Save.</li>
            </ol>
            <form onSubmit={saveKeys} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input"
                placeholder="App ID"
                value={adzunaAppId}
                onChange={e => setAdzunaAppId(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="API key"
                value={adzunaApiKey}
                onChange={e => setAdzunaApiKey(e.target.value)}
              />
              <div>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingKeys || !adzunaAppId || !adzunaApiKey}
                >
                  {keySaved ? '✓' : 'Save'}
                </button>
              </div>
            </form>
          </StepShell>
        </div>

        {allDone && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 15 }} onClick={onComplete}>
              Get Started →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
