/**
 * Jest Setup
 * Global test configuration and utilities
 */

import { resetNodeLimiters } from '../middleware/rate-limiter.js';

afterEach(() => {
  resetNodeLimiters();
});
