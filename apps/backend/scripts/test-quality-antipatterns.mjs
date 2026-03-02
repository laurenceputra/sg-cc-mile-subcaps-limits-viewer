import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = {
  NO_IMPL_DETAIL_ASSERT: 'NO_IMPL_DETAIL_ASSERT',
  NO_EXACT_CSP_EQUALITY: 'NO_EXACT_CSP_EQUALITY',
  REQUIRE_SETUP_STATUS_ASSERT: 'REQUIRE_SETUP_STATUS_ASSERT',
  REQUIRE_MIDDLEWARE_NEXT_ASSERT: 'REQUIRE_MIDDLEWARE_NEXT_ASSERT',
  NO_DUPLICATE_SECURITY_SCENARIO: 'NO_DUPLICATE_SECURITY_SCENARIO',
  NO_WEAK_TOKEN_ASSERT: 'NO_WEAK_TOKEN_ASSERT'
};

const VALID_RULES = new Set(Object.values(RULES));
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..');
const testsDir = join(backendRoot, 'src', '__tests__', 'workers');

const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict') || args.has('--phase=strict');

const findings = [];
const waivers = [];

function collectTestFiles() {
  return readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => join(testsDir, name))
    .sort();
}

function parseWaivers(lines, filePath) {
  const byLine = new Map();

  lines.forEach((line, index) => {
    if (!line.includes('test-quality-ignore')) {
      return;
    }

    const lineNumber = index + 1;
    const match = line.match(/test-quality-ignore\s+([A-Z_]+):\s*(.+)\s*$/);
    if (!match) {
      findings.push({
        severity: 'error',
        ruleId: 'INVALID_WAIVER_FORMAT',
        filePath,
        line: lineNumber,
        message: 'waiver must match: // test-quality-ignore <RULE_ID>: <reason>'
      });
      return;
    }

    const [, ruleId, reason] = match;
    if (!VALID_RULES.has(ruleId)) {
      findings.push({
        severity: 'error',
        ruleId: 'INVALID_WAIVER_FORMAT',
        filePath,
        line: lineNumber,
        message: `waiver references unknown rule '${ruleId}'`
      });
      return;
    }

    if (!reason.trim()) {
      findings.push({
        severity: 'error',
        ruleId: 'INVALID_WAIVER_FORMAT',
        filePath,
        line: lineNumber,
        message: 'waiver reason must be non-empty'
      });
      return;
    }

    byLine.set(lineNumber, { ruleId, reason: reason.trim() });
    waivers.push({ filePath, line: lineNumber, ruleId, reason: reason.trim() });
  });

  return byLine;
}

function addFinding({ ruleId, filePath, line, message, severity = 'error', waiversByLine }) {
  const waiver = waiversByLine.get(line);
  if (waiver && waiver.ruleId === ruleId) {
    return;
  }

  findings.push({ severity, ruleId, filePath, line, message });
}

function checkNoImplDetailAssert(lines, filePath, waiversByLine) {
  const suspiciousHtmlLiterals = [
    /html\.includes\([^)]*function\s+\w+/,
    /html\.includes\([^)]*slice\(0\s*,\s*2\)/,
    /html\.includes\([^)]*cardSettings\?\./,
    /html\.includes\([^)]*amount\.textContent\s*=\s*value\.toFixed/,
    /html\.includes\([^)]*moveOthersToEnd\(/,
    /html\.includes\([^)]*getCategoryDisplayOrder\(/
  ];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.includes('html.includes(') && !line.includes('assert.match(html')) {
      return;
    }

    if (suspiciousHtmlLiterals.some((pattern) => pattern.test(line))) {
      addFinding({
        ruleId: RULES.NO_IMPL_DETAIL_ASSERT,
        filePath,
        line: lineNumber,
        message: 'asserts internal rendered implementation detail instead of user-visible contract',
        waiversByLine
      });
    }
  });
}

