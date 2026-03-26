import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SECTION_ORDER = [
  { key: 'features', title: 'Features', types: ['feat'] },
  { key: 'fixes', title: 'Fixes', types: ['fix', 'revert'] },
  { key: 'documentation', title: 'Documentation', types: ['docs'] },
  { key: 'performance', title: 'Performance', types: ['perf'] },
  { key: 'refactors', title: 'Refactors', types: ['refactor'] },
  { key: 'tests', title: 'Tests', types: ['test'] },
  { key: 'maintenance', title: 'Maintenance', types: ['build', 'chore', 'ci', 'style'] },
  { key: 'other', title: 'Other Changes', types: [] }
];

const SECTION_BY_TYPE = new Map(
  SECTION_ORDER.flatMap((section) => section.types.map((type) => [type, section]))
);

const USAGE = [
  'Usage: node scripts/draft-release-notes.mjs --from <ref> [--to <ref>]',
  '',
  'Options:',
  '  --from <ref>   Required starting git ref/commit (exclusive)',
  '  --to <ref>     Optional ending git ref/commit (inclusive, default: HEAD)',
  '  --help         Show this help message'
].join('\n');

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function parseCliArgs(argv) {
  const options = { to: 'HEAD' };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help') {
      return { help: true };
    }

    if (token === '--from' || token === '--to') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${token}`);
      }
      options[token.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.from) {
    throw new Error('--from is required');
  }

  return options;
}

export function parseCommitHeader(subject) {
  const trimmed = subject.trim();
  const match = trimmed.match(/^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<description>.+)$/i);
  if (!match?.groups) {
    return null;
  }

  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope ?? null,
    breaking: Boolean(match.groups.breaking),
    description: match.groups.description.trim()
  };
}

export function classifyCommit(commit) {
  const parsedHeader = parseCommitHeader(commit.subject);
  const section = parsedHeader ? (SECTION_BY_TYPE.get(parsedHeader.type) ?? SECTION_ORDER.at(-1)) : SECTION_ORDER.at(-1);
  const hasBreakingChange = Boolean(parsedHeader?.breaking) || /(^|\n)BREAKING CHANGE:/i.test(commit.body ?? '');
  const metadata = [];

  if (parsedHeader?.scope) {
    metadata.push(parsedHeader.scope);
  }

  if (hasBreakingChange) {
    metadata.push('breaking');
  }

  return {
    ...commit,
    sectionKey: section.key,
    sectionTitle: section.title,
    parsedHeader,
    title: parsedHeader?.description ?? commit.subject.trim(),
    metadata
  };
}

export function groupCommitsBySection(commits) {
  const grouped = SECTION_ORDER.map((section) => ({ ...section, items: [] }));
  const byKey = new Map(grouped.map((section) => [section.key, section]));

  for (const commit of commits) {
    const classified = classifyCommit(commit);
    byKey.get(classified.sectionKey).items.push(classified);
  }

  return grouped.filter((section) => section.items.length > 0);
}

export function summarizeFiles(files, limit = 3) {
  const normalized = files.filter(Boolean);
  if (normalized.length === 0) {
    return '';
  }

  const visible = normalized.slice(0, limit).map((filePath) => `\`${filePath}\``).join(', ');
  const remaining = normalized.length - Math.min(normalized.length, limit);
  return remaining > 0 ? `${visible} +${remaining} more` : visible;
}

export function renderReleaseNotes({ fromRef, toRef = 'HEAD', commits }) {
  const groupedSections = groupCommitsBySection(commits);
  const uniqueFiles = [...new Set(commits.flatMap((commit) => commit.files ?? []))];
  const lines = [
    '# Release Notes Draft',
    '',
    `Range: \`${fromRef}..${toRef}\``,
    '',
    'Summary:',
    `- ${pluralize(commits.length, 'commit')} across ${pluralize(uniqueFiles.length, 'file')}`
  ];

  for (const section of groupedSections) {
    lines.push(`- ${section.title}: ${section.items.length}`);
  }

  lines.push('');

  if (commits.length === 0) {
    lines.push('_No commits found in this range._');
    return `${lines.join('\n')}\n`;
  }

  for (const section of groupedSections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const commit of section.items) {
      const metadata = commit.metadata.length > 0 ? ` _${commit.metadata.join(', ')}_` : '';
      lines.push(`- ${commit.title} (\`${commit.shortSha}\`)${metadata}`);
      if ((commit.files ?? []).length > 0) {
        lines.push(`  - Files: ${summarizeFiles(commit.files)}`);
      }
    }

    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function runGit(args, { cwd = process.cwd(), execFileSyncImpl = execFileSync } = {}) {
  try {
    return execFileSyncImpl('git', args, {
      cwd,
      encoding: 'utf8'
    }).trimEnd();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || error.message);
  }
}

export function collectCommitsBetweenRefs({ fromRef, toRef = 'HEAD', cwd = process.cwd(), execFileSyncImpl = execFileSync }) {
  const range = `${fromRef}..${toRef}`;
  const revListOutput = runGit(['rev-list', '--reverse', range], { cwd, execFileSyncImpl });
  const shas = revListOutput ? revListOutput.split('\n').filter(Boolean) : [];

  return shas.map((sha) => {
    const subject = runGit(['show', '-s', '--format=%s', sha], { cwd, execFileSyncImpl });
    const body = runGit(['show', '-s', '--format=%b', sha], { cwd, execFileSyncImpl });
    const filesOutput = runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--root', sha], {
      cwd,
      execFileSyncImpl
    });
    const files = [...new Set(filesOutput.split('\n').map((value) => value.trim()).filter(Boolean))];

    return {
      sha,
      shortSha: sha.slice(0, 7),
      subject,
      body,
      files
    };
  });
}

export function draftReleaseNotes({ fromRef, toRef = 'HEAD', cwd = process.cwd(), execFileSyncImpl = execFileSync }) {
  const commits = collectCommitsBetweenRefs({ fromRef, toRef, cwd, execFileSyncImpl });
  return renderReleaseNotes({ fromRef, toRef, commits });
}

function isEntrypoint() {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }

    process.stdout.write(draftReleaseNotes({ fromRef: options.from, toRef: options.to }));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    process.exit(1);
  }
}
