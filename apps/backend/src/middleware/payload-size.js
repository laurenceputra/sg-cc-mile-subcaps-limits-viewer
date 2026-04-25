import { rateLimitConfig } from './rate-limit-config.js';

export function payloadTooLargeResponse(c) {
  return c.json({
    error: rateLimitConfig.payloadSizeLimit.errorMessage,
    maxSize: `${rateLimitConfig.payloadSizeLimit.maxBytes / 1024 / 1024}MB`
  }, 413);
}

export async function readRequestBodyWithLimit(request, maxBytes = rateLimitConfig.payloadSizeLimit.maxBytes) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > maxBytes) {
      return { tooLarge: true, text: '' };
    }
  }

  if (!request.body) {
    return { tooLarge: false, text: '' };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        return { tooLarge: false, text };
      }
      total += value?.byteLength || 0;
      if (total > maxBytes) {
        await reader.cancel();
        return { tooLarge: true, text: '' };
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function isPayloadTooLarge(request, maxBytes = rateLimitConfig.payloadSizeLimit.maxBytes) {
  const result = await readRequestBodyWithLimit(request, maxBytes);
  return result.tooLarge;
}

export function payloadSizeLimitMiddleware() {
  return async (c, next) => {
    const result = await readRequestBodyWithLimit(c.req.raw);
    if (result.tooLarge) {
      return payloadTooLargeResponse(c);
    }
    c.set('rawBodyText', result.text);

    await next();
  };
}
