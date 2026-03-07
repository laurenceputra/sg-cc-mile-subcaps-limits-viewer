import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAppFetchCall(node) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && node.callee.object?.type === 'Identifier'
    && node.callee.object.name === 'app'
    && node.callee.property?.type === 'Identifier'
    && node.callee.property.name === 'fetch';
}

function getObjectKeyName(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function getLiteralString(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? node.quasis[0]?.value?.raw ?? null;
  }
  return null;
}

function hasExpectedStatusAssertion(text, resultVar, expectedStatus) {
  const escapedVar = escapeRegExp(resultVar);
  const patterns = [
    new RegExp(`assert\\.(equal|strictEqual)\\(\\s*${escapedVar}\\.status\\s*,\\s*${expectedStatus}\\b`),
    new RegExp(`assert\\.(equal|strictEqual)\\(\\s*${expectedStatus}\\s*,\\s*${escapedVar}\\.status\\b`),
    new RegExp(`expectStatus\\(\\s*${escapedVar}\\s*,\\s*${expectedStatus}\\b`),
    new RegExp(`expectJsonResponse\\(\\s*${escapedVar}\\s*,\\s*${expectedStatus}\\b`),
    new RegExp(`${escapedVar}\\.status\\s*===?\\s*${expectedStatus}\\b`)
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function hasAnyStatusAssertion(text, resultVar) {
  const escapedVar = escapeRegExp(resultVar);
  return new RegExp(
    `assert\\.(equal|strictEqual)\\(\\s*${escapedVar}\\.status\\s*,|`
    + `assert\\.(equal|strictEqual)\\(\\s*\\d{3}\\s*,\\s*${escapedVar}\\.status\\b|`
    + `expectStatus\\(\\s*${escapedVar}\\s*,|`
    + `expectJsonResponse\\(\\s*${escapedVar}\\s*,|`
    + `${escapedVar}\\.status\\s*===?\\s*\\d{3}\\b`
  ).test(text);
}

function parseFileAst(content, filePath, waiversByLine) {
  try {
    return parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true
    });
  } catch (error) {
    addFinding({
      ruleId: 'PARSE_ERROR',
      filePath,
      line: error?.loc?.line ?? 1,
      message: `unable to parse test file: ${error.message}`,
      waiversByLine
    });
    return null;
  }
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

function checkRequireSetupStatusAssert(ast, lines, filePath, waiversByLine) {
  ancestor(ast, {
    AwaitExpression(node, ancestors) {
      if (!isAppFetchCall(node.argument)) {
        return;
      }

      const lineNumber = node.loc.start.line;
      const enclosingCall = [...ancestors].reverse().find((ancestorNode) => {
        if (ancestorNode.type !== 'CallExpression') {
          return false;
        }
        return ancestorNode.arguments?.includes(node);
      });

      if (enclosingCall?.callee?.type === 'Identifier') {
        const calleeName = enclosingCall.callee.name;
        if (calleeName === 'expectStatus' || calleeName === 'expectJsonResponse') {
          return;
        }
      }

      const declarator = [...ancestors].reverse().find(
        (ancestorNode) => ancestorNode.type === 'VariableDeclarator' && ancestorNode.init === node
      );
      if (!declarator || declarator.id.type !== 'Identifier') {
        addFinding({
          ruleId: RULES.REQUIRE_SETUP_STATUS_ASSERT,
          filePath,
          line: lineNumber,
          message: 'setup request result is ignored; add explicit status assertion',
          waiversByLine
        });
        return;
      }

      const resultVar = declarator.id.name;
      const lookahead = lines.slice(lineNumber, lineNumber + 15).join('\n');
      if (!hasAnyStatusAssertion(lookahead, resultVar)) {
        addFinding({
          ruleId: RULES.REQUIRE_SETUP_STATUS_ASSERT,
          filePath,
          line: lineNumber,
          message: `${resultVar} is fetched without a nearby explicit status assertion`,
          waiversByLine
        });
      }
    }
  });
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

function extractTests(ast, content) {
  const tests = [];

  ancestor(ast, {
    CallExpression(node) {
      if (node.callee?.type !== 'Identifier' || node.callee.name !== 'test') {
        return;
      }

      const title = getLiteralString(node.arguments[0]);
      const callback = node.arguments[1];
      if (!title || !callback) {
        return;
      }
      if ((callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
        || callback.body.type !== 'BlockStatement') {
        return;
      }

      tests.push({
        title,
        startLine: node.loc.start.line,
        text: content.slice(callback.body.start, callback.body.end),
        body: callback.body,
        sourceText: content
      });
    }
  });

  tests.sort((a, b) => a.startLine - b.startLine);

  return tests;
}

function classifyAuthRequest(node, sourceText) {
  if (!isAppFetchCall(node)) {
    return null;
  }

  const requestArg = node.arguments[0];
  if (!requestArg || requestArg.type !== 'NewExpression') {
    return null;
  }
  if (requestArg.callee?.type !== 'Identifier' || requestArg.callee.name !== 'Request') {
    return null;
  }

  const requestInit = requestArg.arguments[1];
  if (!requestInit || requestInit.type !== 'ObjectExpression') {
    return null;
  }

  const headersProperty = requestInit.properties.find((property) => (
    property.type === 'Property' && getObjectKeyName(property.key) === 'headers'
  ));
  if (!headersProperty || headersProperty.value?.type !== 'ObjectExpression') {
    return null;
  }

  const authProperty = headersProperty.value.properties.find((property) => (
    property.type === 'Property' && getObjectKeyName(property.key) === 'Authorization'
  ));
  if (!authProperty || authProperty.value?.type !== 'TemplateLiteral') {
    return null;
  }

  const authValue = authProperty.value;
  const prefix = authValue.quasis[0]?.value?.cooked ?? authValue.quasis[0]?.value?.raw ?? '';
  if (!prefix.includes('Bearer')) {
    return null;
  }
  if (authValue.expressions.length === 0) {
    return null;
  }

  const tokenExpression = sourceText
    .slice(authValue.expressions[0].start, authValue.expressions[0].end)
    .trim();
  const suffix = authValue.quasis[authValue.quasis.length - 1]?.value?.cooked
    ?? authValue.quasis[authValue.quasis.length - 1]?.value?.raw
    ?? '';

  const looksMutated = /\.\s*(tampered|invalid)\b/.test(suffix) || /\b(tampered|invalid)\b/i.test(tokenExpression);
  return { looksMutated };
}

function extractAuthBehaviorByResponseVar(testBlock) {
  const successVars = new Set();
  const failureVars = new Set();

  ancestor(testBlock.body, {
    CallExpression(node, ancestors) {
      const authRequest = classifyAuthRequest(node, testBlock.sourceText);
      if (!authRequest) {
        return;
      }

      const awaitExpression = [...ancestors].reverse().find(
        (ancestorNode) => ancestorNode.type === 'AwaitExpression' && ancestorNode.argument === node
      );
      if (!awaitExpression) {
        return;
      }
      const declarator = [...ancestors].reverse().find((ancestorNode) => (
        ancestorNode.type === 'VariableDeclarator' && ancestorNode.init === awaitExpression
      ));
      if (!declarator || declarator.id.type !== 'Identifier') {
        return;
      }

      if (authRequest.looksMutated) {
        failureVars.add(declarator.id.name);
      } else {
        successVars.add(declarator.id.name);
      }
    }
  });

  return { successVars, failureVars };
}

function checkNoWeakTokenAssert(tests, filePath, waiversByLine) {

  for (const testBlock of tests) {
    const hasWeakTokenAssert =
      /assert\.ok\(\s*[A-Za-z0-9_$.]*token\s*\)/.test(testBlock.text)
      || /token\.length\s*>\s*0/.test(testBlock.text)
      || /assert\.equal\(\s*typeof\s+[A-Za-z0-9_$.]*token\s*,\s*['"]string['"]\s*\)/.test(testBlock.text);

    if (!hasWeakTokenAssert) {
      continue;
    }

    const hasJwtShapeAssertion = /expectJwtLike\(|split\(['"`]\.['"`]\).*length\s*===?\s*3/.test(testBlock.text);
    const { successVars, failureVars } = extractAuthBehaviorByResponseVar(testBlock);
    const hasAuthSuccessBehavior = [...successVars].some((responseVar) => hasExpectedStatusAssertion(testBlock.text, responseVar, 200));
    const hasAuthFailureBehavior = [...failureVars].some((responseVar) => hasExpectedStatusAssertion(testBlock.text, responseVar, 401));

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
  const ast = parseFileAst(content, filePath, waiversByLine);

  if (!ast) {
    continue;
  }

  const tests = extractTests(ast, content);

  checkNoImplDetailAssert(lines, filePath, waiversByLine);
  checkNoExactCspEquality(lines, filePath, waiversByLine);
  checkRequireSetupStatusAssert(ast, lines, filePath, waiversByLine);
  checkRequireMiddlewareNextAssert(lines, filePath, waiversByLine);
  checkNoWeakTokenAssert(tests, filePath, waiversByLine);

  for (const testBlock of tests) {
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
