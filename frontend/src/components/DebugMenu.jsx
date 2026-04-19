import { useState, useRef, useEffect } from 'react';

const BASE = 'http://localhost:3001';

const ACTIONS = [
  {
    id: 'reset',
    label: 'Return to setup page',
    hint: 'Disconnects Claude, deletes resume, API keys, and all jobs',
    endpoint: '/api/debug/reset',
    confirm: 'This will clear everything and return to setup. Are you sure?',
    reload: true,
  },
  {
    id: 'disconnect',
    label: 'Disconnect Claude',
    hint: 'Requires re-verification on next use',
    endpoint: '/api/debug/disconnect-claude',
    confirm: null,
    reload: false,
    onSuccess: () => window.dispatchEvent(new CustomEvent('claude-disconnected')),
  },
  {
    id: 'clear-resume-profile',
    label: 'Clear resume & profile data',
    hint: 'Deletes resume and resets all profile/API fields',
    endpoint: '/api/debug/clear-resume-profile',
    confirm: 'Delete resume and reset all profile data?',
    reload: false,
  },
  {
    id: 'clear-jobs',
    label: 'Clear database',
    hint: 'Deletes all fetched job listings',
    endpoint: '/api/debug/clear-jobs',
    confirm: 'Delete all job listings?',
    reload: false,
  },
  {
    id: 'clear-reimport',
    label: 'Clear & Re-import',
    hint: 'Clears all jobs then runs a fresh import',
    endpoint: '/api/debug/clear-jobs',
    confirm: 'Clear all saved jobs and re-import fresh?',
    reload: false,
    onSuccess: () => window.dispatchEvent(new CustomEvent('debug-reimport')),
  },
];

export default function DebugMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef();

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function runAction(action) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBusy(action.id);
    setOpen(false);
    try {
      await fetch(`${BASE}${action.endpoint}`, { method: 'POST' });
      action.onSuccess?.();
      if (action.reload) window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  function downloadLog() {
    setOpen(false);
    window.location.href = `${BASE}/api/log`;
  }

  return (
    <div className="debug-wrapper" ref={ref}>
      {open && (
        <div className="debug-menu">
          <button className="debug-menu-item" onClick={downloadLog}>
            <span className="debug-menu-label">Download log</span>
            <span className="debug-menu-hint">Activity log for the last 30 days</span>
          </button>
          {ACTIONS.map(action => (
            <button
              key={action.id}
              className="debug-menu-item"
              onClick={() => runAction(action)}
              disabled={busy === action.id}
            >
              <span className="debug-menu-label">{action.label}</span>
              <span className="debug-menu-hint">{action.hint}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="debug-btn"
        onClick={() => setOpen(o => !o)}
        title="Debug"
      >
        {busy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⚙'}
      </button>
    </div>
  );
}
