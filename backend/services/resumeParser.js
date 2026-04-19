import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { readFileSync } from 'fs';

export function parseResumeText(rawText) {
  return { rawText, structured: extractStructure(rawText) };
}

export async function parseResumeFile(filePath, mimetype) {
  let rawText = '';

  if (mimetype === 'application/pdf') {
    const buffer = readFileSync(filePath);
    const result = await pdfParse(buffer);
    rawText = result.text;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    rawText = result.value;
  } else {
    rawText = readFileSync(filePath, 'utf-8');
  }

  return { rawText, structured: extractStructure(rawText) };
}

const SECTION_HEADING_RE = /^(work experience|experience|employment|education|skills|technical skills|certifications?|licenses?|credentials?|summary|objective|profile|about|projects?|publications?|awards?|languages?|competencies|tools|technologies)/i;
const ALL_CAPS_RE = /^[A-Z][A-Z\s\-\/]{2,}$/;

function isSectionHeading(line) {
  return SECTION_HEADING_RE.test(line) || ALL_CAPS_RE.test(line);
}

function extractStructure(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const name = extractName(lines);
  const title = extractTitle(lines, name);
  const summary = extractSummaryBlock(lines, name, title) ||
    extractSection(lines, ['summary', 'objective', 'profile', 'about']);
  const experienceText = extractSection(lines, ['work experience', 'experience', 'employment', 'work history', 'positions']);
  const experience_roles = splitExperienceRoles(experienceText);
  const education = extractSection(lines, ['education', 'academic', 'degree', 'university', 'college']);
  const certifications = extractSection(lines, ['certification', 'certifications', 'licenses', 'credentials']);
  const skills_sections = extractSkillsSections(text);
  const skills = skills_sections
    ? skills_sections.flatMap(s => s.text.split(',').map(t => t.trim()).filter(Boolean))
    : extractSkills(text);

  return { name, title, summary, skills, skills_sections, experience: experienceText, experience_roles, education, certifications };
}

function extractName(lines) {
  for (const line of lines.slice(0, 4)) {
    if (line.length < 60 && !isSectionHeading(line) && /^[A-Za-z]/.test(line) && !line.includes('@') && !line.includes('http')) {
      return line;
    }
  }
  return lines[0] || '';
}

