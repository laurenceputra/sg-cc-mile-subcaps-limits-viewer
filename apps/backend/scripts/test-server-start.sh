#!/bin/bash
set -e

echo "Testing server startup with secure secrets..."

# Generate secure secrets
export JWT_SECRET=$(openssl rand -base64 32)
export ADMIN_KEY=$(openssl rand -base64 32)
export NODE_ENV=production

# Start server in background
timeout 5 node src/node-server.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Check if server is still running
if ps -p $SERVER_PID > /dev/null; then
    echo "✓ Server started successfully with secure secrets"
    kill $SERVER_PID 2>/dev/null || true
    exit 0
else
    echo "❌ Server failed to start"
    exit 1
fi
