# Frontend unit tests (vitest + jsdom). No display required.
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Source + test config needed to run the unit suite.
COPY vitest.config.ts ./
COPY tests/ ./tests/
COPY src/ ./src/

CMD ["npm", "run", "test:unit"]
