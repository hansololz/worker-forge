/* ============================================================
   Mock data for the workflow orchestrator
   Exposed on window.DB
   ============================================================ */
(function () {
  "use strict";

  // ---- Reusable task library -----------------------------------------
  // Each task owns one or more bash (or python) steps.
  const TASKS = [
    {
      id: "tk_fetch", name: "Fetch source", icon: "git", category: "source", interpreter: "bash",
      desc: "Shallow-clone the repository at the target ref and prepare the workspace.",
      timeout: 120, retries: 0, usedBy: 8,
      env: [{ k: "GIT_DEPTH", v: "1" }, { k: "REPO_URL", v: "", required: true }, { k: "TARGET_REF", v: "", required: true }],
      steps: [
        { name: "clone.sh", desc: "Shallow clone & checkout ref",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\n# Shallow clone for speed\ngit clone --depth "\${GIT_DEPTH:-1}" \\\n  "$REPO_URL" "$WORKSPACE"\ncd "$WORKSPACE"\ngit checkout "$TARGET_REF"\n\necho "Checked out $(git rev-parse --short HEAD)"` },
      ],
    },
    {
      id: "tk_deps", name: "Resolve deps", icon: "package", category: "build", interpreter: "bash",
      desc: "Restore the dependency cache and install anything missing with a frozen lockfile.",
      timeout: 300, retries: 1, usedBy: 4,
      env: [{ k: "NODE_ENV", v: "production" }],
      steps: [
        { name: "restore-cache.sh", desc: "Pull dependency cache",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nKEY="deps-$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)"\nif cache restore "$KEY"; then\n  echo "Cache hit: $KEY"\nelse\n  echo "Cache miss — cold install"\nfi` },
        { name: "install.sh", desc: "pnpm install, frozen lockfile",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\ncorepack enable\npnpm install --frozen-lockfile\ncache save "deps-$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)"` },
      ],
    },
    {
      id: "tk_typecheck", name: "Typecheck", icon: "check", category: "quality", interpreter: "bash",
      desc: "Run the TypeScript compiler in no-emit mode and lint the codebase.",
      timeout: 180, retries: 0, usedBy: 2,
      env: [],
      steps: [
        { name: "typecheck.sh", desc: "tsc --noEmit + eslint",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm exec tsc --noEmit --pretty\npnpm exec eslint . --max-warnings 0` },
      ],
    },
    {
      id: "tk_test", name: "Run tests", icon: "flask", category: "quality", interpreter: "bash",
      desc: "Run the unit suite under coverage and fail below the line threshold.",
      timeout: 600, retries: 1, usedBy: 3,
      env: [{ k: "CI", v: "true" }],
      steps: [
        { name: "test.sh", desc: "Vitest with coverage gate",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm exec vitest run --coverage \\\n  --reporter=dot\n\nCOV=$(jq '.total.lines.pct' coverage/coverage-summary.json)\necho "Line coverage: \${COV}%"\nif (( $(echo "$COV < 80" | bc -l) )); then\n  echo "Coverage below threshold" >&2\n  exit 1\nfi` },
      ],
    },
    {
      id: "tk_scan", name: "Vuln scan", icon: "shield", category: "quality", interpreter: "bash",
      desc: "Audit dependencies and run a filesystem SAST scan for known CVEs.",
      timeout: 420, retries: 0, usedBy: 4,
      env: [{ k: "SEVERITY", v: "high" }],
      steps: [
        { name: "audit.sh", desc: "pnpm audit + trivy fs scan",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm audit --audit-level "\${SEVERITY:-high}"\ntrivy fs --severity HIGH,CRITICAL \\\n  --exit-code 1 .` },
      ],
    },
    {
      id: "tk_bundle", name: "Bundle assets", icon: "box", category: "build", interpreter: "bash",
      desc: "Compile and bundle the client assets for the target environment.",
      timeout: 480, retries: 0, usedBy: 1,
      env: [{ k: "NODE_ENV", v: "production" }, { k: "BUILD_TARGET", v: "production" }],
      steps: [
        { name: "build.sh", desc: "Vite production build",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm run build --mode "\${BUILD_TARGET:-production}"\necho "Bundle size: $(du -sh dist | cut -f1)"` },
      ],
    },
    {
      id: "tk_image", name: "Containerize", icon: "box", category: "build", interpreter: "bash",
      desc: "Build and push the container image with registry layer caching.",
      timeout: 900, retries: 0, usedBy: 3,
      env: [{ k: "REGISTRY", v: "ghcr.io/northwind" }, { k: "SERVICE", v: "", required: true }],
      steps: [
        { name: "docker-build.sh", desc: "Buildx with cache mounts",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nTAG="\${REGISTRY}/\${SERVICE}:\${GIT_SHA:0:8}"\ndocker buildx build \\\n  --cache-from type=registry,ref="\${TAG}-cache" \\\n  --cache-to type=registry,ref="\${TAG}-cache",mode=max \\\n  --tag "$TAG" \\\n  --push .\n\necho "Pushed $TAG"` },
      ],
    },
    {
      id: "tk_migrate", name: "Run migrations", icon: "db", category: "deploy", interpreter: "bash",
      desc: "Apply pending database migrations and confirm the schema version.",
      timeout: 300, retries: 0, usedBy: 1,
      env: [{ k: "DATABASE_URL", v: "", required: true }],
      steps: [
        { name: "migrate.sh", desc: "prisma migrate deploy",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nCURRENT=$(psql "$DATABASE_URL" -tAc \\\n  "SELECT max(version) FROM schema_migrations")\necho "At migration \${CURRENT:-none}"\n\npnpm exec prisma migrate deploy\necho "Migrations applied"` },
      ],
    },
    {
      id: "tk_release", name: "Ship release", icon: "rocket", category: "deploy", interpreter: "bash",
      desc: "Roll out the new revision with a health-gated strategy.",
      timeout: 600, retries: 2, usedBy: 3,
      env: [{ k: "NAMESPACE", v: "production" }, { k: "STRATEGY", v: "canary" }, { k: "SERVICE", v: "", required: true }],
      steps: [
        { name: "apply.sh", desc: "kubectl set image + rollout",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nkubectl -n "$NAMESPACE" set image \\\n  deploy/"$SERVICE" \\\n  app="\${REGISTRY}/\${SERVICE}:\${GIT_SHA:0:8}"\n\nkubectl -n "$NAMESPACE" rollout status \\\n  deploy/"$SERVICE" --timeout=300s` },
        { name: "healthcheck.sh", desc: "Probe /healthz post-rollout",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nfor i in {1..30}; do\n  if curl -fsS "https://\${SERVICE}.internal/healthz"; then\n    echo "Healthy after \${i} attempts"; exit 0\n  fi\n  sleep 2\ndone\necho "Health check failed" >&2; exit 1` },
      ],
    },
    {
      id: "tk_e2e", name: "Browser tests", icon: "flask", category: "quality", interpreter: "bash",
      desc: "Run the critical end-to-end suite against the live environment.",
      timeout: 420, retries: 1, usedBy: 2,
      env: [{ k: "BASE_URL", v: "https://staging.northwind.dev" }],
      steps: [
        { name: "e2e.sh", desc: "Playwright critical run",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm exec playwright test \\\n  --grep @critical \\\n  --reporter=line` },
      ],
    },
    {
      id: "tk_ingest", name: "Ingest events", icon: "sync", category: "data", interpreter: "bash",
      desc: "Pull event deltas from upstream, normalise them and load the warehouse.",
      timeout: 2400, retries: 2, usedBy: 3,
      env: [{ k: "BATCH_SIZE", v: "5000" }, { k: "SOURCE_API", v: "https://api.northwind.dev" }],
      steps: [
        { name: "extract.sh", desc: "Pull deltas from source API",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nsince=$(cat .latk_sync 2>/dev/null || echo "1970-01-01")\ncurl -fsS "\${SOURCE_API}/events?since=\${since}" \\\n  > /tmp/events.json\necho "Rows: $(jq length /tmp/events.json)"` },
        { name: "transform.py", desc: "Normalise & dedupe records", lang: "python",
          code: `#!/usr/bin/env python3\nimport json, os\n\nbatch = int(os.environ.get("BATCH_SIZE", "5000"))\n\nwith open("/tmp/events.json") as f:\n    rows = json.load(f)\n\n# dedupe on id, keep latest by ts\nseen = {}\nfor r in rows:\n    key = r["id"]\n    if key not in seen or r["ts"] > seen[key]["ts"]:\n        seen[key] = r\n\nclean = sorted(seen.values(), key=lambda r: r["ts"])\nwith open("/tmp/clean.json", "w") as f:\n    json.dump(clean, f)\n\nprint(f"Kept {len(clean)} of {len(rows)} rows (batch={batch})")` },
        { name: "load.sh", desc: "COPY into warehouse",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\njq -c '.[]' /tmp/clean.json \\\n  | psql "$WAREHOUSE_URL" \\\n    -c "COPY events FROM STDIN"\ndate -u +%FT%TZ > .latk_sync` },
      ],
    },
    {
      id: "tk_snapshot", name: "Snapshot store", icon: "db", category: "ops", interpreter: "bash",
      desc: "Take a consistent database snapshot and upload it to object storage.",
      timeout: 1800, retries: 1, usedBy: 2,
      env: [{ k: "BUCKET", v: "s3://northwind-backups" }],
      steps: [
        { name: "dump.sh", desc: "pg_dump compressed",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nTS=$(date +%Y%m%d-%H%M%S)\nFILE="snapshot-\${TS}.sql.gz"\n\npg_dump "$DATABASE_URL" \\\n  --format=custom \\\n  | gzip -9 > "$FILE"\n\necho "Dump size: $(du -h "$FILE" | cut -f1)"` },
        { name: "upload.sh", desc: "Push to S3 + verify",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\naws s3 cp "$FILE" "\${BUCKET}/\${FILE}" \\\n  --storage-class STANDARD_IA\n\naws s3api head-object \\\n  --bucket "\${BUCKET#s3://}" \\\n  --key "$FILE" > /dev/null\necho "Verified upload of $FILE"` },
      ],
    },
    {
      id: "tk_purge", name: "Purge caches", icon: "bolt", category: "ops", interpreter: "bash",
      desc: "Invalidate CDN edge caches and apply the artifact retention policy.",
      timeout: 180, retries: 1, usedBy: 2,
      env: [{ k: "ZONE", v: "northwind.dev" }, { k: "RETAIN_DAYS", v: "30" }],
      steps: [
        { name: "purge.sh", desc: "Purge edge + prune old artifacts",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\ncurl -fsS -X POST "https://api.cdn.dev/v1/purge" \\\n  -H "Authorization: Bearer $CDN_TOKEN" \\\n  -d "{\\"zone\\": \\"$ZONE\\", \\"all\\": true}"\n\nCUTOFF=$(date -d "-\${RETAIN_DAYS:-30} days" +%s)\necho "Purged edge caches for $ZONE (retain \${RETAIN_DAYS:-30}d)"` },
      ],
    },
    {
      id: "tk_notify", name: "Notify channels", icon: "bell", category: "ops", interpreter: "bash",
      desc: "Post the run result to Slack and update the status page.",
      timeout: 60, retries: 2, usedBy: 11,
      env: [],
      steps: [
        { name: "slack.sh", desc: "Post formatted result to channel",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\ncurl -fsS -X POST "$SLACK_WEBHOOK" \\\n  -H 'Content-Type: application/json' \\\n  -d "{\\"text\\": \\"$WORKFLOW finished: $STATUS\\"}"` },
      ],
    },
    {
      id: "tk_lint", name: "Lint & format", icon: "check", category: "quality", interpreter: "bash",
      desc: "Check formatting and run the linter across the codebase.",
      timeout: 120, retries: 0, usedBy: 2,
      env: [{ k: "FIX", v: "false" }],
      steps: [
        { name: "lint.sh", desc: "Prettier check + eslint",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm exec prettier --check .\npnpm exec eslint . --max-warnings 0` },
      ],
    },
    {
      id: "tk_smoke", name: "Smoke test", icon: "flask", category: "quality", interpreter: "bash",
      desc: "Hit the critical endpoints after deploy and assert healthy responses.",
      timeout: 180, retries: 1, usedBy: 1,
      env: [{ k: "BASE_URL", v: "", required: true }],
      steps: [
        { name: "smoke.sh", desc: "curl health + key routes",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nfor path in /healthz /api/status /; do\n  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")\n  [ "$code" = "200" ] || { echo "FAIL $path -> $code"; exit 1; }\ndone\necho "smoke ok"` },
      ],
    },
    {
      id: "tk_provision", name: "Provision infra", icon: "cloud", category: "deploy", interpreter: "bash",
      desc: "Apply the Terraform plan to converge cloud infrastructure.",
      timeout: 900, retries: 0, usedBy: 1,
      env: [{ k: "TF_WORKSPACE", v: "production" }, { k: "AUTO_APPROVE", v: "false" }],
      steps: [
        { name: "plan.sh", desc: "terraform plan",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nterraform workspace select "$TF_WORKSPACE"\nterraform plan -out=tfplan` },
        { name: "apply.sh", desc: "terraform apply",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\nterraform apply -input=false tfplan` },
      ],
    },
    {
      id: "tk_publish", name: "Publish package", icon: "package", category: "deploy", interpreter: "bash",
      desc: "Build the package and publish it to the internal registry.",
      timeout: 300, retries: 1, usedBy: 1,
      env: [{ k: "REGISTRY", v: "registry.northwind.dev" }, { k: "TAG", v: "", required: true }],
      steps: [
        { name: "publish.sh", desc: "pnpm publish to registry",
          code: `#!/usr/bin/env bash\nset -euo pipefail\n\npnpm publish --registry "https://$REGISTRY" --tag "$TAG" --no-git-checks` },
      ],
    },
  ];

  const taskById = Object.fromEntries(TASKS.map(s => [s.id, s]));

  // ---- Task versioning -----------------------------------------------
  // Every task carries a `version` number and a `history` of prior
  // snapshots. Saving a task pushes the replaced version into history.
  function snapTask(s) {
    return {
      id: s.id, version: s.version, savedAt: s.savedAt,
      name: s.name, icon: s.icon, category: s.category, interpreter: s.interpreter, desc: s.desc,
      timeout: s.timeout, retries: s.retries, usedBy: s.usedBy,
      env: (s.env || []).map(x => ({ ...x })),
      steps: (s.steps || []).map(x => ({ ...x })),
    };
  }
  TASKS.forEach(s => { s.version = 1; s.savedAt = "Apr 02"; s.history = []; });
  // bump(id, mutation, savedAt): record the current state as history, then apply
  // the mutation as the new current version.
  function bump(id, mut, savedAt) {
    const cur = taskById[id];
    cur.history.push(snapTask(cur));
    Object.assign(cur, mut);
    cur.version += 1;
    cur.savedAt = savedAt;
  }
  // seed a little version history so the picker is populated out of the box
  bump("tk_fetch", { timeout: 120 }, "Apr 28");
  bump("tk_fetch", { desc: "Shallow-clone the repository at the target ref and prepare a clean workspace." }, "May 14");
  bump("tk_test", { timeout: 600, desc: "Run the unit suite under coverage and fail below the line threshold." }, "May 09");


  // ---- Trigger seeds (cron-only for now) -----------------------------
  const TRIGGER_SEEDS = {
    wf_nightly_e2e: [
      { type: "cron", cron: "0 16 * * 1-5" },
    ],
  };
  function triggersFor(w) {
    const out = [];
    if (w.schedule && w.schedule.type === "cron") out.push({ id: w.id + "_c0", type: "cron", enabled: true, cron: w.schedule.cron });
    (TRIGGER_SEEDS[w.id] || []).forEach((t, i) => out.push({ id: w.id + "_s" + i, enabled: true, ...t }));
    return out;
  }

  // ---- Workflows ------------------------------------------------------
  const WF = [
    {
      id: "wf_web_release", name: "web-release-pipeline",
      desc: "Typecheck, test, scan and canary-deploy the web client to production.",
      wfParams: { SEVERITY: "critical", NODE_ENV: "production" },
      params: {
        tk_fetch: { REPO_URL: "git@github.com:northwind/web.git", TARGET_REF: "main" },
        tk_image: { SERVICE: "web" },
        tk_release: { SERVICE: "web", STRATEGY: "canary" },
        tk_publish: { TAG: "latest" },
      },
      exec: {
        tk_scan: { continueOnFailure: true, version: "latest", enabled: true },
        tk_lint: { continueOnFailure: false, version: 1, enabled: true },
        tk_release: { continueOnFailure: false, version: "latest", enabled: true },
      },
      stages: ["tk_fetch", "tk_deps", ["tk_typecheck", "tk_test", "tk_scan", "tk_lint"], "tk_bundle", "tk_image", "tk_release", "tk_e2e", "tk_publish", "tk_notify"],
      schedule: { type: "manual", cron: null, next: null },
      lastRun: "8m ago", lastStatus: "ok",
    },
    {
      id: "wf_api_deploy", name: "api-deploy-pipeline",
      desc: "Build, test and roll out the API service with database migrations.",
      params: {
        tk_fetch: { REPO_URL: "git@github.com:northwind/api.git", TARGET_REF: "main" },
        tk_image: { SERVICE: "api" },
        tk_migrate: { DATABASE_URL: "postgres://prod/api" },
        tk_release: { SERVICE: "api" },
      },
      exec: {
        tk_scan: { continueOnFailure: true, version: "latest", enabled: true },
        tk_release: { continueOnFailure: false, version: "latest", enabled: true },
      },
      stages: ["tk_fetch", "tk_deps", ["tk_test", "tk_scan"], "tk_image", "tk_migrate", "tk_release", "tk_notify"],
      schedule: { type: "manual", cron: null, next: null },
      lastRun: "47m ago", lastStatus: "ok",
    },
    {
      id: "wf_events_etl", name: "events-etl",
      desc: "Incremental ETL of product events from upstream into the warehouse.",
      stages: ["tk_ingest", "tk_test", "tk_notify"],
      schedule: { type: "cron", cron: "0 2 * * *", next: "Jun 16 · 02:00 UTC", nextAt: "Jun 16 · 02:00 UTC" },
      lastRun: "10h ago", lastStatus: "ok",
    },
    {
      id: "wf_metrics_rollup", name: "metrics-rollup",
      desc: "Aggregate raw event metrics into hourly and daily rollup tables.",
      stages: ["tk_ingest", "tk_notify"],
      schedule: { type: "cron", cron: "15 * * * *", next: "Jun 15 · 21:15 UTC", nextAt: "Jun 15 · 21:15 UTC" },
      lastRun: "28m ago", lastStatus: "ok",
    },
    {
      id: "wf_store_snapshot", name: "store-snapshot-rotate",
      desc: "Snapshot the primary database, upload to S3 and purge old artifacts.",
      stages: ["tk_snapshot", "tk_purge", "tk_notify"],
      schedule: { type: "cron", cron: "0 */4 * * *", next: "Jun 15 · 22:00 UTC", nextAt: "Jun 15 · 22:00 UTC" },
      lastRun: "2h ago", lastStatus: "ok",
    },
    {
      id: "wf_nightly_e2e", name: "nightly-e2e",
      desc: "Provision a fresh build and run the critical browser suite nightly.",
      stages: ["tk_fetch", "tk_deps", "tk_e2e", "tk_smoke", "tk_notify"],
      schedule: { type: "cron", cron: "0 4 * * *", next: "Jun 16 · 04:00 UTC", nextAt: "Jun 16 · 04:00 UTC" },
      lastRun: "19h ago", lastStatus: "ok",
    },
    {
      id: "wf_security_audit", name: "dependency-audit",
      desc: "Weekly audit of third-party dependencies for vulnerabilities & licenses.",
      stages: ["tk_fetch", "tk_deps", "tk_scan", "tk_notify"],
      schedule: { type: "cron", cron: "0 8 * * 1", next: "Jun 16 · 08:00 UTC", nextAt: "Jun 16 · 08:00 UTC" },
      lastRun: "3d ago", lastStatus: "ok",
    },
    {
      id: "wf_image_rebuild", name: "base-image-rebuild",
      desc: "Rebuild base images on a schedule and scan for newly disclosed CVEs.",
      stages: ["tk_fetch", ["tk_image", "tk_scan"], "tk_provision", "tk_notify"],
      schedule: { type: "cron", cron: "0 6 * * 1", next: "Jun 16 · 06:00 UTC", nextAt: "Jun 16 · 06:00 UTC" },
      lastRun: "2d ago", lastStatus: "fail",
    },
    {
      id: "wf_cache_warm", name: "cdn-cache-warm",
      desc: "Invalidate and pre-warm CDN edge caches after a content publish.",
      stages: ["tk_purge", "tk_notify"],
      schedule: { type: "manual", cron: null, next: null },
      lastRun: "1h ago", lastStatus: "ok",
    },
    {
      id: "wf_cert_renew", name: "tls-cert-renewal",
      desc: "Renew expiring TLS certificates and reload the edge proxies.",
      stages: ["tk_fetch", "tk_release", "tk_notify"],
      schedule: { type: "cron", cron: "0 3 * * *", next: "Jun 16 · 03:00 UTC", nextAt: "Jun 16 · 03:00 UTC" },
      lastRun: "21h ago", lastStatus: "ok",
    },
    {
      id: "wf_data_export", name: "user-data-export",
      desc: "Assemble and encrypt user data export packages on request.",
      stages: ["tk_fetch", "tk_ingest", "tk_snapshot", "tk_notify"],
      schedule: { type: "manual", cron: null, next: null },
      lastRun: "5h ago", lastStatus: "ok",
    },
    {
      id: "wf_drift_check", name: "config-drift-check",
      desc: "Compare live configuration against source and report on drift.",
      stages: ["tk_fetch", "tk_typecheck", "tk_lint"],
      schedule: { type: "manual", cron: null, next: null },
      lastRun: "never", lastStatus: "skip",
    },
  ];

  // ---- Workflow versioning -------------------------------------------
  // Each workflow carries a `version` number + a `verHistory` of prior
  // snapshots. Saving a workflow pushes the replaced version into verHistory.
  function snapWorkflow(w) {
    return {
      version: w.version, savedAt: w.savedAt,
      name: w.name, desc: w.desc,
      stages: JSON.parse(JSON.stringify(w.stages || [])),
      wfParams: w.wfParams ? JSON.parse(JSON.stringify(w.wfParams)) : {},
      params: w.params ? JSON.parse(JSON.stringify(w.params)) : {},
      exec: w.exec ? JSON.parse(JSON.stringify(w.exec)) : {},
      triggers: (w.triggers || []).map(t => ({ ...t })),
      schedule: w.schedule ? { ...w.schedule } : null,
    };
  }
  WF.forEach(w => { w.version = 1; w.savedAt = "Apr 02"; w.verHistory = []; });
  function bumpWf(id, mut, savedAt) {
    const cur = WF.find(w => w.id === id);
    if (!cur) return;
    cur.verHistory.push(snapWorkflow(cur));
    Object.assign(cur, mut);
    cur.version += 1;
    cur.savedAt = savedAt;
  }
  // seed a little version history so the picker is populated out of the box
  bumpWf("wf_web_release", { desc: "Typecheck, test, scan and deploy the web client to production." }, "May 06");
  bumpWf("wf_web_release", { stages: ["tk_fetch", "tk_deps", ["tk_typecheck", "tk_test", "tk_scan"], "tk_bundle", "tk_image", "tk_release", "tk_e2e", "tk_notify"] }, "May 28");

  // ---- Run history ----------------------------------------------------
  // status: running | queued | failed | succeeded | cancelled
  // 200 executions generated deterministically (seeded RNG) so the list is
  // stable across reloads. The first rows are seeded so every status (and its
  // color) shows up at the top. Every run has a UUID; triggers are cron/manual.

  // per-workflow run profile: typical duration, fail rate, and how it's triggered.
  // manual: true → triggered by hand/API (actor = a user); otherwise cron (actor = scheduler).
  const RUN_PROFILE = {
    wf_web_release:   { base: 552, fail: 0.06, manual: true },
    wf_api_deploy:    { base: 456, fail: 0.04, manual: true },
    wf_events_etl:    { base: 1307, fail: 0.02 },
    wf_metrics_rollup:{ base: 221, fail: 0.02 },
    wf_store_snapshot:{ base: 789,  fail: 0.01 },
    wf_nightly_e2e:   { base: 384,  fail: 0.10 },
    wf_security_audit:{ base: 318,  fail: 0.06 },
    wf_image_rebuild: { base: 722,  fail: 0.14 },
    wf_cache_warm:    { base: 58,   fail: 0.01, manual: true },
    wf_cert_renew:    { base: 159,  fail: 0.01 },
    wf_data_export:   { base: 453,  fail: 0.02, manual: true },
  };

  function buildRuns() {
    // mulberry32 — tiny deterministic PRNG so the generated history is stable
    let seed = 0x5eed1234;
    const rnd = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const hx = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
    const uuid = () => `${hx(8)}-${hx(4)}-4${hx(3)}-${"89ab"[Math.floor(rnd() * 4)]}${hx(3)}-${hx(12)}`;
    const fmtDur = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
    const fmtAge = (m) => m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
    const taskCount = (wf) => { const w = WF.find(x => x.id === wf); return Math.max(1, ((w && w.stages) || []).flat().length); };

    const wfIds = Object.keys(RUN_PROFILE);

    // first rows are seeded so every status (and color) is visible up top.
    // `degraded` runs succeed OVERALL but have individual tasks that failed or
    // were skipped — only possible because those tasks are marked
    // "continue on failure". failed[]/skipped[] are flattened-task indices.
    const seedSpecs = [
      { wf: "wf_web_release",    status: "running",   started: "just now" },
      { wf: "wf_events_etl",     status: "queued",     started: "just now" },
      { wf: "wf_store_snapshot", status: "cancelled", started: "6m ago" },
      { wf: "wf_image_rebuild",  status: "failed",    started: "11m ago" },
      { wf: "wf_nightly_e2e",    status: "succeeded",  started: "24m ago" },
      { wf: "wf_web_release",    status: "succeeded", started: "38m ago", degraded: { failed: [2], skipped: [] } },
      { wf: "wf_events_etl",     status: "succeeded", started: "52m ago", degraded: { failed: [], skipped: [1] } },
      { wf: "wf_metrics_rollup", status: "succeeded", started: "1h ago", degraded: { failed: [1], skipped: [] } },
      // retry showcases — `retries` maps a flattened-task index to attempts used.
      { wf: "wf_web_release",    status: "succeeded", started: "1h ago",  retries: { 1: 1, 7: 2 } },             // Resolve deps retried 1×, Ship release retried 2× then recovered
      { wf: "wf_web_release",    status: "failed",   started: "2h ago",  stopAt: 7, retries: { 3: 1, 7: 2 } },  // Run tests recovered after 1 retry; Ship release exhausted 2 retries then failed
      { wf: "wf_nightly_e2e",    status: "succeeded", started: "2h ago",  retries: { 1: 1, 2: 1 } },             // Resolve deps + Browser tests each recovered after 1 retry
    ];

    const TOTAL = 200;
    const runs = [];
    let ageMin = 30;             // generated history starts ~30m back, then marches older
    for (let i = 0; i < TOTAL; i++) {
      const spec = seedSpecs[i];
      const wf = spec ? spec.wf : pick(wfIds);
      const p = RUN_PROFILE[wf];
      const n = taskCount(wf);
      const dur = Math.max(8, Math.round(p.base * (0.8 + rnd() * 0.45)));
      const trigger = p.manual ? "manual" : "cron";
      const actor = p.manual ? "user" : "scheduler";

      let status, started, stopAt = null, degraded = null;
      if (spec) {
        status = spec.status;
        started = spec.started;
        degraded = spec.degraded || null;
      } else {
        const roll = rnd();
        if (roll < 0.02) status = "queued";
        else if (roll < 0.05) status = "cancelled";
        else if (rnd() < p.fail) status = "failed";
        else status = "succeeded";
        ageMin += Math.floor(12 + rnd() * 220);   // each older run is 12m–4h further back
        started = fmtAge(ageMin);
        // ~18% of clean successes are actually "degraded": a tolerated step
        // failed or a conditional task was skipped, but the run still passed.
        if (status === "succeeded" && n >= 2 && rnd() < 0.18) {
          const idx = 1 + Math.floor(rnd() * (n - 1));   // never the first task
          degraded = rnd() < 0.55 ? { failed: [idx], skipped: [] } : { failed: [], skipped: [idx] };
        }
      }
      if (status === "running") stopAt = Math.min(n - 1, Math.max(1, Math.floor(n / 2)));
      else if (status === "failed" || status === "cancelled") stopAt = (spec && typeof spec.stopAt === "number") ? spec.stopAt : Math.floor(rnd() * n);

      const run = {
        id: uuid(), wf, trigger, actor, started,
        dur: status === "queued" ? "\u2014" : fmtDur(dur),
        status,
      };
      if (stopAt != null) run.stopAt = stopAt;
      if (spec && spec.retries) run.retries = spec.retries;
      if (degraded && (degraded.failed.length || degraded.skipped.length)) run.degraded = degraded;
      runs.push(run);
    }
    return runs;
  }
  const RUNS = buildRuns();

  // ---- Absolute timestamps ------------------------------------------------
  // Runs carry a relative age string ("8m ago", "just now", "3d ago"). To show a
  // real date + time (and convert it into the user's selected time zone) we anchor
  // the whole history to a fixed "now". NOW is chosen so the showcased seed runs
  // land on tidy wall-clock times (e.g. the "38m ago" release starts 09:14 UTC).
  const NOW_SEC = Math.floor(Date.UTC(2026, 5, 16, 9, 52, 0) / 1000);
  function ageToMinutes(s) {
    if (!s || /just now/i.test(s)) return 0;
    const m = /(\d+)\s*([mhd])/.exec(s);
    if (!m) return 0;
    const n = +m[1];
    return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
  }
  // Absolute start time of a run, in seconds since epoch (UTC).
  function runStartSec(run) { return NOW_SEC - ageToMinutes(run && run.started) * 60; }

  // Next time a 5-field cron expression fires at/after `fromSec`, in epoch
  // seconds — brute-forced minute-by-minute. Fields are evaluated in UTC (that's
  // how schedules are authored here); callers format the result into the user's
  // display zone. Returns null if the expression is malformed or nothing matches
  // within a year.
  function nextCronRun(cron, fromSec) {
    const parts = (cron || "").trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const RANGE = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    const matches = (field, idx, val) => {
      if (field === "*") return true;
      return field.split(",").some(part => {
        let step = 1, base = part;
        const slash = part.indexOf("/");
        if (slash !== -1) { base = part.slice(0, slash); step = +part.slice(slash + 1) || 1; }
        let lo, hi;
        if (base === "*" || base === "") { [lo, hi] = RANGE[idx]; }
        else if (base.indexOf("-") !== -1) { const b = base.split("-"); lo = +b[0]; hi = +b[1]; }
        else { lo = hi = +base; }
        if (isNaN(lo) || isNaN(hi)) return false;
        for (let x = lo; x <= hi; x += step) {
          const xx = idx === 4 ? x % 7 : x;   // cron weekday 7 == Sunday == 0
          if (xx === val) return true;
        }
        return false;
      });
    };
    const domRestricted = parts[2] !== "*", dowRestricted = parts[4] !== "*";
    let t = (Math.floor(fromSec / 60) + 1) * 60;   // start from the next whole minute
    const cap = t + 366 * 86400;
    for (; t <= cap; t += 60) {
      const d = new Date(t * 1000);
      if (!matches(parts[0], 0, d.getUTCMinutes())) continue;
      if (!matches(parts[1], 1, d.getUTCHours())) continue;
      if (!matches(parts[3], 3, d.getUTCMonth() + 1)) continue;
      const domOk = matches(parts[2], 2, d.getUTCDate());
      const dowOk = matches(parts[4], 4, d.getUTCDay());
      // standard cron: when BOTH day-of-month and day-of-week are restricted the
      // rule fires if EITHER matches; otherwise both must match.
      const dayOk = (domRestricted && dowRestricted) ? (domOk || dowOk) : (domOk && dowOk);
      if (dayOk) return t;
    }
    return null;
  }



  // ---- per-task run detail ---------------------------------------------
  // Given a workflow and (optionally) a specific run, produce the per-task
  // outcome. A run may carry `stopAt` — the flattened-task index where the
  // run failed / was cancelled / is currently running. Everything before it
  // succeeded; everything after it never executed (skipped).
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function runTasksFor(wf, run) {
    const ids = (wf.stages || []).flat();
    const n = ids.length;
    const rs = run && run.status;
    const stop = run && typeof run.stopAt === "number" ? run.stopAt : -1;
    const seed = run ? strHash(run.id) : 12345;
    const durFor = (i, status) => {
      if (status === "skipped" || status === "queued") return "—";
      if (status === "running") return "running…";
      const v = (seed + i * 2654435761) >>> 0;
      return `${(v % 4) + 1}m ${String(v % 60).padStart(2, "0")}s`;
    };
    return ids.map((id, i) => {
      const s = taskById[id];
      let status;
      if (stop >= 0) {
        // run with an explicit stop point (fail / cancelled / running)
        if (i < stop) status = "succeeded";
        else if (i === stop) status = rs === "failed" ? "failed" : rs === "cancelled" ? "cancelled" : rs === "running" ? "running" : "succeeded";
        // after the stop: a running execution still has work queued; a failed
        // run is blocked awaiting a decision (skip / retry) — neither case
        // cascades a "skipped" onto downstream tasks. Only a cancelled run
        // truly halted, so the rest never ran (skipped).
        else status = (rs === "running" || rs === "failed") ? "queued" : "skipped";
      } else if (rs === "queued") {
        // run is queued — no task has started yet, all waiting to run
        status = "queued";
      } else {
        // representative run: derive from run/workflow last status
        const base = rs || wf.lastStatus;
        // wf.lastStatus is the workflow-level aggregate ("ok"/"fail"); a run
        // carries the canonical execution status ("succeeded"/"failed").
        status = (base === "fail" || base === "failed") && i === n - 1 ? "failed" : "succeeded";
        // degraded run: tolerated failures / conditional skips on individual
        // steps (continue-on-failure) while the run as a whole succeeded.
        const dg = run && run.degraded;
        if (dg) {
          if (dg.failed && dg.failed.indexOf(i) !== -1) status = "failed";
          else if (dg.skipped && dg.skipped.indexOf(i) !== -1) status = "skipped";
        }
      }
      return { id, name: s.name, icon: s.icon, status, dur: durFor(i, status) };
    });
  }

  window.DB = {
    TASKS, taskById, WF, RUNS, runTasksFor, triggersFor, snapTask, snapWorkflow,
    NOW_SEC, ageToMinutes, runStartSec, nextCronRun,
  };
})();
