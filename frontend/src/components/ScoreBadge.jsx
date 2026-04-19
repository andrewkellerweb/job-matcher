export default function ScoreBadge({ score, type = 'keyword' }) {
  if (score === null || score === undefined) {
    return <div className="score-badge score-none" title={`${type} score`}>–</div>;
  }

  const cls = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
  return (
    <div className={`score-badge ${cls}`} title={`${type} match score`}>
      {score}
    </div>
  );
}
