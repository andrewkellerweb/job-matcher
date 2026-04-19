export default function InsightsPanel({ insights, onAnalyze, analyzing, claudeAvailable, keywordScore, threshold }) {
  if (!insights) {
    const belowThreshold = keywordScore !== null && keywordScore < threshold;

    return (
      <div className="insights">
        <div className="insights-actions">
          {claudeAvailable ? (
            <>
              {belowThreshold && (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Score below {threshold}% threshold —
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? <><span className="spinner" /> Analyzing...</> : '⚡ Run Claude Analysis'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Connect Claude to see insights
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="insights">
      {insights.industryMismatch && (
        <div className="insights-section">
          <h4>⚠ Industry Mismatch</h4>
          <p style={{ fontSize: 12, color: 'var(--red)' }}>
            {insights.industryMismatchReason || 'Your background may not align with this industry.'}
          </p>
        </div>
      )}

      {insights.atsFilterRisks?.length > 0 && (
        <div className="insights-section">
          <h4>ATS Filter Risks</h4>
          <ul className="insights-list">
            {insights.atsFilterRisks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {insights.missingSkills?.length > 0 && (
        <div className="insights-section">
          <h4>Missing Skills</h4>
          <ul className="insights-list">
            {insights.missingSkills.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {insights.keywordGaps?.length > 0 && (
        <div className="insights-section">
          <h4>Keyword Gaps</h4>
          <ul className="insights-list">
            {insights.keywordGaps.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </div>
      )}

      {insights.resumeEdits?.length > 0 && (
        <div className="insights-section">
          <h4>Suggested Resume Edits</h4>
          <ul className="insights-list">
            {insights.resumeEdits.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="insights-actions">
        <button className="btn btn-ghost btn-sm" onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? <><span className="spinner" /> Re-analyzing...</> : '↺ Re-analyze'}
        </button>
      </div>
    </div>
  );
}
