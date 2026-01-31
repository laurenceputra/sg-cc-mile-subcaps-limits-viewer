import { DEFAULT_ALLOWED_ORIGINS, SERVICE_NAME, DEVICE_LIMITS, JWT_ALGORITHM, TOKEN_TTL_SECONDS } from './constants.js';
import { getAllowedOrigins, getEnvironment, isProduction } from './env.js';

export {
  DEFAULT_ALLOWED_ORIGINS,
  SERVICE_NAME,
  DEVICE_LIMITS,
  JWT_ALGORITHM,
  TOKEN_TTL_SECONDS,
  getAllowedOrigins,
  getEnvironment,
  isProduction
};
