# End-to-end Electron tests (Playwright) under a virtual display.
#
# Heavy by design: needs Node (renderer + Electron), Python (the spawned
# backend), the Electron/Chromium system libraries, and xvfb. Linux-only — the
# real ship target is macOS, but this gives a reproducible E2E run anywhere.
FROM node:20-bookworm

# Python (the app spawns the backend via python3) + Electron/Chromium runtime
# libs + xvfb for a headless display.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip \
      xvfb \
      libgtk-3-0 libnss3 libnspr4 libasound2 libgbm1 libxss1 \
      libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 \
      libcairo2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node deps.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Python backend deps into the venv main.ts looks for in dev mode
# (engine/.venv/bin/python).
COPY engine/ ./engine/
RUN python3 -m venv engine/.venv \
    && engine/.venv/bin/pip install --no-cache-dir -r engine/requirements.txt

# App + tests, then build the renderer/main bundles the e2e fixture launches.
COPY . .
RUN npm run build

# Wrap the suite in a virtual display.
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1280x1024x24", "npm", "run", "test:e2e"]
