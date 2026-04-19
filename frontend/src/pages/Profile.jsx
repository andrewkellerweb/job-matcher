import { useState, useEffect } from 'react';

const BASE = 'http://localhost:3001';

export default function Profile() {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [claudeAvailable, setClaudeAvailable] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/profile`).then(r => r.json()).then(p => setForm({
      insight_threshold: p.insight_threshold ?? 40,
      jsearch_api_key: p.jsearch_api_key || '',
      adzuna_app_id: p.adzuna_app_id || '',
      adzuna_api_key: p.adzuna_api_key || '',
      greenhouse_companies: p.greenhouse_companies || '',
      lever_companies: p.lever_companies || '',
    }));
    fetch(`${BASE}/api/claude/status`).then(r => r.json()).then(d => setClaudeAvailable(d.available));
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function save(e) {
    e?.preventDefault();
    if (!dirty) return;
    const current = await fetch(`${BASE}/api/profile`).then(r => r.json());
    await fetch(`${BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current, ...form }),
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function reconnectClaude() {
    setReconnecting(true);
    try {
      const d = await fetch(`${BASE}/api/claude/verify`, { method: 'POST' }).then(r => r.json());
      setClaudeAvailable(d.ok);
    } finally {
      setReconnecting(false);
    }
  }

  if (!form) return null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Setup</h1>
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Scoring */}
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 16 }}>Scoring</div>
          <div className="form-group" style={{ maxWidth: 240 }}>
            <label className="label">Insight threshold (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              value={form.insight_threshold}
              onChange={e => set('insight_threshold', Number(e.target.value))}
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Claude analysis runs on jobs above this keyword match score (default 40)
            </span>
          </div>
        </div>

        {/* API Keys */}
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 16 }}>API Keys</div>
          <div className="profile-grid">
            <div className="form-group full">
              <label className="label">JSearch API Key (RapidAPI)</label>
              <input
                className="input"
                type="password"
                placeholder="Paste your RapidAPI key"
                value={form.jsearch_api_key}
                onChange={e => set('jsearch_api_key', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Adzuna App ID</label>
              <input
                className="input"
                placeholder="App ID"
                value={form.adzuna_app_id}
                onChange={e => set('adzuna_app_id', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Adzuna API Key</label>
              <input
                className="input"
                type="password"
                placeholder="API key"
                value={form.adzuna_api_key}
                onChange={e => set('adzuna_api_key', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Company Job Boards */}
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Company Job Boards</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            Pull directly from specific companies' career pages. Enter slugs as comma-separated values.{' '}
            Find a company's slug in their Greenhouse/Lever URL (e.g. <code>boards.greenhouse.io/stripe</code> → slug is <code>stripe</code>).
          </div>
          <div className="profile-grid">
            <div className="form-group">
              <label className="label">Greenhouse Companies</label>
              <input
                className="input"
                placeholder="e.g. stripe, airbnb, notion"
                value={form.greenhouse_companies}
                onChange={e => set('greenhouse_companies', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Lever Companies</label>
              <input
                className="input"
                placeholder="e.g. netflix, reddit, vercel"
                value={form.lever_companies}
                onChange={e => set('lever_companies', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Claude */}
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 16 }}>Claude</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {claudeAvailable === null ? (
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Checking…</span>
            ) : claudeAvailable ? (
              <div className="claude-connected" style={{ fontSize: 13 }}>
                <span className="dot" />
                Claude is connected
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Claude is not connected
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={reconnectClaude}
                  disabled={reconnecting}
                >
                  {reconnecting ? <><span className="spinner" /> Connecting…</> : 'Connect Claude'}
                </button>
              </>
            )}
          </div>
        </div>

      </form>
    </div>
  );
}
