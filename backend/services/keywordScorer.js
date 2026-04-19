import { resumeToPlainText } from './resumeParser.js';

// ── Stopwords ─────────────────────────────────────────────────────────────────
// Articles, prepositions, conjunctions, pronouns, auxiliary verbs, JD filler
const STOPWORDS = new Set([
  // Articles
  'a', 'an', 'the',
  // Prepositions
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'by', 'down', 'during', 'except', 'for', 'from', 'in', 'inside', 'into',
  'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past',
  'since', 'through', 'throughout', 'to', 'toward', 'under', 'until', 'up',
  'upon', 'via', 'with', 'within', 'without', 'per', 'like', 'than',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'although', 'because', 'if',
  'since', 'though', 'unless', 'until', 'when', 'where', 'while', 'as',
  'both', 'either', 'neither',
  // Pronouns
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that',
  'these', 'those', 'who', 'whom', 'which', 'what', 'each', 'all', 'any',
  'some', 'few', 'more', 'most', 'other', 'such', 'own', 'same',
  // Auxiliary verbs
  'be', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'must', 'need', 'used',
  // Common JD filler (not skill-bearing)
  'able', 'also', 'apply', 'based', 'candidate', 'candidates', 'company',
  'day', 'days', 'equal', 'etc', 'include', 'including', 'job', 'just',
  'new', 'not', 'only', 'opportunity', 'position', 'role', 'team', 'us',
  'use', 'using', 'very', 'well', 'work', 'working', 'year', 'years',
  'no', 'ii', 'iii', 'iv', 'ie', 'eg', 'vs', 'help', 'ensure', 'support',
  'provide', 'drive', 'build', 'make', 'create', 'join', 'employer',
  'apply', 'required', 'preferred', 'qualifications', 'responsibilities',
  'requirements', 'benefits', 'skills', 'experience', 'hi', 'hello',
]);

// ── ATS Critical Terms (weighted 2×) ──────────────────────────────────────────
// Curated list of terms that ATS systems specifically look for.
// Includes both single tokens and exact phrases (checked via substring match).
const BASE_ATS_TERMS = new Set([
  // Programming languages
  'python', 'java', 'javascript', 'typescript', 'golang', 'rust', 'scala',
  'kotlin', 'swift', 'ruby', 'php', 'perl', 'matlab', 'bash', 'powershell',

  // Frontend
  'react', 'angular', 'vue', 'svelte', 'html', 'css', 'webpack', 'vite',
  'next.js', 'redux', 'graphql',

  // Backend / frameworks
  'node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails',
  'asp.net', 'grpc', 'rest api', 'restful',

  // Cloud
  'aws', 'azure', 'gcp', 'google cloud', 'amazon web services',

  // DevOps / infra
  'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions',
  'ci/cd', 'devops', 'sre', 'helm', 'linux', 'unix',

  // Databases
  'sql', 'postgresql', 'mysql', 'oracle', 'sql server', 'mongodb', 'redis',
  'elasticsearch', 'dynamodb', 'cassandra', 'neo4j',

  // Data / analytics
  'spark', 'hadoop', 'kafka', 'airflow', 'dbt', 'snowflake', 'databricks',
  'redshift', 'bigquery', 'tableau', 'power bi', 'looker', 'pandas',
  'numpy', 'etl', 'data pipeline', 'data warehouse', 'data modeling',
  'business intelligence', 'data visualization', 'statistical analysis',

  // ML / AI
  'machine learning', 'deep learning', 'nlp', 'llm', 'pytorch', 'tensorflow',
  'scikit-learn', 'computer vision', 'generative ai', 'large language model',
  'reinforcement learning', 'neural network',

  // Architecture
  'microservices', 'event-driven', 'distributed systems', 'system design',
  'api design', 'kafka', 'message queue',

  // Project / Program Management
  'pmp', 'pmi', 'pmi-acp', 'safe', 'prince2',
  'program management', 'project management', 'portfolio management',
  'stakeholder management', 'change management', 'risk management',
  'vendor management', 'budget management', 'resource management',
  'conflict resolution', 'capacity planning',
  'roadmap', 'milestone', 'deliverable', 'backlog', 'sprint', 'epic',
  'jira', 'confluence', 'smartsheet', 'ms project', 'asana', 'monday.com',
  'okr', 'kpi', 'sla', 'p&l', 'roi',
  'agile', 'scrum', 'kanban', 'waterfall', 'lean', 'six sigma',
  'cross-functional', 'cross functional',

  // Product management
  'product strategy', 'product roadmap', 'go-to-market', 'gtm',
  'product lifecycle', 'user research', 'a/b testing', 'mvp',
  'user story', 'product analytics', 'product-led',

  // Security
  'cybersecurity', 'cissp', 'soc 2', 'iso 27001', 'penetration testing',
  'vulnerability', 'zero trust', 'iam',

  // Leadership / people management
  'strategic planning', 'executive communication', 'organizational development',
  'people management', 'performance management', 'hiring', 'mentorship',
  'succession planning',

  // Finance / business
  'financial modeling', 'forecasting', 'budgeting', 'p&l management',
  'salesforce', 'crm', 'erp', 'sap', 'workday',

  // Design
  'figma', 'sketch', 'ux', 'user experience', 'ui', 'usability testing',
  'design system', 'wireframing', 'prototyping', 'accessibility',

  // Education / certs
  'bachelor', 'master', 'phd', 'mba', 'degree',
  'aws certified', 'google certified', 'pmp certified', 'cpa', 'cfa',
]);

