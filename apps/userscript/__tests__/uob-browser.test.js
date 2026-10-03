import { it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

function browserPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  if (!existsSync(cache)) return null;
  for (const name of readdirSync(cache).filter((name) => name.startsWith('chromium_headless_shell-'))) {
    for (const arch of ['linux-arm64', 'linux64']) {
      const binary = `${cache}/${name}/chrome-headless-shell-${arch}/chrome-headless-shell`;
      if (existsSync(binary)) return binary;
    }
  }
  return null;
}

const browser = browserPath();
async function runBrowserFixture(fixtureName, host, path, success) {
  const fixture = await readFile(new URL(`./helpers/${fixtureName}`, import.meta.url));
  const source = await readFile(new URL('../bank-cc-limits-subcap-calculator.user.js', import.meta.url));
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(request.url.endsWith('.js') ? source : fixture);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    // DNS is forced to the local fixture server: no request reaches the bank.
    // Real hostname/path gates and the production startup/URL poll are used.
    const url = `http://${host}:${server.address().port}${path}`;
    const { stdout } = await promisify(execFile)(browser, ['--no-sandbox', '--headless', '--disable-gpu', '--no-proxy-server', `--host-resolver-rules=MAP ${host} 127.0.0.1`, '--dump-dom', '--virtual-time-budget=50000', url], { timeout: 60000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    assert.ok(stdout.includes(`<pre id="result">${success}</pre>`), stdout.match(/<pre id="result">[^<]*<\/pre>/)?.[0]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const options = { skip: browser ? false : 'Set CHROMIUM_PATH or provide /ms-playwright browser cache' };
it('UOB SPA lifecycle with real DOM, observers and asynchronous timers', options, async () => {
  await runBrowserFixture('uob-browser.html', 'pib.uob.com.sg', '/auth', 'PASS: UOB SPA observer lifecycle');
});

it('Maybank same-URL rediscovery survives preserved observer teardown', options, async () => {
  await runBrowserFixture('maybank-browser.html', 'cib.maybank2u.com.sg', '/m2u/accounts/cards', 'PASS: Maybank same-URL rediscovery');
});
