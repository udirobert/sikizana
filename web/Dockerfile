# Sikizana Books — Frontend Dockerfile
# Multi-stage build: build Next.js standalone, then serve from minimal image

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build with same-origin API (Traefik routes /api/* to backend)
ENV NEXT_PUBLIC_API_BASE=
RUN npm run build

# Stage 2: Run
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