function extractTitle(lines, name) {
  const nameIdx = lines.findIndex(l => l === name);
  for (let i = nameIdx + 1; i < Math.min(nameIdx + 5, lines.length); i++) {
    const line = lines[i];
    if (!isSectionHeading(line) && line.length < 80 && !line.includes('@') && !line.includes('http') && !/^\d/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractSummaryBlock(lines, name, title) {
  const knownHeaders = [name, title].filter(Boolean);
  let pastHeader = false;
  const summaryLines = [];

  for (const line of lines) {
    if (knownHeaders.includes(line)) { pastHeader = true; continue; }
    if (!pastHeader) continue;
    if (isSectionHeading(line)) {
      if (summaryLines.length > 0) break;
      continue;
    }
    if (summaryLines.length === 0 && (line.includes('@') || line.includes('|') || /^\+?\d[\d\s\-().]+$/.test(line))) continue;
    summaryLines.push(line);
    if (summaryLines.join(' ').length > 800) break;
  }

  const result = summaryLines.join(' ').trim();
  return result.length > 20 ? result : '';
}

function extractSection(lines, headings) {
  const headingRe = new RegExp(`^(${headings.join('|')})\\b`, 'i');
  const sectionLines = [];
  let inSection = false;

  for (const line of lines) {
    if (headingRe.test(line)) { inSection = true; continue; }
    if (inSection) {
      if (isSectionHeading(line) && sectionLines.length > 0) break;
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim();
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function extractSkillsSections(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sectionRaw = extractSection(
    lines,
    ['skills', 'technical skills', 'competencies', 'technologies', 'tools']
  );
  if (!sectionRaw) return null;

  const sectionLines = sectionRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const labelRe = /^([A-Z][A-Z\s&]{3,}):\s*(.*)/;
  const hasSubs = sectionLines.some(l => labelRe.test(l));
  if (!hasSubs) return null;

  const sections = [];
  let cur = null;
  for (const line of sectionLines) {
    const m = line.match(labelRe);
    if (m) {
      if (cur) sections.push(cur);
      cur = { label: toTitleCase(m[1].trim()), text: m[2].trim() };
    } else if (cur) {
      cur.text += (cur.text ? ', ' : '') + line;
    }
  }
  if (cur) sections.push(cur);
  return sections.length > 0 ? sections : null;
}

function extractDateRange(text) {
  const mo = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const unit = `(?:${mo}\\s+)?(?:19|20)\\d{2}|[Pp]resent|[Cc]urrent`;
  const m = text.match(new RegExp(`(${unit})\\s*[–\\-—]\\s*(${unit})`));
  if (m) return { start: m[1].trim(), end: m[2].trim() };
  const sm = text.match(new RegExp(`(${unit})`));
  return sm ? { start: sm[1].trim(), end: '' } : { start: '', end: '' };
}

function parseRoleText(roleText) {
  const lines = roleText.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { company: '', title: '', start_date: '', end_date: '', responsibilities: '' };

  const dateRe = /\b(19|20)\d{2}\b/;
  const bulletRe = /^[•\-\*\u2022]/;

  const dateLineIdx = lines.findIndex(l => dateRe.test(l) && !bulletRe.test(l));

  let title = '';
  let company = '';
  let start_date = '';
  let end_date = '';
  let bodyStart = 1;

  if (dateLineIdx > 0) {
    title = lines[0];
    const dateLine = lines[dateLineIdx];
    const parts = dateLine.split(/\s*\|\s*/);
    company = parts[0].trim();
    const datePart = parts.find(p => dateRe.test(p)) || dateLine;
    const dates = extractDateRange(datePart);
    start_date = dates.start;
    end_date = dates.end;
    bodyStart = dateLineIdx + 1;
  } else if (dateLineIdx === 0) {
    const parts = lines[0].split(/\s*\|\s*/);
    company = parts[0].trim();
    const datePart = parts.find(p => dateRe.test(p)) || lines[0];
    const dates = extractDateRange(datePart);
    start_date = dates.start;
    end_date = dates.end;
    bodyStart = 1;
  } else {
    title = lines[0] || '';
    company = lines[1] || '';
    bodyStart = 2;
  }

  const responsibilities = lines.slice(bodyStart).join('\n');
  return { company, title, start_date, end_date, responsibilities };
}

function splitExperienceRoles(experienceText) {
  if (!experienceText) return [];
  const lines = experienceText.split('\n');
  const dateRe = /\b(19|20)\d{2}\b/;
  const bulletRe = /^[\s]*[•\-\*\u2022]/;

  const roleStartIdxs = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !dateRe.test(line) || bulletRe.test(line)) continue;

    let titleIdx = i - 1;
    while (titleIdx >= 0 && !lines[titleIdx].trim()) titleIdx--;
    if (
      titleIdx >= 0 &&
      !bulletRe.test(lines[titleIdx].trim()) &&
      !dateRe.test(lines[titleIdx].trim()) &&
      lines[titleIdx].trim().length > 0
    ) {
      if (!roleStartIdxs.includes(titleIdx)) roleStartIdxs.push(titleIdx);
    } else {
      if (!roleStartIdxs.includes(i)) roleStartIdxs.push(i);
    }
  }

  if (roleStartIdxs.length === 0) return [parseRoleText(experienceText.trim())];
  roleStartIdxs.sort((a, b) => a - b);

  const roles = [];
  if (roleStartIdxs[0] > 0) {
    const pre = lines.slice(0, roleStartIdxs[0]).join('\n').trim();
    if (pre) roles.push(parseRoleText(pre));
  }
  for (let i = 0; i < roleStartIdxs.length; i++) {
    const start = roleStartIdxs[i];
    const end = i + 1 < roleStartIdxs.length ? roleStartIdxs[i + 1] : lines.length;
    const text = lines.slice(start, end).join('\n').trim();
    if (text) roles.push(parseRoleText(text));
  }
  return roles.length > 0 ? roles : [parseRoleText(experienceText.trim())];
}

function extractSkills(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const skillsSection = extractSection(
    lines,
    ['skills', 'technical skills', 'competencies', 'technologies', 'tools']
  );

  const raw = skillsSection || '';
  const tokens = raw
    .split(/[,•|\n\/·]+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 1 && s.length < 40 && !/^\d+$/.test(s) && !/^&/.test(s));

  return [...new Set(tokens)].slice(0, 80);
}

export function resumeToPlainText(structured) {
  const parts = [];
  if (structured.name) parts.push(structured.name);
  if (structured.title) parts.push(structured.title);
  if (structured.summary) parts.push(`SUMMARY\n${structured.summary}`);
  if (structured.skills_sections?.length) {
    parts.push(`SKILLS\n${structured.skills_sections.map(s => `${s.label}: ${s.text}`).join('\n')}`);
  } else if (structured.skills?.length) {
    parts.push(`SKILLS\n${structured.skills.join(', ')}`);
  }
  if (structured.experience_roles?.length) {
    parts.push(`EXPERIENCE\n${structured.experience_roles.join('\n\n')}`);
  } else if (structured.experience) {
    parts.push(`EXPERIENCE\n${structured.experience}`);
  }
  if (structured.education) parts.push(`EDUCATION\n${structured.education}`);
  if (structured.certifications) parts.push(`CERTIFICATIONS\n${structured.certifications}`);
  return parts.join('\n\n');
}

export function extractProfileFromResume(structured) {
  const titlePatterns = [
    /(?:senior|lead|principal|staff|junior)?\s*(?:software|frontend|backend|full.?stack|data|devops|platform|mobile|cloud|ai|ml|machine learning)\s*(?:engineer|developer|architect|scientist|analyst)/gi,
    /(?:product|project|program)\s*manager/gi,
    /(?:ux|ui|product|graphic)\s*designer/gi,
    /(?:marketing|sales|growth|operations)\s*(?:manager|director|lead|specialist)/gi,
  ];

  const searchText = [structured.title, structured.skills?.join(' '), structured.experience].filter(Boolean).join(' ');
  const foundTitles = new Set();
  for (const pattern of titlePatterns) {
    (searchText.match(pattern) || []).forEach(m => foundTitles.add(m.trim()));
  }

  const keywords = structured.title || [...foundTitles].slice(0, 3).join(', ') || '';
  return { keywords };
}
