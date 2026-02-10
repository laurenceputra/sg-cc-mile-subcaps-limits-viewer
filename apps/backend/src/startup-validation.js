/**
 * Startup Validation Module
 * 
 * Validates critical environment variables and configuration on startup.
 * Fails fast if insecure defaults are detected.
 */

const INSECURE_DEFAULTS = {
  JWT_SECRET: ['dev-secret', 'test-secret', 'change-me', 'secret', ''],
  ADMIN_LOGIN_PASSWORD_HASH: ['admin-dev-hash', 'test-admin-hash', 'change-me', ''],
  ADMIN_LOGIN_PEPPER: ['admin-dev-pepper', 'test-admin-pepper', 'change-me', '']
};

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'ADMIN_LOGIN_PASSWORD_HASH', 'ADMIN_LOGIN_PEPPER'];

/**
 * Validate that a secret is set and not using an insecure default
 * 
 * @param {string} name - Environment variable name
 * @param {string} value - Environment variable value
 * @throws {Error} - If secret is missing or insecure
 */
function validateSecret(name, value) {
  // Check if value is missing
  if (!value || value.trim() === '') {
    throw new Error(
      `SECURITY ERROR: ${name} is not set. ` +
      `This environment variable is required for production use. ` +
      `Generate a secure secret with: openssl rand -base64 32`
    );
  }
  
  // Check if value matches known insecure defaults
  const insecureValues = INSECURE_DEFAULTS[name] || [];
  if (insecureValues.includes(value)) {
    throw new Error(
      `SECURITY ERROR: ${name} is set to an insecure default value. ` +
      `Never use default secrets in production. ` +
      `Generate a secure secret with: openssl rand -base64 32`
    );
  }
  
  // Check minimum length (at least 32 characters recommended)
  if (value.length < 32) {
    console.warn(
      `[Security Warning] ${name} is shorter than recommended (${value.length} < 32 characters). ` +
      `Consider using a longer secret for better security.`
    );
  }
}

/**
 * Validate all required environment variables on startup
 * 
 * @param {object} env - Environment object containing configuration
 * @param {boolean} [isProduction=false] - Whether running in production mode
 * @throws {Error} - If any required variable is missing or insecure
 */
export function validateEnvironment(env, isProduction = false) {
  console.log('[Security] Validating environment configuration...');
  
  const errors = [];
  
  // Validate each required environment variable
  for (const varName of REQUIRED_ENV_VARS) {
    try {
      const value = env[varName];
      validateSecret(varName, value);
      console.log(`[Security] ✓ ${varName} validated`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  
  // Check for development mode with weak secrets
  const isDevelopment = env.ENVIRONMENT !== 'production' && env.NODE_ENV !== 'production';
  
  if (isDevelopment && errors.length > 0) {
    console.warn(
      '\n' +
      '═══════════════════════════════════════════════════════════════\n' +
      '  WARNING: Development Mode - Insecure Configuration Detected\n' +
      '═══════════════════════════════════════════════════════════════\n' +
      errors.join('\n') + '\n' +
      '\nThis configuration is acceptable for local development only.\n' +
      'DO NOT use this configuration in production!\n' +
      '═══════════════════════════════════════════════════════════════\n'
    );
    // Allow in development mode but show prominent warning
    return;
  }
  
  // In production mode, fail hard on any errors
  if (errors.length > 0) {
    console.error(
      '\n' +
      '═══════════════════════════════════════════════════════════════\n' +
      '  FATAL ERROR: Insecure Configuration Detected\n' +
      '═══════════════════════════════════════════════════════════════\n' +
      errors.join('\n') + '\n' +
      '\nServer startup ABORTED for security reasons.\n' +
      'Fix the errors above and restart the server.\n' +
      '═══════════════════════════════════════════════════════════════\n'
    );
    throw new Error('Environment validation failed - insecure configuration');
  }
  
  console.log('[Security] ✓ Environment validation passed');
}

/**
 * Generate example secret generation commands for documentation
 */
export function getSecretGenerationHelp() {
  return `
Generate Secure Secrets
=======================

Use one of these methods to generate strong secrets:

1. Using OpenSSL (recommended):
   openssl rand -base64 32

2. Using Node.js:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

3. Using Python:
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"

Then set the environment variables:
   export JWT_SECRET="your-generated-secret-here"
   export ADMIN_LOGIN_PEPPER="your-admin-pepper"
   export ADMIN_LOGIN_PASSWORD_HASH="$(node -e \"const crypto=require('crypto');const password='your-admin-password';const pepper=process.env.ADMIN_LOGIN_PEPPER||'your-admin-pepper';console.log(crypto.createHash('sha256').update(password + ':' + pepper).digest('hex'))\")"

For production, use secrets management:
   - Kubernetes Secrets
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
`;
}
