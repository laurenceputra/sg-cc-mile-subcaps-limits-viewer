/**
 * Input Validation Middleware
 * 
 * Provides comprehensive validation for all user inputs to prevent:
 * - Injection attacks (XSS, SQL injection via control characters)
 * - DoS attacks (oversized inputs)
 * - Data integrity issues
 */

import { rateLimitConfig } from './rate-limit-config.js';

// RFC 5321 compliant email regex (simplified but practical)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'trashmail.com', 'temp-mail.org', 'fakeinbox.com'
];

/**
 * Normalize email address (lowercase, trim)
 */
export function normalizeEmail(email) {
  if (typeof email !== 'string') return email;
  return email.trim().toLowerCase();
}

/**
 * Check if email is from disposable domain
 */
export function isDisposableEmail(email) {
  if (typeof email !== 'string') return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

// Control characters (U+0000 to U+001F, U+007F)
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;
// Reject angle brackets to prevent HTML/script injection in text fields
const HTML_TAG_REGEX = /[<>]/;

// Allowed categories (extend this list as needed)
const ALLOWED_CATEGORIES = [
  'dining',
  'groceries',
  'transport',
  'entertainment',
  'shopping',
  'travel',
  'utilities',
  'healthcare',
  'education',
  'others',
  'general',
  'fuel',
  'online',
  'contactless',
  'excluded',
  'unknown'
];

// Allowed tiers
const ALLOWED_TIERS = ['free', 'paid'];

/**
 * Validation schema definitions
 */
export const schemas = {
  email: {
    maxLength: 254,
    validate: (value) => {
      if (typeof value !== 'string') return 'Email must be a string';
      
      // Normalize email
      const normalized = normalizeEmail(value);
      
      if (normalized.length === 0) return 'Email cannot be empty';
      if (normalized.length > 254) return 'Email exceeds maximum length (254 characters)';
      if (!EMAIL_REGEX.test(normalized)) return 'Invalid email format';
      if (CONTROL_CHARS_REGEX.test(normalized)) return 'Email contains invalid control characters';
      
      // Optional: Check for disposable email (can be disabled if needed)
      if (isDisposableEmail(normalized)) {
        return 'Disposable email addresses are not allowed';
      }
      
      return null;
    },
    normalize: (value) => normalizeEmail(value)
  },
  
  passwordHash: {
    maxLength: 1024,
    validate: (value) => {
      if (typeof value !== 'string') return 'Password hash must be a string';
      if (value.length === 0) return 'Password hash cannot be empty';
      if (value.length > 1024) return 'Password hash exceeds maximum length';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Password hash contains invalid characters';
      // Should be hex or base64 format - basic check
      if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return 'Invalid password hash format';
      return null;
    }
  },
  
  merchantName: {
    maxLength: 200,
    validate: (value) => {
      if (typeof value !== 'string') return 'Merchant name must be a string';
      if (value.length === 0) return 'Merchant name cannot be empty';
      if (value.length > 200) return 'Merchant name exceeds maximum length (200 characters)';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Merchant name contains invalid control characters';
      if (HTML_TAG_REGEX.test(value)) return 'Merchant name contains invalid characters';
      return null;
    }
  },
  
  category: {
    maxLength: 100,
    validate: (value) => {
      if (typeof value !== 'string') return 'Category must be a string';
      if (value.length === 0) return 'Category cannot be empty';
      if (value.length > 100) return 'Category exceeds maximum length (100 characters)';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Category contains invalid control characters';
      if (!ALLOWED_CATEGORIES.includes(value.toLowerCase())) {
        return `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`;
      }
      return null;
    }
  },
  
  deviceName: {
    maxLength: 100,
    validate: (value) => {
      if (typeof value !== 'string') return 'Device name must be a string';
      if (value.length === 0) return 'Device name cannot be empty';
      if (value.length > 100) return 'Device name exceeds maximum length (100 characters)';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Device name contains invalid control characters';
      return null;
    }
  },
  
  deviceId: {
    maxLength: 128,
    validate: (value) => {
      if (typeof value !== 'string') return 'Device ID must be a string';
      if (value.length === 0) return 'Device ID cannot be empty';
      if (value.length > 128) return 'Device ID exceeds maximum length (128 characters)';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Device ID contains invalid control characters';
      // Device IDs should be alphanumeric with hyphens/underscores
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return 'Invalid device ID format';
      return null;
    }
  },
  
  cardType: {
    maxLength: 100,
    validate: (value) => {
      if (typeof value !== 'string') return 'Card type must be a string';
      if (value.length === 0) return 'Card type cannot be empty';
      if (value.length > 100) return 'Card type exceeds maximum length (100 characters)';
      if (CONTROL_CHARS_REGEX.test(value)) return 'Card type contains invalid control characters';
      return null;
    }
  },
  
  tier: {
    validate: (value) => {
      if (typeof value !== 'string') return 'Tier must be a string';
      if (!ALLOWED_TIERS.includes(value)) return `Tier must be one of: ${ALLOWED_TIERS.join(', ')}`;
      return null;
    }
  },
  
  version: {
    validate: (value) => {
      if (typeof value !== 'number') return 'Version must be a number';
      if (!Number.isInteger(value)) return 'Version must be an integer';
      if (value < 0) return 'Version must be non-negative';
      if (value > Number.MAX_SAFE_INTEGER) return 'Version exceeds maximum safe integer';
      return null;
    }
  },
  
  boolean: {
    validate: (value) => {
      if (typeof value !== 'boolean') return 'Value must be a boolean';
      return null;
    }
  },
  
  encryptedData: {
    maxSize: 1024 * 1024, // 1MB (already enforced by rate limiter, but double-check)
    validate: (value) => {
      if (typeof value !== 'object' || value === null) return 'Encrypted data must be an object';
      
      // Validate required structure
      if (!value.iv || typeof value.iv !== 'string') return 'Encrypted data must contain valid iv';
      if (!value.ciphertext || typeof value.ciphertext !== 'string') return 'Encrypted data must contain valid ciphertext';
      if (value.tag && typeof value.tag !== 'string') return 'Encrypted data tag must be a string';
      
      // Check for control characters in string fields
      if (CONTROL_CHARS_REGEX.test(value.iv)) return 'IV contains invalid control characters';
      if (CONTROL_CHARS_REGEX.test(value.ciphertext)) return 'Ciphertext contains invalid control characters';
      if (value.tag && CONTROL_CHARS_REGEX.test(value.tag)) return 'Tag contains invalid control characters';
      
      // Check size (stringified JSON)
      const jsonStr = JSON.stringify(value);
      if (jsonStr.length > 1024 * 1024) return 'Encrypted data exceeds maximum size (1MB)';
      
      return null;
    }
  },
  
  mappingsArray: {
    maxItems: 100,
    validate: (value) => {
      if (!Array.isArray(value)) return 'Mappings must be an array';
      if (value.length === 0) return 'Mappings array cannot be empty';
      if (value.length > 100) return 'Mappings array exceeds maximum size (100 items)';
      
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item !== 'object' || item === null) {
          return `Mapping item ${i} must be an object`;
        }
        
        // Validate merchant field (support merchant, merchantRaw, merchantNormalized)
        const merchantValue = item.merchant ?? item.merchantRaw ?? item.merchantNormalized;
        if (merchantValue !== undefined) {
          const merchantError = schemas.merchantName.validate(merchantValue);
          if (merchantError) return `Mapping item ${i}: ${merchantError}`;
        }
        if (merchantValue === undefined) {
          return `Mapping item ${i}: Merchant name must be a string`;
        }
        
        // Validate category field
        if (item.category !== undefined) {
          const categoryError = schemas.category.validate(item.category);
          if (categoryError) return `Mapping item ${i}: ${categoryError}`;
        }
        
        // Validate cardType field
        if (item.cardType !== undefined) {
          const cardTypeError = schemas.cardType.validate(item.cardType);
          if (cardTypeError) return `Mapping item ${i}: ${cardTypeError}`;
        }
      }
      
      return null;
    }
  }
};

