FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Development stage ─────────────────────────────────────────────────────────
FROM base AS development
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS build
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 4000
CMD ["node", "dist/index.js"]
