import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const rootDir = process.cwd();
const errors = [];

const mandatoryGateHeadings = new Set([
  'UI/Card Change Design Gates (Mandatory)',
  'Backend/Auth/Schema Workflow Tightening (Mandatory)',
  'Verification Default (Mandatory)',
  'Test Anti-Pattern Gate (Mandatory)',
  'Security Gate Criteria (Mandatory)',
  'Phase 0 -> 1 Safety Gate',
  'Phase 2 Code Review Gate',
  'Phase 4 Security Testing Gate'
]);

function walk(dirPath, out = []) {
  if (!existsSync(dirPath)) {
    return out;
  }
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const absolutePath = join(dirPath, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walk(absolutePath, out);
      continue;
    }
    out.push(absolutePath);
  }
  return out;
}

function normalizeHeading(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function markdownFiles() {
  const topLevel = ['AGENTS.md', 'README.md', '.github/copilot-instructions.md'];
  const docs = walk(resolve(rootDir, 'docs')).filter((p) => p.endsWith('.md'));
  const agentDocs = walk(resolve(rootDir, '.github', 'agents')).filter((p) => p.endsWith('.md'));
  const skillDocs = walk(resolve(rootDir, '.agents', 'skills')).filter((p) => p.endsWith('.md'));

  const merged = [...topLevel.map((p) => resolve(rootDir, p)), ...docs, ...agentDocs, ...skillDocs];
  return merged.filter((p) => existsSync(p));
}

function extractSkillsFromAgentsDoc() {
  const agentsPath = resolve(rootDir, 'AGENTS.md');
  const content = readFileSync(agentsPath, 'utf8');
  const lines = content.split('\n');
  const skills = new Set();

  for (const line of lines) {
    const match = line.match(/^\|\s*([a-z0-9-]+)\s*\|/i);
    if (!match) {
      continue;
    }
    const skill = match[1].trim();
    if (skill.toLowerCase() === 'skill' || skill === '---') {
      continue;
    }
    skills.add(skill);
  }

  return skills;
}

function extractSkillsFromDirectory() {
  const skillsRoot = resolve(rootDir, '.agents', 'skills');
  if (!existsSync(skillsRoot)) {
    return new Set();
  }

  const entries = readdirSync(skillsRoot);
  const skills = new Set();

  for (const entry of entries) {
    const skillDir = join(skillsRoot, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }
    const skillDoc = join(skillDir, 'SKILL.md');
    if (!existsSync(skillDoc)) {
      continue;
    }
    skills.add(entry);
  }

  return skills;
}

function compareSkills() {
  const listed = extractSkillsFromAgentsDoc();
  const existing = extractSkillsFromDirectory();

  for (const skill of listed) {
    if (!existing.has(skill)) {
      errors.push(`Skill listed in AGENTS.md missing from .agents/skills: ${skill}`);
    }
  }

  for (const skill of existing) {
    if (!listed.has(skill)) {
      errors.push(`Skill directory exists but is missing from AGENTS.md table: ${skill}`);
    }
  }
}

function checkGateHeadingRedefinitions() {
  const canonicalGatesPath = resolve(rootDir, 'docs', 'workflow', 'gates.md');
  const files = markdownFiles().filter((p) => p !== canonicalGatesPath);

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (!headingMatch) {
        continue;
      }
      const heading = normalizeHeading(headingMatch[1]);
      if (mandatoryGateHeadings.has(heading)) {
        const display = filePath.replace(`${rootDir}/`, '');
        errors.push(`Mandatory gate heading redefined outside docs/workflow/gates.md: ${display}:${i + 1}`);
      }
    }
  }
}

function checkBrokenWorkflowLinks() {
  const files = markdownFiles();
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const fromDir = dirname(filePath);
    const display = filePath.replace(`${rootDir}/`, '');

    for (const match of content.matchAll(linkRegex)) {
      const rawTarget = match[1].trim();
      if (!rawTarget || rawTarget.startsWith('#')) {
        continue;
      }
      if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('mailto:')) {
        continue;
      }

      const sanitized = rawTarget.split('#')[0].split('?')[0];
      if (!sanitized) {
        continue;
      }

      const workflowTarget = sanitized.includes('docs/workflow/')
        || sanitized.includes('.agents/skills/')
        || sanitized.includes('.github/agents/')
        || sanitized === 'AGENTS.md'
        || sanitized.endsWith('/SKILL.md')
        || sanitized.endsWith('.agent.md');

      if (!workflowTarget) {
        continue;
      }

      if (!sanitized.endsWith('.md') && !sanitized.endsWith('.agent.md') && !sanitized.endsWith('/SKILL.md')) {
        continue;
      }

      const resolved = resolve(fromDir, sanitized);
      if (!existsSync(resolved)) {
        errors.push(`Broken workflow doc link in ${display}: ${rawTarget}`);
      }
    }
  }
}

function validateRequiredFiles() {
  const required = [
    'docs/workflow/gates.md',
    'docs/workflow/handoff-format.md',
    '.agents/skills/README.md',
    '.github/agents/requirements-analyst.agent.md',
    '.github/agents/implementation-engineer.agent.md',
    '.github/agents/security-reviewer.agent.md',
    '.github/agents/code-reviewer.agent.md',
    '.github/agents/quality-validator.agent.md',
    '.github/agents/documentation-writer.agent.md'
  ];

  for (const file of required) {
    const absolute = resolve(rootDir, file);
    if (!existsSync(absolute)) {
      errors.push(`Required workflow file missing: ${file}`);
    }
  }
}

validateRequiredFiles();
compareSkills();
checkGateHeadingRedefinitions();
checkBrokenWorkflowLinks();

if (errors.length > 0) {
  console.error('Workflow docs validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Workflow docs validation passed.');
