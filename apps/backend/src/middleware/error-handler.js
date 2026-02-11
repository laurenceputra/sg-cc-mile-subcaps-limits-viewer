import { logger } from '../utils/logger.js';
import { jsonError } from '../utils/response.js';

export function errorHandler(error, c) {
  logger.error('Unhandled error', {
    path: c.req?.path,
    method: c.req?.method,
    message: error?.message
  });
  return jsonError(c, 'Internal server error', 500);
}