function checkNoExactCspEquality(lines, filePath, waiversByLine) {
  for (let i = 0; i < lines.length; i += 1) {
    const windowText = lines.slice(i, i + 6).join('\n');
    if (!/assert\.(equal|strictEqual)\s*\(/.test(windowText)) {
      continue;
    }
    if (!/\bcsp\b/i.test(windowText)) {
      continue;
    }
    if (!/(default-src|script-src|connect-src|frame-ancestors|base-uri|form-action)/.test(windowText)) {
      continue;
    }

    addFinding({
      ruleId: RULES.NO_EXACT_CSP_EQUALITY,
      filePath,
      line: i + 1,
      message: 'uses exact CSP equality instead of directive-level checks',
      waiversByLine
    });
  }
}

function checkRequireSetupStatusAssert(lines, filePath, waiversByLine) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('await app.fetch(')) {
      continue;
    }

    const lineNumber = i + 1;
    const assignmentMatch = line.match(/const\s+([A-Za-z0-9_$]+)\s*=\s*await\s+app\.fetch\(/);
    if (!assignmentMatch) {
      addFinding({
        ruleId: RULES.REQUIRE_SETUP_STATUS_ASSERT,
        filePath,
        line: lineNumber,
        message: 'setup request result is ignored; add explicit status assertion',
        waiversByLine
      });
      continue;
    }

    const resultVar = assignmentMatch[1];
    const lookahead = lines.slice(i + 1, i + 16).join('\n');
    const hasStatusAssertion = new RegExp(
      `assert\\.(equal|strictEqual)\\(\\s*${resultVar}\\.status\\s*,|expectStatus\\(\\s*${resultVar}|expectJsonResponse\\(\\s*${resultVar}`
    ).test(lookahead);

    if (!hasStatusAssertion) {
      addFinding({
        ruleId: RULES.REQUIRE_SETUP_STATUS_ASSERT,
        filePath,
        line: lineNumber,
        message: `${resultVar} is fetched without a nearby explicit status assertion`,
        waiversByLine
      });
    }
  }
}

function checkRequireMiddlewareNextAssert(lines, filePath, waiversByLine) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('limitResult: { success: true')) {
      continue;
    }

    const lookahead = lines.slice(i, i + 30).join('\n');
    const assertsNext = /assert\.(equal|ok)\(\s*nextCalled/.test(lookahead) || /next\(\)/.test(lookahead);
    if (!assertsNext) {
      addFinding({
        ruleId: RULES.REQUIRE_MIDDLEWARE_NEXT_ASSERT,
        filePath,
        line: i + 1,
        message: 'middleware success-path test does not prove next() execution',
        waiversByLine
      });
    }
  }
}

