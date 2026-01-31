const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};

export function jsonSuccess(c, data = {}, status = 200) {
  return c.json({ success: true, ...data }, status);
}

export function jsonError(c, message, status = 400, extra = undefined) {
  const payload = { error: message };
  if (extra && typeof extra === 'object') {
    Object.assign(payload, extra);
  }
  return c.json(payload, status);
}

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...DEFAULT_HEADERS, ...headers }
  });
}
