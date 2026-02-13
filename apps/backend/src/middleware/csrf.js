/**
 * CSRF Protection Middleware
 * 
 * Implements Cross-Site Request Forgery protection through:
 * 1. Origin header validation
 * 2. Referer header validation (fallback)
 * 3. Custom token validation (for browsers that don't send Origin)
 * 
 * This prevents attackers from submitting unauthorized requests
 * from malicious websites.
 */

/**
 * Configuration for allowed origins
 * 
 * In production, this should be loaded from environment variables
 * or a configuration file.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://pib.uob.com.sg',
  'https://cib.maybank2u.com.sg',
  // Add self-hosted domain when available
  // 'https://your-domain.com',
];

/**
 * Parse origin from URL string
 */
function normalizeAuthoritativeOrigin(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function parseOrigin(url) {
  return normalizeAuthoritativeOrigin(url);
}

/**
 * Check if origin is allowed
 * 
 * Supports:
 * - Exact matches
 * - Wildcard subdomains (*.example.com)
 * - Development environments (localhost, 127.0.0.1)
 */
function isOriginAllowed(origin, allowedOrigins, isDevelopment = false) {
  if (!origin) return false;
  
  // Development mode: allow localhost and 127.0.0.1
  if (isDevelopment) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || 
          url.hostname === '127.0.0.1' ||
          url.hostname.endsWith('.localhost')) {
        return true;
      }
    } catch {
      // Invalid URL, continue to other checks
    }
  }
  
  // Check against allowed origins
  for (const allowed of allowedOrigins) {
    // Exact match
    if (origin === allowed) {
      return true;
    }
    
    // Wildcard subdomain match (*.example.com)
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) {
        return true;
      }
    }
    
    // Allow any subdomain if allowed origin starts with .
    if (allowed.startsWith('.')) {
      if (origin.endsWith(allowed) || origin === allowed.substring(1)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * CSRF Protection Middleware
 * 
 * Validates Origin and Referer headers for state-changing requests.
 * 
 * Options:
 * - allowedOrigins: Array of allowed origin strings
 * - requireOrigin: If true, rejects requests without Origin header (default: false)
 * - methods: Array of HTTP methods to protect (default: POST, PUT, PATCH, DELETE)
 * - isDevelopment: Enable development mode (allows localhost)
 */
export function csrfProtection(options = {}) {
  const {
    allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
    requireOrigin = false,
    methods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    isDevelopment = false,
    trustedNoOriginHeaderName = '',
    trustedNoOriginHeaderValue = ''
  } = options;

  const hasTrustedNoOriginBypass = (c) => {
    // Bypass is only allowed when both a trusted header name and a non-empty
    // expected value are configured, and the request's header value matches.
    if (!trustedNoOriginHeaderName || !trustedNoOriginHeaderValue) {
      return false;
    }
    const headerValue = c.req.header(trustedNoOriginHeaderName);
    if (typeof headerValue !== 'string' || !headerValue) {
      return false;
    }
    return headerValue === trustedNoOriginHeaderValue;
  };
  
  return async (c, next) => {
    const method = c.req.method;
    
    // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
    if (!methods.includes(method)) {
      return next();
    }
    
    // Get Origin header (most reliable)
    const origin = c.req.header('Origin');

    // Get Referer header (fallback for older browsers)
    const referer = c.req.header('Referer');

    // Origin-like values such as "null", extension schemes, and malformed strings are non-authoritative.
    // For those cases we fall back to Referer parsing, then strict no-origin handling.
    const requestOrigin = normalizeAuthoritativeOrigin(origin) || parseOrigin(referer);
    
    // If no origin/referer is provided
    if (!requestOrigin) {
      // In strict mode, reject requests without origin
      if (requireOrigin) {
        if (hasTrustedNoOriginBypass(c)) {
          return next();
        }
        console.warn('[CSRF] Request rejected: No Origin or Referer header');
        return c.json({ 
          error: 'Forbidden',
          message: 'CSRF validation failed: Origin header required'
        }, 403);
      }
      
      // In permissive mode, log warning but allow
      console.warn('[CSRF] Warning: Request without Origin/Referer header');
      return next();
    }
    
    // Validate origin
    if (!isOriginAllowed(requestOrigin, allowedOrigins, isDevelopment)) {
      console.warn(`[CSRF] Request rejected: Invalid origin: ${requestOrigin}`);
      return c.json({ 
        error: 'Forbidden',
        message: 'CSRF validation failed: Invalid origin'
      }, 403);
    }
    
    // Origin is valid, proceed
    return next();
  };
}

/**
 * Configure CORS middleware with CSRF-aware settings
 * 
 * This ensures CORS and CSRF protections work together properly.
 * 
 * Usage:
 *   app.use('/*', configureCors({
 *     allowedOrigins: ['https://pib.uob.com.sg'],
 *     isDevelopment: false
 *   }))
 */
export function configureCors(options = {}) {
  const {
    allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
    isDevelopment = false,
    allowCredentials = true
  } = options;
  
  return async (c, next) => {
    const requestOrigin = c.req.header('Origin');
    
    // Determine if origin is allowed
    let allowedOrigin = null;
    
    if (requestOrigin && isOriginAllowed(requestOrigin, allowedOrigins, isDevelopment)) {
      allowedOrigin = requestOrigin;
    } else if (isDevelopment && requestOrigin) {
      // In development, allow the requesting origin (for easier testing)
      allowedOrigin = requestOrigin;
    }
    
    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      
      if (allowCredentials) {
        c.header('Access-Control-Allow-Credentials', 'true');
      }
      
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CC-Userscript');
      c.header('Access-Control-Max-Age', '86400'); // 24 hours
    }
    
    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }
    
    return next();
  };
}

