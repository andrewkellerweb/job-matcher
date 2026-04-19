import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resumeToPlainText } from './resumeParser.js';

function findClaudeBinary() {
  const appDir = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code');
  if (existsSync(appDir)) {
    const versions = readdirSync(appDir).sort().reverse();
    for (const v of versions) {
      const bin = join(appDir, v, 'claude.app', 'Contents', 'MacOS', 'claude');
      if (existsSync(bin)) return bin;
    }
  }
  return 'claude';
}

const CLAUDE_BIN = findClaudeBinary();

export function isClaudeAvailable() {
  try {
    const result = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8', timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function verifyClaudeAuth() {
  try {
    const result = spawnSync(
      CLAUDE_BIN,
      ['-p', 'Reply with exactly: ok', '--output-format', 'text'],
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 64 * 1024 }
    );
    if (result.status !== 0) {
      return { ok: false, error: (result.stderr || '').trim() || 'Claude exited with an error.' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function scoreWithClaude(resumeStructured, jobRawText, jobTitle, company, additionalContext = '') {
  const resumeText = resumeToPlainText(resumeStructured);
  const contextSection = additionalContext?.trim()
    ? `\nADDITIONAL CANDIDATE CONTEXT (projects, interview prep, supplemental info):\n${additionalContext.slice(0, 2000)}`
    : '';

  const prompt = `You are an ATS (Applicant Tracking System) expert. Analyze how well this candidate matches the job description and respond ONLY with a JSON object — no markdown, no explanation.

RESUME:
${resumeText}${contextSection}

JOB: ${jobTitle} at ${company || 'Unknown Company'}
JOB DESCRIPTION:
${jobRawText.slice(0, 4000)}

Return exactly this JSON shape:
{
  "score": <integer 0-100>,
  "missingSkills": [<string>, ...],
  "keywordGaps": [<string>, ...],
  "resumeEdits": [<string>, ...],
  "industryMismatch": <boolean>,
  "industryMismatchReason": <string or null>,
  "atsFilterRisks": [<string>, ...]
}

scoring guide:
- 90-100: strong match, hire immediately
- 70-89: good match, minor gaps
- 50-69: moderate match, notable gaps
- 30-49: weak match, significant gaps
- 0-29: poor match

Keep arrays concise (max 5 items each). Be specific and actionable.`;

  try {
    const result = spawnSync(CLAUDE_BIN, ['-p', prompt, '--output-format', 'text'], {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || 'Claude exited with non-zero status');
    }

    const output = result.stdout.trim();
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude output');

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Claude scoring failed:', err.message);
    return null;
  }
}
