export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function buildCsp(nonce) {
  const cspDirectives = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  return cspDirectives.join('; ');
}

export function renderPage({ title, body, script, nonce, styles }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${styles}</style>
  </head>
  <body>
    ${body}
    <script nonce="${nonce}">
      ${script}
    </script>
  </body>
</html>`;
}

export function htmlResponse(c, html, nonce) {
  return c.text(html, 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': buildCsp(nonce)
  });
}