// ── Role → relevant extra ATS terms (dynamically added by title filter) ───────
const ROLE_TERM_MAP = {
  program:   [
    'program management', 'pmp', 'pmi', 'pmi-acp', 'stakeholder management',
    'portfolio management', 'change management', 'risk management', 'roadmap',
    'cross-functional', 'milestone', 'deliverable', 'budget management',
    'resource management', 'agile', 'scrum', 'okr', 'kpi', 'executive communication',
    'vendor management', 'capacity planning', 'jira', 'confluence',
  ],
  project:   [
    'project management', 'pmp', 'stakeholder management', 'milestone',
    'deliverable', 'risk management', 'agile', 'scrum', 'jira', 'budget management',
    'resource management', 'change management', 'gantt', 'waterfall',
  ],
  product:   [
    'product strategy', 'product roadmap', 'go-to-market', 'backlog',
    'user research', 'a/b testing', 'mvp', 'product lifecycle', 'okr', 'kpi',
    'agile', 'scrum', 'jira', 'stakeholder management', 'user story',
    'product analytics', 'competitive analysis',
  ],
  data:      [
    'sql', 'python', 'analytics', 'tableau', 'power bi', 'looker',
    'data modeling', 'etl', 'data pipeline', 'snowflake', 'databricks',
    'business intelligence', 'data visualization', 'statistical analysis',
    'spark', 'airflow', 'dbt',
  ],
  engineer:  [
    'python', 'java', 'javascript', 'aws', 'docker', 'kubernetes',
    'ci/cd', 'rest api', 'microservices', 'agile', 'scrum', 'sql',
    'system design', 'distributed systems',
  ],
  software:  [
    'python', 'java', 'javascript', 'typescript', 'aws', 'docker',
    'kubernetes', 'ci/cd', 'agile', 'scrum', 'rest api', 'microservices',
    'sql', 'system design', 'git',
  ],
  manager:   [
    'stakeholder management', 'cross-functional', 'strategic planning',
    'budget management', 'roadmap', 'agile', 'okr', 'kpi', 'hiring',
    'mentorship', 'people management', 'performance management', 'risk management',
  ],
  director:  [
    'strategic planning', 'executive communication', 'p&l', 'p&l management',
    'stakeholder management', 'okr', 'organizational development', 'roadmap',
    'budget management', 'hiring', 'portfolio management', 'board',
  ],
  analyst:   [
    'sql', 'excel', 'tableau', 'power bi', 'analytics', 'business intelligence',
    'python', 'data modeling', 'kpi', 'reporting', 'statistical analysis',
    'data visualization', 'forecasting',
  ],
  marketing: [
    'seo', 'sem', 'google analytics', 'hubspot', 'salesforce', 'crm',
    'campaign management', 'content strategy', 'b2b', 'b2c', 'go-to-market',
  ],
  sales:     [
    'salesforce', 'crm', 'quota', 'pipeline', 'b2b', 'account management',
    'business development', 'enterprise sales',
  ],
  design:    [
    'figma', 'sketch', 'ux', 'user experience', 'ui', 'usability testing',
    'design system', 'wireframing', 'prototyping', 'accessibility', 'user research',
  ],
};