/**
 * Sanitize string by removing control characters and trimming
 */
export function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return str;
  
  // Remove control characters
  let sanitized = str.replace(CONTROL_CHARS_REGEX, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate input against a schema
 */
export function validateInput(value, schemaName) {
  const schema = schemas[schemaName];
  if (!schema) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  
  return schema.validate(value);
}

/**
 * Middleware to validate JSON payload structure
 * 
 * This middleware should run before any endpoint-specific validation.
 * It ensures:
 * 1. Content-Type is application/json for POST/PUT/PATCH
 * 2. Request body is valid JSON
 * 3. Body is not excessively nested (DoS prevention)
 */
export function validateJsonMiddleware() {
  return async (c, next) => {
    const method = c.req.method;
    
    // Only validate JSON for methods that should send JSON
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next();
    }

    const contentType = c.req.header('Content-Type');
    
    // Allow empty POST/DELETE bodies without content-type
    if ((method === 'DELETE' || method === 'POST') && !contentType) {
      return next();
    }

    // Require application/json content type
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      return c.json({ 
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/json' 
      }, 415);
    }
    
    // Try to parse JSON
    try {
      const contentLength = c.req.header('Content-Length');
      if (contentType && contentLength && parseInt(contentLength, 10) > rateLimitConfig.payloadSizeLimit.maxBytes) {
        return c.json({ 
          error: rateLimitConfig.payloadSizeLimit.errorMessage,
          maxSize: `${rateLimitConfig.payloadSizeLimit.maxBytes / 1024 / 1024}MB`
        }, 413);
      }
      if (method === 'DELETE' && (!contentType || c.req.header('Content-Length') === '0')) {
        return next();
      }

      const body = await c.req.json();
      
      // Check for excessive nesting (DoS prevention)
      const maxDepth = 10;
      const checkDepth = (obj, depth = 0) => {
        if (depth > maxDepth) {
          throw new Error('JSON nesting too deep');
        }
        
        if (typeof obj === 'object' && obj !== null) {
          for (const key in obj) {
            checkDepth(obj[key], depth + 1);
          }
        }
      };
      
      checkDepth(body);
      
      // Store parsed body for later use
      c.set('validatedBody', body);
      
    } catch (error) {
      return c.json({ 
        error: 'Invalid JSON',
        message: error.message === 'JSON nesting too deep' 
          ? 'JSON structure is too deeply nested' 
          : 'Request body must be valid JSON'
      }, 400);
    }
    
    return next();
  };
}

