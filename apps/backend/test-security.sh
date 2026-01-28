#!/bin/bash

# Security Test Suite
# Tests input validation, CSRF protection, and content-type validation

set -e

API_URL="${API_URL:-http://localhost:3000}"
PASSED=0
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "=================================="
    echo "$1"
    echo "=================================="
}

test_case() {
    local name="$1"
    local expected_status="$2"
    shift 2
    
    echo -n "Testing: $name ... "
    
    response=$(curl -s -w "\n%{http_code}" "$@")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} (Expected $expected_status, got $http_code)"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# ============================================
# Input Validation Tests
# ============================================

print_header "INPUT VALIDATION TESTS"

# Test 1: Invalid email format
test_case "Invalid email format" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email": "not-an-email", "passwordHash": "validhash123"}'

# Test 2: Email too long (>254 chars)
test_case "Email exceeds max length" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email": "a'$(printf 'a%.0s' {1..250})'@example.com", "passwordHash": "validhash123"}'

# Test 3: Email with control characters
test_case "Email with control characters" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d $'{"email": "test@example.com\\u0000", "passwordHash": "validhash123"}'

# Test 4: Invalid password hash format
test_case "Invalid password hash format" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "passwordHash": "invalid!@#$%"}'

# Test 5: Invalid tier
test_case "Invalid tier value" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "passwordHash": "validhash123", "tier": "premium"}'

# Test 6: Device name too long
test_case "Device name exceeds max length" "400" \
    -X POST "$API_URL/auth/device/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"deviceId": "device1", "name": "'$(printf 'A%.0s' {1..101})'"}'

# Test 7: Invalid device ID format
test_case "Invalid device ID format" "400" \
    -X POST "$API_URL/auth/device/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"deviceId": "device!@#$%", "name": "My Device"}'

# Test 8: Invalid category
test_case "Invalid category value" "400" \
    -X POST "$API_URL/shared/mappings/contribute" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"mappings": [{"merchant": "Test", "category": "invalid_category", "cardType": "Test Card"}]}'

# Test 9: Merchant name too long
test_case "Merchant name exceeds max length" "400" \
    -X POST "$API_URL/shared/mappings/contribute" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"mappings": [{"merchant": "'$(printf 'M%.0s' {1..201})'", "category": "dining", "cardType": "Test"}]}'

# Test 10: Mappings array too large
test_case "Mappings array exceeds max items" "400" \
    -X POST "$API_URL/shared/mappings/contribute" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"mappings": ['$(printf '{"merchant":"M","category":"dining","cardType":"T"},%.0s' {1..101})'{}]}'

# Test 11: Invalid version type
test_case "Version must be number" "400" \
    -X PUT "$API_URL/sync/data" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"encryptedData": {"iv": "abc", "ciphertext": "def"}, "version": "1"}'

# Test 12: Negative version
test_case "Version must be non-negative" "400" \
    -X PUT "$API_URL/sync/data" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer fake-token" \
    -d '{"encryptedData": {"iv": "abc", "ciphertext": "def"}, "version": -1}'

# ============================================
# CSRF Protection Tests
# ============================================

print_header "CSRF PROTECTION TESTS"

# Test 13: Invalid origin
test_case "Request from invalid origin" "403" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -H "Origin: https://evil.com" \
    -d '{"email": "test@example.com", "passwordHash": "validhash123"}'

# Test 14: Valid origin (should fail with different error - not CSRF)
# Note: This will fail with 400 or 500, not 403, proving CSRF passed
echo -n "Testing: Request from valid origin ... "
response=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -H "Origin: https://pib.uob.com.sg" \
    -d '{"email": "test@example.com", "passwordHash": "validhash123"}')
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" != "403" ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $http_code - CSRF check passed)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}FAIL${NC} (Got 403, CSRF should have passed)"
    FAILED=$((FAILED + 1))
fi

# Test 15: localhost origin in development
if [ "${ENVIRONMENT:-development}" != "production" ]; then
    echo -n "Testing: Request from localhost (dev mode) ... "
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "$API_URL/auth/register" \
        -H "Content-Type: application/json" \
        -H "Origin: http://localhost:3000" \
        -d '{"email": "test@example.com", "passwordHash": "validhash123"}')
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" != "403" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code - localhost allowed in dev)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC} (Got 403, localhost should be allowed)"
        FAILED=$((FAILED + 1))
    fi
fi

# ============================================
# Content-Type Validation Tests
# ============================================

print_header "CONTENT-TYPE VALIDATION TESTS"

# Test 16: Missing Content-Type header
test_case "Missing Content-Type header" "415" \
    -X POST "$API_URL/auth/register" \
    -d '{"email": "test@example.com", "passwordHash": "validhash123"}'

# Test 17: Wrong Content-Type
test_case "Wrong Content-Type (text/plain)" "415" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: text/plain" \
    -d '{"email": "test@example.com", "passwordHash": "validhash123"}'

# Test 18: Wrong Content-Type (form-urlencoded)
test_case "Wrong Content-Type (form-urlencoded)" "415" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d 'email=test@example.com&passwordHash=validhash123'

# Test 19: Invalid JSON
test_case "Invalid JSON syntax" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{invalid json}'

# Test 20: Deeply nested JSON (DoS prevention)
nested_json='{"a":'$(printf '{"a":%.0s' {1..15})'{}}}}}}}}}}}}}}}}'
test_case "Deeply nested JSON (>10 levels)" "400" \
    -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "$nested_json"

# ============================================
# Safe Method Tests (should not trigger CSRF)
# ============================================

print_header "SAFE METHOD TESTS"

# Test 21: GET with invalid origin (should pass)
echo -n "Testing: GET with invalid origin (should pass) ... "
response=$(curl -s -w "\n%{http_code}" \
    -X GET "$API_URL/" \
    -H "Origin: https://evil.com")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" != "403" ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $http_code - GET is safe method)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}FAIL${NC} (Got 403, GET should not be CSRF protected)"
    FAILED=$((FAILED + 1))
fi

# ============================================
# Summary
# ============================================

print_header "TEST SUMMARY"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo -e "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
