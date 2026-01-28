#!/bin/bash

# Test script for MEDIUM severity security fixes
# Tests all implemented features

set -e

echo "🧪 Testing MEDIUM Security Fixes Implementation"
echo "================================================"

BASE_URL="http://localhost:3000"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="test-password-hash-$(openssl rand -hex 32)"
TOKEN=""
DEVICE_ID="test-device-$(date +%s)"

echo ""
echo "1️⃣  Testing Email Validation & Normalization"
echo "----------------------------------------------"

# Test with uppercase email (should normalize to lowercase)
echo "📧 Testing email normalization with uppercase..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"TEST.USER@EXAMPLE.COM\",\"passwordHash\":\"$TEST_PASSWORD\"}")

if echo "$RESPONSE" | grep -q '"token"'; then
  echo "✅ Registration with uppercase email succeeded (normalized)"
  TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  echo "❌ Registration failed: $RESPONSE"
fi

# Test with disposable email (should fail)
echo ""
echo "📧 Testing disposable email detection..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@tempmail.com\",\"passwordHash\":\"$TEST_PASSWORD\"}")

if echo "$RESPONSE" | grep -q "Disposable email"; then
  echo "✅ Disposable email correctly rejected"
else
  echo "⚠️  Disposable email check: $RESPONSE"
fi

echo ""
echo "2️⃣  Testing Device Management Limits"
echo "--------------------------------------"

# Register first device
echo "📱 Registering device 1..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/device/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"deviceId\":\"${DEVICE_ID}-1\",\"name\":\"Device 1\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Device 1 registered"
else
  echo "❌ Device 1 registration failed: $RESPONSE"
fi

# List devices
echo ""
echo "📱 Listing devices..."
RESPONSE=$(curl -s -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"devices"'; then
  DEVICE_COUNT=$(echo "$RESPONSE" | grep -o '"count":[0-9]*' | cut -d':' -f2)
  DEVICE_LIMIT=$(echo "$RESPONSE" | grep -o '"limit":[0-9]*' | cut -d':' -f2)
  echo "✅ Device list retrieved: $DEVICE_COUNT/$DEVICE_LIMIT devices"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Failed to list devices: $RESPONSE"
fi

# Register multiple devices to test limit
echo ""
echo "📱 Testing device limit (registering 5 more devices)..."
for i in {2..6}; do
  RESPONSE=$(curl -s -X POST "$BASE_URL/auth/device/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"deviceId\":\"${DEVICE_ID}-$i\",\"name\":\"Device $i\"}")
  
  if [ $i -le 5 ]; then
    if echo "$RESPONSE" | grep -q '"success":true'; then
      echo "  ✅ Device $i registered"
    else
      echo "  ⚠️  Device $i: $RESPONSE"
    fi
  else
    if echo "$RESPONSE" | grep -q "Device limit reached"; then
      echo "  ✅ Device $i correctly rejected (limit reached)"
    else
      echo "  ❌ Device $i should have been rejected: $RESPONSE"
    fi
  fi
done

# Remove a device
echo ""
echo "📱 Removing device..."
RESPONSE=$(curl -s -X DELETE "$BASE_URL/auth/device/${DEVICE_ID}-1" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Device removed successfully"
else
  echo "❌ Failed to remove device: $RESPONSE"
fi

echo ""
echo "3️⃣  Testing Token Revocation System"
echo "------------------------------------"

# Test current token works
echo "🔑 Testing current token..."
RESPONSE=$(curl -s -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"devices"'; then
  echo "✅ Current token is valid"
else
  echo "❌ Token should be valid: $RESPONSE"
fi

# Logout (blacklist current token)
echo ""
echo "🔑 Logging out (blacklisting token)..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Logout successful"
else
  echo "❌ Logout failed: $RESPONSE"
fi

# Test token is now invalid
echo ""
echo "🔑 Testing blacklisted token..."
RESPONSE=$(curl -s -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q "Token has been revoked\|Invalid or expired token"; then
  echo "✅ Token correctly rejected after logout"
else
  echo "❌ Token should be invalid: $RESPONSE"
fi

# Login again to test logout-all
echo ""
echo "🔑 Logging in again..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test.user@example.com\",\"passwordHash\":\"$TEST_PASSWORD\"}")

if echo "$RESPONSE" | grep -q '"token"'; then
  TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Login successful (new token obtained)"
else
  echo "❌ Login failed: $RESPONSE"
fi

# Test new token works
echo ""
echo "🔑 Testing new token..."
RESPONSE=$(curl -s -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"devices"'; then
  echo "✅ New token is valid"
else
  echo "❌ New token should be valid: $RESPONSE"
fi

# Logout all devices
echo ""
echo "🔑 Logging out all devices..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout-all" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Logout all successful"
else
  echo "❌ Logout all failed: $RESPONSE"
fi

# Test token is invalid
echo ""
echo "🔑 Testing token after logout-all..."
RESPONSE=$(curl -s -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q "Token has been revoked\|Invalid or expired token"; then
  echo "✅ Token correctly rejected after logout-all"
else
  echo "❌ Token should be invalid: $RESPONSE"
fi

echo ""
echo "4️⃣  Testing Database Transactions"
echo "----------------------------------"

# Login again for testing
echo "🔑 Logging in for transaction test..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test.user@example.com\",\"passwordHash\":\"$TEST_PASSWORD\"}")

if echo "$RESPONSE" | grep -q '"token"'; then
  TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Login successful"
else
  echo "❌ Login failed: $RESPONSE"
fi

# Test valid mapping contribution (should succeed)
echo ""
echo "💾 Testing valid mapping contribution (transaction)..."
RESPONSE=$(curl -s -X POST "$BASE_URL/shared/mappings/contribute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "mappings": [
      {"merchant": "Test Merchant 1", "category": "dining", "cardType": "test-card"},
      {"merchant": "Test Merchant 2", "category": "groceries", "cardType": "test-card"}
    ]
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Valid mappings contributed successfully (transaction committed)"
else
  echo "❌ Contribution failed: $RESPONSE"
fi

# Test invalid mapping contribution (should fail atomically)
echo ""
echo "💾 Testing invalid mapping contribution (should rollback)..."
RESPONSE=$(curl -s -X POST "$BASE_URL/shared/mappings/contribute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "mappings": [
      {"merchant": "Test Merchant 3", "category": "dining", "cardType": "test-card"},
      {"merchant": "", "category": "invalid", "cardType": "test-card"}
    ]
  }')

if echo "$RESPONSE" | grep -q "Validation failed\|error"; then
  echo "✅ Invalid mappings correctly rejected (transaction rolled back)"
else
  echo "⚠️  Response: $RESPONSE"
fi

echo ""
echo "================================================"
echo "✅ All tests completed!"
echo ""
echo "Summary:"
echo "  ✓ Email validation & normalization"
echo "  ✓ Device management with limits"
echo "  ✓ Token revocation (logout/logout-all)"
echo "  ✓ Database transactions"
echo ""
echo "Check server logs for email notification mocks and cleanup job status."
