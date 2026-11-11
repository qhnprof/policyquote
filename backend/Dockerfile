# PolicyQuote API as a container (e.g. an ECS Fargate service).
# Build from the repo root so kb/ is in the build context:
#   docker build -f backend/Dockerfile -t policyquote-api .
#   docker run --rm -p 3000:3000 policyquote-api

# ---- Stage 1: build ---------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    KB_PATH=/app/kb/risk-kb.json
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The KB is data, read at runtime: replacing this file (or KB_PATH) changes the rules without a rebuild.
COPY kb/risk-kb.json ./kb/risk-kb.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
