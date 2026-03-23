# Hardened Node.js container for DROOID Sales Engine
FROM node:20-alpine AS builder

# Install security tools
RUN apk add --no-cache \
    tini \
    dumb-init \
    ca-certificates

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production && \
    npm audit --production --audit-level=moderate || true

# Final stage
FROM node:20-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application
COPY --chown=nodejs:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "orchestrator/scheduler.js"]

# Security labels
LABEL security.nonroot="true" \
      security.privileged="false" \
      security.readonly-rootfs="false"
