/**
 * Security Headers Middleware
 * 
 * Adds security-related HTTP headers to protect against common attacks:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME sniffing
 * - Man-in-the-middle attacks (HTTPS enforcement)
 * - Content injection
 */

/**
 * Apply security headers to response
 * 
 * @param {object} options - Configuration options
 * @param {boolean} [options.strictTransportSecurity=true] - Enable HSTS
 * @param {boolean} [options.contentSecurityPolicy=true] - Enable CSP
 */
export function securityHeadersMiddleware(options = {}) {
  const {
    strictTransportSecurity = true,
    contentSecurityPolicy = true
  } = options;
  
  return async (c, next) => {
    await next();
    
    // Prevent MIME type sniffing
    // Forces browser to respect declared Content-Type
    c.header('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking attacks
    // Disallows page from being embedded in iframe/frame/embed
    c.header('X-Frame-Options', 'DENY');
    
    // XSS Protection (legacy browsers)
    // Modern browsers use CSP instead, but this adds defense in depth
    c.header('X-XSS-Protection', '1; mode=block');
    
    // Strict Transport Security (HSTS)
    // Forces HTTPS for 1 year, including subdomains
    if (strictTransportSecurity) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Content Security Policy
    // Restricts resource loading to prevent XSS and data injection
    const hasCustomCsp = Boolean(c.res?.headers?.get('Content-Security-Policy'));
    if (contentSecurityPolicy && !hasCustomCsp) {
      // API-specific CSP: no scripts, styles, or external resources
      // Only allows connecting back to same origin
      const cspDirectives = [
        "default-src 'none'",           // Deny all by default
        "connect-src 'self'",           // Allow API calls to same origin
        "frame-ancestors 'none'",       // Prevent framing (redundant with X-Frame-Options)
        "base-uri 'self'",              // Prevent base tag injection
        "form-action 'self'"            // Prevent form submission to external sites
      ];
      c.header('Content-Security-Policy', cspDirectives.join('; '));
    }
    
    // Referrer Policy
    // Don't leak referrer information to external sites
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy (formerly Feature-Policy)
    // Disable unnecessary browser features
    c.header('Permissions-Policy', 
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
  };
}

/**
 * Get security headers configuration for documentation
 */
export function getSecurityHeadersInfo() {
  return {
    'X-Content-Type-Options': {
      value: 'nosniff',
      purpose: 'Prevents MIME type sniffing attacks',
      protection: 'Ensures browser respects declared Content-Type'
    },
    'X-Frame-Options': {
      value: 'DENY',
      purpose: 'Prevents clickjacking attacks',
      protection: 'Disallows embedding in iframes'
    },
    'X-XSS-Protection': {
      value: '1; mode=block',
      purpose: 'Legacy XSS protection for older browsers',
      protection: 'Blocks pages when XSS detected'
    },
    'Strict-Transport-Security': {
      value: 'max-age=31536000; includeSubDomains',
      purpose: 'Enforces HTTPS connections',
      protection: 'Prevents man-in-the-middle attacks for 1 year'
    },
    'Content-Security-Policy': {
      value: "default-src 'none'; connect-src 'self'; ...",
      purpose: 'Prevents content injection attacks',
      protection: 'Restricts resource loading to prevent XSS'
    },
    'Referrer-Policy': {
      value: 'strict-origin-when-cross-origin',
      purpose: 'Controls referrer information leakage',
      protection: 'Limits referrer data sent to external sites'
    },
    'Permissions-Policy': {
      value: 'geolocation=(), microphone=(), camera=(), ...',
      purpose: 'Disables unnecessary browser APIs',
      protection: 'Reduces attack surface'
    }
  };
}