/**
 * Create a validation middleware for specific fields
 * 
 * Usage:
 *   app.post('/endpoint', validateFields({
 *     email: 'email',
 *     name: 'deviceName'
 *   }), handler)
 */
export function validateFields(fieldSchemas) {
  return async (c, next) => {
    const body = c.get('validatedBody') || await c.req.json().catch(() => ({}));
    const errors = {};
    
    for (const [fieldName, schemaName] of Object.entries(fieldSchemas)) {
      const value = body[fieldName];
      
      // Check if field is required (assume all fields in schema are required)
      if (value === undefined || value === null) {
        errors[fieldName] = `${fieldName} is required`;
        continue;
      }
      
      // Validate against schema
       const error = validateInput(value, schemaName);
       if (error) {
         errors[fieldName] = error;
       }
    }
    
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      const message = typeof firstError === 'string' ? firstError : 'Validation failed';
      const status = message.includes('maximum size') ? 413 : 400;
      return c.json({ 
        error: message,
        details: errors 
      }, status);
    }
    
    return next();
  };
}

/**
 * Create a validation middleware for optional fields
 * 
 * Usage:
 *   app.post('/endpoint', validateOptionalFields({
 *     tier: 'tier'
 *   }), handler)
 */
export function validateOptionalFields(fieldSchemas) {
  return async (c, next) => {
    const body = c.get('validatedBody') || await c.req.json().catch(() => ({}));
    const errors = {};
    
    for (const [fieldName, schemaName] of Object.entries(fieldSchemas)) {
      const value = body[fieldName];
      
      // Skip if field is not provided
      if (value === undefined || value === null) {
        continue;
      }
      
      // Validate against schema
      const error = validateInput(value, schemaName);
      if (error) {
        errors[fieldName] = error;
      }
    }
    
    if (Object.keys(errors).length > 0) {
      return c.json({ 
        error: 'Validation failed',
        details: errors 
      }, 400);
    }
    
    return next();
  };
}
