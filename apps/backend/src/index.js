import { createApp } from './app.js';
import * as rateLimiters from './middleware/rate-limiter.js';

const app = createApp(rateLimiters);

export default app;
