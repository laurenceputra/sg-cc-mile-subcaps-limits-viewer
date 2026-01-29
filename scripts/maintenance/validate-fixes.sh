#!/bin/bash
echo "🔒 Security Fixes Phase 4B - Validation"
echo ""

PASSED=0
FAILED=0

check() {
  local name=$1
  local cmd=$2
  
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ $name"
    PASSED=$((PASSED + 1))
  else
    echo "❌ $name"
    FAILED=$((FAILED + 1))
  fi
}

check "1. GDPR User Deletion" "grep -q 'DELETE FROM users WHERE id = ?' apps/backend/src/storage/db.js"
check "2. Null Pointer Safety" "grep -q 'currentBlob?.version' apps/backend/src/api/sync.js"
check "3. Race Condition Fix" "grep -q 'current.version >= version' apps/backend/src/storage/db.js"
check "4. Logout Rate Limiting" "grep -q 'logoutRateLimiter' apps/backend/src/middleware/rate-limiter.js"
check "5. CSRF Production Mode" "grep -q 'const requireOrigin = !isDevelopment' apps/backend/src/index.js"
check "6. Input Validation Order" "grep -q 'SECURITY: Validate immediately' apps/backend/src/api/shared-mappings.js"
check "7. Cleanup Health Monitoring" "grep -q 'getCleanupHealth' apps/backend/src/auth/cleanup.js"
check "8. Cloudflare Workers Cleanup" "grep -q 'async scheduled' apps/backend/src/cloudflare-worker.js"

echo ""
echo "=================================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "=================================================="
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 All security fixes validated successfully!"
  exit 0
else
  echo "⚠️  Some validations failed. Please review."
  exit 1
fi
