#!/bin/bash
set -e

echo "Testing startup validation without running the full server..."

# Test 1: Missing secrets
echo ""
echo "[Test 1] Testing with missing secrets in production mode..."
export JWT_SECRET=""
export ADMIN_KEY=""
export NODE_ENV=production

if node -e "
import { validateEnvironment } from './src/startup-validation.js';
try {
  validateEnvironment({ JWT_SECRET: '', ADMIN_KEY: '', NODE_ENV: 'production', ENVIRONMENT: 'production' }, true);
  console.log('FAIL: Should have rejected empty secrets');
  process.exit(1);
} catch (e) {
  console.log('✓ Correctly rejected empty secrets in production');
}
" 2>&1 | grep -q "✓ Correctly"; then
    echo "✓ Test 1 passed"
else
    echo "❌ Test 1 failed"
    exit 1
fi

# Test 2: Secure secrets
echo ""
echo "[Test 2] Testing with secure secrets..."
SECURE_JWT=$(openssl rand -base64 32)
SECURE_ADMIN=$(openssl rand -base64 32)

if node -e "
import { validateEnvironment } from './src/startup-validation.js';
try {
  validateEnvironment({ 
    JWT_SECRET: process.argv[1], 
    ADMIN_KEY: process.argv[2], 
    NODE_ENV: 'production',
    ENVIRONMENT: 'production'
  }, true);
  console.log('✓ Accepted secure secrets');
} catch (e) {
  console.log('FAIL: Should have accepted secure secrets');
  process.exit(1);
}
" "$SECURE_JWT" "$SECURE_ADMIN" 2>&1 | grep -q "✓ Accepted"; then
    echo "✓ Test 2 passed"
else
    echo "❌ Test 2 failed"
    exit 1
fi

echo ""
echo "✓ All validation tests passed!"
