FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/backend/package*.json ./
COPY package*.json ../../

# Install dependencies
RUN npm install --production

# Copy source
COPY apps/backend/src ./src
COPY packages ../../packages

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/node-server.js"]
