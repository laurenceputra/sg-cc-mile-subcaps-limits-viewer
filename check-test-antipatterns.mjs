import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();

const checks = [
  {
    name: 'Listener callback execution during registration',
    regex: /addEventListener\s*:\s*\([^)]*\)\s*=>\s*\{[^}]*\bfn\(/gms,
    scope: (filePath) => filePath.includes('apps/userscript/__tests__/')
  },
  {
    name: 'Synchronous timer shortcut stub',
    regex: /setTimeout\s*:\s*\([^)]*\)\s*=>\s*(\{[^}]*\bfn\(|\bfn\()/gms,
    scope: (filePath) => filePath.includes('apps/userscript/__tests__/')
  },
  {
    name: 'Direct API helper import in worker integration test',
    regex: /from\s+['"]\.\.\/\.\.\/api\/(sync|admin|user)\.js['"]/g,
    scope: (filePath) => filePath.includes('apps/backend/src/__tests__/workers/')
  }
];

const searchRoots = [
  join(rootDir, 'apps', 'userscript', '__tests__'),
  join(rootDir, 'apps', 'backend', 'src', '__tests__', 'workers')
];

function collectFiles(dirPath, files = []) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const absolutePath = join(dirPath, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      collectFiles(absolutePath, files);
      continue;
    }
    if (absolutePath.endsWith('.js') || absolutePath.endsWith('.mjs')) {
      files.push(absolutePath);
    }
  }
  return files;
}

function indexToLine(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

const allFiles = searchRoots.flatMap((dirPath) => collectFiles(dirPath, []));
const findings = [];

for (const absolutePath of allFiles) {
  const displayPath = relative(rootDir, absolutePath);
  const content = readFileSync(absolutePath, 'utf8');

  for (const check of checks) {
    if (!check.scope(displayPath)) {
      continue;
    }
    check.regex.lastIndex = 0;
    const match = check.regex.exec(content);
    if (!match) {
      continue;
    }
    findings.push({
      check: check.name,
      filePath: displayPath,
      line: indexToLine(content, match.index)
    });
  }
}

if (findings.length > 0) {
  console.error('Test anti-pattern check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.check}: ${finding.filePath}:${finding.line}`);
  }
  process.exit(1);
}

console.log('No known test anti-patterns detected.');
