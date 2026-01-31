FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY apps/backend/package*.json ./
COPY package*.json ../../

# Install dependencies
RUN npm install --production

# Copy source
COPY apps/backend/src ./src
COPY packages ../../packages

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/node-server.js"]
