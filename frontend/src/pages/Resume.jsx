import { useState, useEffect, useRef } from 'react';

const BASE = 'http://localhost:3001';

function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function Resume() {
  const [resume, setResume] = useState(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [contextDirty, setContextDirty] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef();

  useEffect(() => { loadResume(); }, []);

  async function loadResume() {
    const data = await fetch(`${BASE}/api/resume`).then(r => r.json()).catch(() => null);
    if (data) {
      setResume(data);
      setAdditionalContext(data.additional_context || '');
    }
  }

  async function saveContext() {
    await fetch(`${BASE}/api/resume/additional-context`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additional_context: additionalContext }),
    });
    setContextDirty(false);
    setContextSaved(true);
    setTimeout(() => setContextSaved(false), 2000);
  }

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append('resume', file);
    try {
      const res = await fetch(`${BASE}/api/resume/import`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadResume();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!resume) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Resume</h1></div>
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <div className="drop-zone-icon">{uploading ? '⏳' : '📄'}</div>
          <div className="drop-zone-text">{uploading ? 'Parsing resume…' : 'Drop your resume here or click to browse'}</div>
          <div className="drop-zone-hint">PDF, DOCX, or plain text · max 10 MB</div>
          {uploadError && <div style={{ color: 'var(--red)', marginTop: 12, fontSize: 13 }}>{uploadError}</div>}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Resume</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`${BASE}/api/resume/file`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
          >
            View File ↗
          </a>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Re-upload'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{resume.filename}</strong>
            {resume.imported_at && (
              <span style={{ marginLeft: 10, color: 'var(--text-dim)' }}>
                Last uploaded {formatTimestamp(resume.imported_at)}
              </span>
            )}
          </div>
          {uploadError && (
            <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{uploadError}</div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 3 }}>Additional Context</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Add projects you've worked on or your answers to interview prep questions to increase the AI Match accuracy
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={saveContext}
              disabled={!contextDirty}
              style={{ flexShrink: 0, marginLeft: 16 }}
            >
              {contextSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <textarea
            className="resume-textarea"
            rows={10}
            placeholder="e.g. Built a distributed caching layer at Company X that reduced latency by 40%..."
            value={additionalContext}
            onChange={e => { setAdditionalContext(e.target.value); setContextDirty(true); setContextSaved(false); }}
          />
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
    </div>
  );
}
