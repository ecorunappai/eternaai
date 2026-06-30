# Eterna AI Browser Agent — Playwright + Express
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# Install deps first for layer caching
COPY package.json ./
RUN npm install --omit=optional --no-audit --no-fund

# App source
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8090
EXPOSE 8090

# Storage for screenshots/evidence
RUN mkdir -p /app/evidence /app/data
VOLUME ["/app/evidence"]

CMD ["npx", "tsx", "src/server.ts"]