function extractTests(lines) {
  const tests = [];

  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(/\btest\(\s*['"`]([^'"`]+)['"`]\s*,\s*async\s*\(\)\s*=>\s*\{/);
    if (!start) {
      continue;
    }

    const title = start[1];
    const startLine = i + 1;
    let braceDepth = 0;
    const blockLines = [];

    for (let j = i; j < lines.length; j += 1) {
      const current = lines[j];
      const openCount = (current.match(/\{/g) || []).length;
      const closeCount = (current.match(/\}/g) || []).length;
      braceDepth += openCount - closeCount;
      blockLines.push(current);
      if (braceDepth === 0 && j > i) {
        i = j;
        break;
      }
    }

    tests.push({ title, startLine, text: blockLines.join('\n') });
  }

  return tests;
}

function checkNoWeakTokenAssert(lines, filePath, waiversByLine) {
  const tests = extractTests(lines);

  for (const testBlock of tests) {
    const hasWeakTokenAssert =
      /assert\.ok\(\s*[A-Za-z0-9_$.]*token\s*\)/.test(testBlock.text)
      || /token\.length\s*>\s*0/.test(testBlock.text)
      || /assert\.equal\(\s*typeof\s+[A-Za-z0-9_$.]*token\s*,\s*['"]string['"]\s*\)/.test(testBlock.text);

    if (!hasWeakTokenAssert) {
      continue;
    }

    const hasJwtShapeAssertion = /expectJwtLike\(|split\(['"`]\.['"`]\).*length\s*===?\s*3/.test(testBlock.text);
    const hasAuthSuccessBehavior = /Authorization['"]?\s*:\s*`Bearer\s*\$\{[^}]+\}`/.test(testBlock.text)
      && /status\s*,\s*200|\.status\s*===?\s*200/.test(testBlock.text);
    const hasAuthFailureBehavior = /Bearer\s*\$\{[^}]+\}\.tampered|Bearer\s*\$\{[^}]+\}\.invalid/.test(testBlock.text)
      || /status\s*,\s*401|\.status\s*===?\s*401/.test(testBlock.text);

    if (!(hasJwtShapeAssertion && hasAuthSuccessBehavior && hasAuthFailureBehavior)) {
      addFinding({
        ruleId: RULES.NO_WEAK_TOKEN_ASSERT,
        filePath,
        line: testBlock.startLine,
        message: `test '${testBlock.title}' has weak token assertions without shape and behavior checks`,
        waiversByLine
      });
    }
  }
}

function classifySecurityScenario(title) {
  const normalized = title.toLowerCase();
  if (!normalized.includes('userscript')) {
    return null;
  }
  if (normalized.includes('origin') && normalized.includes('null')) {
    return 'USERSCRIPT_ORIGIN_NULL';
  }
  if (normalized.includes('non-http') || normalized.includes('extension')) {
    return 'USERSCRIPT_NON_HTTP_ORIGIN';
  }
  if (normalized.includes('unavailable') || normalized.includes('missing origin')) {
    return 'USERSCRIPT_MISSING_ORIGIN';
  }
  return null;
}

function checkDuplicateSecurityScenarios(scenariosByKey) {
  for (const [scenarioKey, entries] of scenariosByKey.entries()) {
    const uniqueFiles = new Set(entries.map((entry) => entry.filePath));
    if (uniqueFiles.size <= 1) {
      continue;
    }

    for (const entry of entries) {
      findings.push({
        severity: strictMode ? 'error' : 'warning',
        ruleId: RULES.NO_DUPLICATE_SECURITY_SCENARIO,
        filePath: entry.filePath,
        line: entry.line,
        message: `${scenarioKey} duplicated across files (${[...uniqueFiles].map((path) => relative(backendRoot, path)).join(', ')})`
      });
    }
  }
}

const scenariosByKey = new Map();

for (const filePath of collectTestFiles()) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const waiversByLine = parseWaivers(lines, filePath);

  checkNoImplDetailAssert(lines, filePath, waiversByLine);
  checkNoExactCspEquality(lines, filePath, waiversByLine);
  checkRequireSetupStatusAssert(lines, filePath, waiversByLine);
  checkRequireMiddlewareNextAssert(lines, filePath, waiversByLine);
  checkNoWeakTokenAssert(lines, filePath, waiversByLine);

  for (const testBlock of extractTests(lines)) {
    const scenarioKey = classifySecurityScenario(testBlock.title);
    if (!scenarioKey) {
      continue;
    }
    if (!scenariosByKey.has(scenarioKey)) {
      scenariosByKey.set(scenarioKey, []);
    }
    scenariosByKey.get(scenarioKey).push({
      filePath,
      line: testBlock.startLine,
      title: testBlock.title
    });
  }
}

checkDuplicateSecurityScenarios(scenariosByKey);

findings.sort((a, b) => {
  const fileCompare = a.filePath.localeCompare(b.filePath);
  if (fileCompare !== 0) return fileCompare;
  return a.line - b.line;
});

console.log(`[test:quality] mode=${strictMode ? 'strict' : 'phase1'}`);

if (waivers.length > 0) {
  console.log('[test:quality] accepted waivers:');
  for (const waiver of waivers) {
    console.log(`  - ${waiver.ruleId} ${relative(backendRoot, waiver.filePath)}:${waiver.line} (${waiver.reason})`);
  }
}

if (findings.length === 0) {
  console.log('[test:quality] PASS (no findings)');
  process.exit(0);
}

let errorCount = 0;
let warningCount = 0;

for (const finding of findings) {
  const rel = relative(backendRoot, finding.filePath);
  const prefix = finding.severity === 'warning' ? 'WARN' : 'ERROR';
  if (finding.severity === 'warning') {
    warningCount += 1;
  } else {
    errorCount += 1;
  }
  console.log(`${prefix} ${finding.ruleId} ${rel}:${finding.line} - ${finding.message}`);
}

console.log(`[test:quality] findings: errors=${errorCount}, warnings=${warningCount}`);
if (errorCount > 0) {
  process.exit(1);
}

console.log('[test:quality] PASS with warnings only');