/**
 * Get CSRF configuration documentation
 */
export function getCSRFDocumentation() {
  return {
    description: 'CSRF Protection Configuration',
    protection_methods: [
      'Origin header validation',
      'Referer header validation (fallback)',
      'Allowed origins whitelist'
    ],
    default_allowed_origins: DEFAULT_ALLOWED_ORIGINS,
    configuration: {
      allowedOrigins: 'Array of allowed origin URLs',
      requireOrigin: 'Reject requests without Origin header (strict mode)',
      methods: 'HTTP methods to protect (default: POST, PUT, PATCH, DELETE)',
      isDevelopment: 'Enable localhost/127.0.0.1 for testing',
      trustedNoOriginHeaderName: 'Optional header name that can bypass strict no-origin rejection',
      trustedNoOriginHeaderValue: 'Required header value for trusted no-origin bypass'
    },
    usage_example: {
      production: {
        allowedOrigins: ['https://pib.uob.com.sg', 'https://your-domain.com'],
        requireOrigin: true,
        isDevelopment: false
      },
      development: {
        allowedOrigins: ['http://localhost:3000'],
        requireOrigin: false,
        isDevelopment: true
      }
    },
    cors_integration: 'Use configureCors() instead of generic cors() for proper CSRF integration',
    security_notes: [
      'Always use HTTPS in production',
      'Origin header is more reliable than Referer',
      'Consider enabling requireOrigin in production for maximum security',
      'Whitelist only necessary origins',
      'Monitor logs for rejected requests to detect attacks'
    ]
  };
}

/**
 * Validate that environment is properly configured for CSRF protection
 */
export function validateCSRFConfig(env = {}) {
  const warnings = [];
  const errors = [];
  
  // Check if allowed origins are configured
  if (!env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS === '') {
    warnings.push('ALLOWED_ORIGINS not configured, using defaults');
  }
  
  // Check if running in production
  if (env.ENVIRONMENT === 'production' || env.NODE_ENV === 'production') {
    // Production-specific checks
    if (!env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS.includes('*')) {
      errors.push('Production environment must have explicit ALLOWED_ORIGINS (no wildcards)');
    }
    
    // Check for HTTPS
    const origins = (env.ALLOWED_ORIGINS || '').split(',');
    for (const origin of origins) {
      if (origin && !origin.startsWith('https://')) {
        warnings.push(`Origin ${origin} does not use HTTPS`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
