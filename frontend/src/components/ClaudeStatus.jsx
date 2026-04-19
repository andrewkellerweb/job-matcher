import { useState, useEffect } from 'react';

export default function ClaudeStatus() {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/claude/status')
      .then(r => r.json())
      .then(d => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, []);

  if (available === null) return null;

  if (available) {
    return (
      <div className="claude-connected">
        <span className="dot" />
        Claude connected
      </div>
    );
  }

  return (
    <a
      href="https://claude.ai/download"
      target="_blank"
      rel="noreferrer"
      className="claude-connect"
    >
      ⚡ Connect Claude
    </a>
  );
}
