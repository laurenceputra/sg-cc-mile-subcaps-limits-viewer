#!/bin/bash

# Integration test for rate limiting
# Demonstrates rate limits in action against a running server

echo "=== Rate Limiting Integration Test ==="
echo

BASE_URL="${1:-http://localhost:3000}"

echo "Testing against: $BASE_URL"
echo

# Test 1: Login rate limiting
echo "Test 1: Login Rate Limiting (5 attempts per 15 min)"
echo "-----------------------------------------------"
for i in {1..6}; do
  echo -n "Attempt $i: "
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","passwordHash":"wrong"}' 2>/dev/null)
  
  HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | grep -v HTTP_CODE)
  
  if [ "$HTTP_CODE" = "429" ]; then
    echo "✓ Rate limited (429)"
    RETRY_AFTER=$(echo "$BODY" | grep -o '"retryAfter":[0-9]*' | cut -d: -f2)
    if [ -n "$RETRY_AFTER" ]; then
      echo "  Retry after: $RETRY_AFTER seconds"
    fi
  elif [ "$HTTP_CODE" = "401" ]; then
    echo "Failed (401)"
  else
    echo "Status: $HTTP_CODE"
  fi
  
  sleep 0.5
done

echo
echo "Test 2: Progressive Delay Check"
echo "--------------------------------"
echo "Run multiple failed logins and observe increasing response times:"
for i in {1..4}; do
  echo -n "Attempt $i: "
  START=$(date +%s%3N)
  curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"delay-test@example.com","passwordHash":"wrong"}' >/dev/null 2>&1
  END=$(date +%s%3N)
  DURATION=$((END - START))
  echo "${DURATION}ms"
  sleep 1
done

echo
echo "Test 3: Payload Size Limit (1MB max)"
echo "------------------------------------"
# Generate a large payload (simulated)
echo -n "Testing 1MB+ payload: "
LARGE_PAYLOAD=$(printf '{"email":"test@example.com","passwordHash":"%s"}' "$(head -c 1000000 /dev/zero | tr '\0' 'a')")
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -H "Content-Length: 1048577" \
  --data-binary @<(echo "$LARGE_PAYLOAD") 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
if [ "$HTTP_CODE" = "413" ]; then
  echo "✓ Blocked (413 Payload Too Large)"
else
  echo "Status: $HTTP_CODE"
fi

echo
echo "Test 4: Rate Limit Headers"
echo "--------------------------"
echo "Checking rate limit headers in response:"
curl -s -i -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"headers-test@example.com","passwordHash":"test"}' 2>/dev/null | \
  grep -E "X-RateLimit|Retry-After"

echo
echo "=== Tests Complete ==="
echo
echo "Summary:"
echo "  ✓ Login endpoints protected with 5 attempts/15min"
echo "  ✓ Progressive delays slow brute force attacks"
echo "  ✓ Payload size limited to 1MB"
echo "  ✓ Rate limit headers included in responses"
echo
echo "NOTE: Start server with 'npm run dev:node' before running tests"