function getRoleTerms(roleTitleString) {
  if (!roleTitleString) return new Set();
  const lc = roleTitleString.toLowerCase();
  const terms = new Set();
  for (const [keyword, roleTerms] of Object.entries(ROLE_TERM_MAP)) {
    if (lc.includes(keyword)) {
      roleTerms.forEach(t => terms.add(t));
    }
  }
  return terms;
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#+.\-\/\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

// Check whether a known phrase appears in lowercase text
function phraseInText(phrase, lcText) {
  return lcText.includes(phrase);
}

// ── Main scorer ───────────────────────────────────────────────────────────────
export function scoreKeywords(resumeStructured, jobRawText, roleTitles = '') {
  const resumeText = resumeToPlainText(resumeStructured);
  const resumeLc  = resumeText.toLowerCase();
  const jobLc     = (jobRawText || '').toLowerCase();

  const roleTerms = getRoleTerms(roleTitles);
  const allAtsTerms = new Set([...BASE_ATS_TERMS, ...roleTerms]);

  // Step 1: Which ATS phrases (including multi-word) appear in the job text?
  const jobAtsFound = new Set();
  const atsWordsCovered = new Set(); // individual tokens already covered by an ATS phrase
  for (const phrase of allAtsTerms) {
    if (phraseInText(phrase, jobLc)) {
      jobAtsFound.add(phrase);
      // Mark the individual words of multi-word phrases as covered
      if (phrase.includes(' ')) {
        phrase.split(' ').forEach(w => atsWordsCovered.add(w));
      } else {
        atsWordsCovered.add(phrase);
      }
    }
  }

  // Step 2: Non-ATS unigrams from the job (skip tokens already covered by an ATS term)
  const jobTokens = new Set(tokenize(jobRawText || ''));
  const remainingTokens = [...jobTokens].filter(t => !atsWordsCovered.has(t));

  // Step 3: Score
  let matched = 0;
  let total   = 0;
  const matchedTerms  = [];
  const missingTerms  = [];

  const score_term = (term, weight) => {
    total += weight;
    if (phraseInText(term, resumeLc)) {
      matched += weight;
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  };

  // ATS terms (weighted 2×)
  for (const term of jobAtsFound) score_term(term, 2);

  // Remaining unigrams (weighted 1×)
  for (const term of remainingTokens) score_term(term, 1);

  const score = total > 0 ? Math.round((matched / total) * 100) : 0;
  const atsMissingTerms = missingTerms.filter(t => allAtsTerms.has(t));

  return {
    score,
    matchedTerms:  matchedTerms.slice(0, 30),
    missingTerms:  missingTerms.slice(0, 30),
    atsMissingTerms,
  };
}

export function extractJobSkills(rawText, roleTitles = '') {
  const roleTerms  = getRoleTerms(roleTitles);
  const allAts     = new Set([...BASE_ATS_TERMS, ...roleTerms]);
  const lcText     = (rawText || '').toLowerCase();
  const skills     = new Set();

  for (const phrase of allAts) {
    if (phraseInText(phrase, lcText)) skills.add(phrase);
  }

  return [...skills].slice(0, 50);
}
