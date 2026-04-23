# Production Dockerfile
FROM node:20-alpine

# Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application files
# Note: node_modules and .env are excluded via .dockerignore
COPY server.js .
COPY index.html .

# Use non-root user for security
USER node

# Expose the application port (matching server.js)
EXPOSE 3010

# Health check to ensure the server is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3010', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["node", "server.js"]
