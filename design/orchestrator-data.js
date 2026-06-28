/* ============================================================
   Agent Dave — domain data + helpers (ES module)
   Ported from the prototype's data.js / icons.jsx.
   ============================================================ */

// ---- icon name -> Font Awesome class -------------------------------
export const FA = {
  workflows: "fa-solid fa-layer-group",
  tasks: "fa-solid fa-cube",
  hammer: "fa-solid fa-hammer",
  settings: "fa-solid fa-gear",
  search: "fa-solid fa-magnifying-glass",
  play: "fa-solid fa-play",
  skip: "fa-solid fa-forward-step",
  plus: "fa-solid fa-plus",
  chevR: "fa-solid fa-chevron-right",
  chevD: "fa-solid fa-chevron-down",
  x: "fa-solid fa-xmark",
  edit: "fa-regular fa-pen-to-square",
  copy: "fa-regular fa-copy",
  clock: "fa-regular fa-clock",
  info: "fa-solid fa-circle-info",
  calendar: "fa-regular fa-calendar",
  history: "fa-solid fa-clock-rotate-left",
  bell: "fa-regular fa-bell",
  check: "fa-solid fa-check",
  alert: "fa-solid fa-circle-exclamation",
  bolt: "fa-solid fa-bolt",
  terminal: "fa-solid fa-terminal",
  sync: "fa-solid fa-arrows-rotate",
  git: "fa-solid fa-code-branch",
  package: "fa-solid fa-box",
  box: "fa-solid fa-cube",
  flask: "fa-solid fa-flask",
  shield: "fa-solid fa-shield-halved",
  rocket: "fa-solid fa-rocket",
  db: "fa-solid fa-database",
  cloud: "fa-solid fa-cloud",
  code: "fa-solid fa-code",
  sliders: "fa-solid fa-sliders",
  folder: "fa-solid fa-folder-open",
};
export const faClass = (name) => FA[name] || FA.workflows;

// ---- status meta ----------------------------------------------------
// cls -> {color token, dim-fill token, label}
export const STATUS = {
  running:   { color: "var(--st-run)",    fill: "var(--run-dim)",    label: "running" },
  queued:    { color: "var(--st-queued)", fill: "var(--queued-dim)", label: "queued" },
  failed:    { color: "var(--st-fail)",   fill: "var(--fail-dim)",   label: "failed" },
  succeeded: { color: "var(--st-ok)",     fill: "var(--ok-dim)",     label: "succeeded" },
  cancelled: { color: "var(--st-cancel)", fill: "var(--cancel-dim)", label: "cancelled" },
  interrupted: { color: "var(--st-interrupt)", fill: "var(--interrupt-dim)", label: "interrupted" },
  skipped:   { color: "var(--tx-lo)",     fill: "var(--skip-dim)",   label: "skipped" },
  ok:        { color: "var(--st-ok)",     fill: "var(--ok-dim)",     label: "success" },
  fail:      { color: "var(--st-fail)",   fill: "var(--fail-dim)",   label: "failed" },
  skip:      { color: "var(--tx-lo)",     fill: "var(--skip-dim)",   label: "idle" },
  continued: { color: "var(--st-cont)",   fill: "var(--cont-dim)",   label: "continued" },
};
export const statusMeta = (s) => STATUS[s] || STATUS.skip;

// ---- reusable task library -----------------------------------------
export const TASKS = [
  { id: "tk_fetch", name: "Fetch source", icon: "git", category: "source", interpreter: "bash",
    desc: "Shallow-clone the repository at the target ref and prepare the workspace.",
    timeout: 120, retries: 0, usedBy: 8,
    env: [{ k: "GIT_DEPTH", v: "1" }, { k: "REPO_URL", v: "", required: true }, { k: "TARGET_REF", v: "", required: true }],
    steps: [{ name: "clone.sh", desc: "Shallow clone & checkout ref",
      code: 'git clone --depth "${GIT_DEPTH:-1}" "$REPO_URL" "$WORKSPACE"\ncd "$WORKSPACE"\ngit checkout "$TARGET_REF"\necho "Checked out $(git rev-parse --short HEAD)"' }] },
  { id: "tk_deps", name: "Resolve deps", icon: "package", category: "build", interpreter: "bash",
    desc: "Restore the dependency cache and install anything missing with a frozen lockfile.",
    timeout: 300, retries: 1, usedBy: 4, env: [{ k: "NODE_ENV", v: "production" }],
    steps: [
      { name: "restore-cache.sh", desc: "Pull dependency cache",
        code: 'KEY="deps-$(sha256sum pnpm-lock.yaml | cut -d\' \' -f1)"\nif cache restore "$KEY"; then echo "Cache hit: $KEY"; else echo "Cache miss"; fi' },
      { name: "install.sh", desc: "pnpm install, frozen lockfile",
        code: 'corepack enable\npnpm install --frozen-lockfile\ncache save "deps-$(sha256sum pnpm-lock.yaml | cut -d\' \' -f1)"' }] },
  { id: "tk_typecheck", name: "Typecheck", icon: "check", category: "quality", interpreter: "bash",
    desc: "Run the TypeScript compiler in no-emit mode and lint the codebase.",
    timeout: 180, retries: 0, usedBy: 2, env: [],
    steps: [{ name: "typecheck.sh", desc: "tsc --noEmit + eslint",
      code: 'pnpm exec tsc --noEmit --pretty\npnpm exec eslint . --max-warnings 0' }] },
  { id: "tk_test", name: "Run tests", icon: "flask", category: "quality", interpreter: "bash",
    desc: "Run the unit suite under coverage and fail below the line threshold.",
    timeout: 600, retries: 1, usedBy: 3, env: [{ k: "CI", v: "true" }],
    steps: [{ name: "test.sh", desc: "Vitest with coverage gate",
      code: 'pnpm exec vitest run --coverage --reporter=dot\nCOV=$(jq \'.total.lines.pct\' coverage/coverage-summary.json)\necho "Line coverage: ${COV}%"' }] },
  { id: "tk_scan", name: "Vuln scan", icon: "shield", category: "quality", interpreter: "bash",
    desc: "Audit dependencies and run a filesystem SAST scan for known CVEs.",
    timeout: 420, retries: 0, usedBy: 4, env: [{ k: "SEVERITY", v: "high" }],
    steps: [{ name: "audit.sh", desc: "pnpm audit + trivy fs scan",
      code: 'pnpm audit --audit-level "${SEVERITY:-high}"\ntrivy fs --severity HIGH,CRITICAL --exit-code 1 .' }] },
  { id: "tk_bundle", name: "Bundle assets", icon: "box", category: "build", interpreter: "bash",
    desc: "Compile and bundle the client assets for the target environment.",
    timeout: 480, retries: 0, usedBy: 1, env: [{ k: "NODE_ENV", v: "production" }, { k: "BUILD_TARGET", v: "production" }],
    steps: [{ name: "build.sh", desc: "Vite production build",
      code: 'pnpm run build --mode "${BUILD_TARGET:-production}"\necho "Bundle size: $(du -sh dist | cut -f1)"' }] },
  { id: "tk_image", name: "Containerize", icon: "box", category: "build", interpreter: "bash",
    desc: "Build and push the container image with registry layer caching.",
    timeout: 900, retries: 0, usedBy: 3, env: [{ k: "REGISTRY", v: "ghcr.io/northwind" }, { k: "SERVICE", v: "", required: true }],
    steps: [{ name: "docker-build.sh", desc: "Buildx with cache mounts",
      code: 'TAG="${REGISTRY}/${SERVICE}:${GIT_SHA:0:8}"\ndocker buildx build --tag "$TAG" --push .\necho "Pushed $TAG"' }] },
  { id: "tk_migrate", name: "Run migrations", icon: "db", category: "deploy", interpreter: "bash",
    desc: "Apply pending database migrations and confirm the schema version.",
    timeout: 300, retries: 0, usedBy: 1, env: [{ k: "DATABASE_URL", v: "", required: true }],
    steps: [{ name: "migrate.sh", desc: "prisma migrate deploy",
      code: 'CURRENT=$(psql "$DATABASE_URL" -tAc "SELECT max(version) FROM schema_migrations")\necho "At migration ${CURRENT:-none}"\npnpm exec prisma migrate deploy' }] },
  { id: "tk_release", name: "Ship release", icon: "rocket", category: "deploy", interpreter: "bash",
    desc: "Roll out the new revision with a health-gated strategy.",
    timeout: 600, retries: 2, usedBy: 3, env: [{ k: "NAMESPACE", v: "production" }, { k: "STRATEGY", v: "canary" }, { k: "SERVICE", v: "", required: true }],
    steps: [
      { name: "apply.sh", desc: "kubectl set image + rollout",
        code: 'kubectl -n "$NAMESPACE" set image deploy/"$SERVICE" app="${REGISTRY}/${SERVICE}:${GIT_SHA:0:8}"\nkubectl -n "$NAMESPACE" rollout status deploy/"$SERVICE" --timeout=300s' },
      { name: "healthcheck.sh", desc: "Probe /healthz post-rollout",
        code: 'for i in {1..30}; do\n  if curl -fsS "https://${SERVICE}.internal/healthz"; then echo "Healthy"; exit 0; fi\n  sleep 2\ndone' }] },
  { id: "tk_e2e", name: "Browser tests", icon: "flask", category: "quality", interpreter: "bash",
    desc: "Run the critical end-to-end suite against the live environment.",
    timeout: 420, retries: 1, usedBy: 2, env: [{ k: "BASE_URL", v: "https://staging.northwind.dev" }],
    steps: [{ name: "e2e.sh", desc: "Playwright critical run",
      code: 'pnpm exec playwright test --grep @critical --reporter=line' }] },
  { id: "tk_ingest", name: "Ingest events", icon: "sync", category: "data", interpreter: "bash",
    desc: "Pull event deltas from upstream, normalise them and load the warehouse.",
    timeout: 2400, retries: 2, usedBy: 3, env: [{ k: "BATCH_SIZE", v: "5000" }, { k: "SOURCE_API", v: "https://api.northwind.dev" }],
    steps: [
      { name: "extract.sh", desc: "Pull deltas from source API",
        code: 'since=$(cat .last_sync 2>/dev/null || echo "1970-01-01")\ncurl -fsS "${SOURCE_API}/events?since=${since}" > /tmp/events.json\necho "Rows: $(jq length /tmp/events.json)"' },
      { name: "transform.py", desc: "Normalise & dedupe records", lang: "python",
        code: 'import json, os\nbatch = int(os.environ.get("BATCH_SIZE", "5000"))\nwith open("/tmp/events.json") as f:\n    rows = json.load(f)\nprint(f"Kept {len(rows)} rows (batch={batch})")' },
      { name: "load.sh", desc: "COPY into warehouse",
        code: 'jq -c \'.[]\' /tmp/clean.json | psql "$WAREHOUSE_URL" -c "COPY events FROM STDIN"\ndate -u +%FT%TZ > .last_sync' }] },
  { id: "tk_snapshot", name: "Snapshot store", icon: "db", category: "ops", interpreter: "bash",
    desc: "Take a consistent database snapshot and upload it to object storage.",
    timeout: 1800, retries: 1, usedBy: 2, env: [{ k: "BUCKET", v: "s3://northwind-backups" }],
    steps: [
      { name: "dump.sh", desc: "pg_dump compressed",
        code: 'TS=$(date +%Y%m%d-%H%M%S)\nFILE="snapshot-${TS}.sql.gz"\npg_dump "$DATABASE_URL" --format=custom | gzip -9 > "$FILE"' },
      { name: "upload.sh", desc: "Push to S3 + verify",
        code: 'aws s3 cp "$FILE" "${BUCKET}/${FILE}" --storage-class STANDARD_IA\necho "Verified upload of $FILE"' }] },
  { id: "tk_purge", name: "Purge caches", icon: "bolt", category: "ops", interpreter: "bash",
    desc: "Invalidate CDN edge caches and apply the artifact retention policy.",
    timeout: 180, retries: 1, usedBy: 2, env: [{ k: "ZONE", v: "northwind.dev" }, { k: "RETAIN_DAYS", v: "30" }],
    steps: [{ name: "purge.sh", desc: "Purge edge + prune old artifacts",
      code: 'curl -fsS -X POST "https://api.cdn.dev/v1/purge" -d "{\\"zone\\": \\"$ZONE\\"}"\necho "Purged edge caches for $ZONE"' }] },
  { id: "tk_notify", name: "Notify channels", icon: "bell", category: "ops", interpreter: "bash",
    desc: "Post the run result to Slack and update the status page.",
    timeout: 60, retries: 2, usedBy: 11, env: [],
    steps: [{ name: "slack.sh", desc: "Post formatted result to channel",
      code: 'curl -fsS -X POST "$SLACK_WEBHOOK" -d "{\\"text\\": \\"$WORKFLOW finished: $STATUS\\"}"' }] },
  { id: "tk_lint", name: "Lint & format", icon: "check", category: "quality", interpreter: "bash",
    desc: "Check formatting and run the linter across the codebase.",
    timeout: 120, retries: 0, usedBy: 2, env: [{ k: "FIX", v: "false" }],
    steps: [{ name: "lint.sh", desc: "Prettier check + eslint",
      code: 'pnpm exec prettier --check .\npnpm exec eslint . --max-warnings 0' }] },
  { id: "tk_smoke", name: "Smoke test", icon: "flask", category: "quality", interpreter: "bash",
    desc: "Hit the critical endpoints after deploy and assert healthy responses.",
    timeout: 180, retries: 1, usedBy: 1, env: [{ k: "BASE_URL", v: "", required: true }],
    steps: [{ name: "smoke.sh", desc: "curl health + key routes",
      code: 'for path in /healthz /api/status /; do\n  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")\n  [ "$code" = "200" ] || exit 1\ndone\necho "smoke ok"' }] },
  { id: "tk_provision", name: "Provision infra", icon: "cloud", category: "deploy", interpreter: "bash",
    desc: "Apply the Terraform plan to converge cloud infrastructure.",
    timeout: 900, retries: 0, usedBy: 1, env: [{ k: "TF_WORKSPACE", v: "production" }, { k: "AUTO_APPROVE", v: "false" }],
    steps: [
      { name: "plan.sh", desc: "terraform plan",
        code: 'terraform workspace select "$TF_WORKSPACE"\nterraform plan -out=tfplan' },
      { name: "apply.sh", desc: "terraform apply",
        code: 'terraform apply -input=false tfplan' }] },
  { id: "tk_publish", name: "Publish package", icon: "package", category: "deploy", interpreter: "bash",
    desc: "Build the package and publish it to the internal registry.",
    timeout: 300, retries: 1, usedBy: 1, env: [{ k: "REGISTRY", v: "registry.northwind.dev" }, { k: "TAG", v: "", required: true }],
    steps: [{ name: "publish.sh", desc: "pnpm publish to registry",
      code: 'pnpm publish --registry "https://$REGISTRY" --tag "$TAG" --no-git-checks' }] },
];
export const taskById = Object.fromEntries(TASKS.map((s) => [s.id, { ...s, version: 1, savedAt: "Apr 02" }]));

// ---- workflows ------------------------------------------------------
export const WF = [
  { id: "wf_web_release", name: "web-release-pipeline", version: 3, savedAt: "May 28",
    desc: "Typecheck, test, scan and canary-deploy the web client to production.",
    stages: ["tk_fetch", "tk_deps", ["tk_typecheck", "tk_test", "tk_scan", "tk_lint"], "tk_bundle", "tk_image", "tk_release", "tk_e2e", "tk_publish", "tk_notify"],
    schedule: { type: "manual", cron: null, next: null }, lastRun: "8m ago", lastStatus: "ok" },
  { id: "wf_api_deploy", name: "api-deploy-pipeline", version: 1, savedAt: "Apr 02",
    desc: "Build, test and roll out the API service with database migrations.",
    stages: ["tk_fetch", "tk_deps", ["tk_test", "tk_scan"], "tk_image", "tk_migrate", "tk_release", "tk_notify"],
    schedule: { type: "manual", cron: null, next: null }, lastRun: "47m ago", lastStatus: "ok" },
  { id: "wf_events_etl", name: "events-etl", version: 1, savedAt: "Apr 02",
    desc: "Incremental ETL of product events from upstream into the warehouse.",
    stages: ["tk_ingest", "tk_test", "tk_notify"],
    schedule: { type: "cron", cron: "0 2 * * *", next: "daily at 02:00 UTC" }, lastRun: "10h ago", lastStatus: "ok" },
  { id: "wf_metrics_rollup", name: "metrics-rollup", version: 1, savedAt: "Apr 02",
    desc: "Aggregate raw event metrics into hourly and daily rollup tables.",
    stages: ["tk_ingest", "tk_notify"],
    schedule: { type: "cron", cron: "15 * * * *", next: "hourly at :15 UTC" }, lastRun: "28m ago", lastStatus: "ok" },
  { id: "wf_store_snapshot", name: "store-snapshot-rotate", version: 1, savedAt: "Apr 02",
    desc: "Snapshot the primary database, upload to S3 and purge old artifacts.",
    stages: ["tk_snapshot", "tk_purge", "tk_notify"],
    schedule: { type: "cron", cron: "0 */4 * * *", next: "every 4h UTC" }, lastRun: "2h ago", lastStatus: "ok" },
  { id: "wf_nightly_e2e", name: "nightly-e2e", version: 1, savedAt: "Apr 02",
    desc: "Provision a fresh build and run the critical browser suite nightly.",
    stages: ["tk_fetch", "tk_deps", "tk_e2e", "tk_smoke", "tk_notify"],
    schedule: { type: "cron", cron: "0 4 * * *", next: "daily at 04:00 UTC" }, lastRun: "19h ago", lastStatus: "ok" },
  { id: "wf_security_audit", name: "dependency-audit", version: 1, savedAt: "Apr 02",
    desc: "Weekly audit of third-party dependencies for vulnerabilities & licenses.",
    stages: ["tk_fetch", "tk_deps", "tk_scan", "tk_notify"],
    schedule: { type: "cron", cron: "0 8 * * 1", next: "Mondays 08:00 UTC" }, lastRun: "3d ago", lastStatus: "ok" },
  { id: "wf_image_rebuild", name: "base-image-rebuild", version: 1, savedAt: "Apr 02",
    desc: "Rebuild base images on a schedule and scan for newly disclosed CVEs.",
    stages: ["tk_fetch", ["tk_image", "tk_scan"], "tk_provision", "tk_notify"],
    schedule: { type: "cron", cron: "0 6 * * 1", next: "Mondays 06:00 UTC" }, lastRun: "2d ago", lastStatus: "fail" },
  { id: "wf_cache_warm", name: "cdn-cache-warm", version: 1, savedAt: "Apr 02",
    desc: "Invalidate and pre-warm CDN edge caches after a content publish.",
    stages: ["tk_purge", "tk_notify"],
    schedule: { type: "manual", cron: null, next: null }, lastRun: "1h ago", lastStatus: "ok" },
  { id: "wf_cert_renew", name: "tls-cert-renewal", version: 1, savedAt: "Apr 02",
    desc: "Renew expiring TLS certificates and reload the edge proxies.",
    stages: ["tk_fetch", "tk_release", "tk_notify"],
    schedule: { type: "cron", cron: "0 3 * * *", next: "daily at 03:00 UTC" }, lastRun: "21h ago", lastStatus: "ok" },
  { id: "wf_data_export", name: "user-data-export", version: 1, savedAt: "Apr 02",
    desc: "Assemble and encrypt user data export packages on request.",
    stages: ["tk_fetch", "tk_ingest", "tk_snapshot", "tk_notify"],
    schedule: { type: "manual", cron: null, next: null }, lastRun: "5h ago", lastStatus: "ok" },
  { id: "wf_drift_check", name: "config-drift-check", version: 1, savedAt: "Apr 02",
    desc: "Compare live configuration against source and report on drift.",
    stages: ["tk_fetch", "tk_typecheck", "tk_lint"],
    schedule: { type: "manual", cron: null, next: null }, lastRun: "never", lastStatus: "skip" },
];
export const wfById = Object.fromEntries(WF.map((w) => [w.id, w]));
export const wfName = (id) => (wfById[id] || {}).name || id;

// stages normalized to array-of-arrays
export const stagesOf = (w) => (w.stages || []).map((el) => (Array.isArray(el) ? el.slice() : [el]));
export const flatTaskIds = (w) => stagesOf(w).flat();

// ---- run history ----------------------------------------------------
const RUN_PROFILE = {
  wf_web_release: { base: 552, fail: 0.06, manual: true },
  wf_api_deploy: { base: 456, fail: 0.04, manual: true },
  wf_events_etl: { base: 1307, fail: 0.02 },
  wf_metrics_rollup: { base: 221, fail: 0.02 },
  wf_store_snapshot: { base: 789, fail: 0.01 },
  wf_nightly_e2e: { base: 384, fail: 0.1 },
  wf_security_audit: { base: 318, fail: 0.06 },
  wf_image_rebuild: { base: 722, fail: 0.14 },
  wf_cache_warm: { base: 58, fail: 0.01, manual: true },
  wf_cert_renew: { base: 159, fail: 0.01 },
  wf_data_export: { base: 453, fail: 0.02, manual: true },
};

function buildRuns() {
  let seed = 0x5eed1234;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const hx = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
  const uuid = () => `${hx(8)}-${hx(4)}-4${hx(3)}-${"89ab"[Math.floor(rnd() * 4)]}${hx(3)}-${hx(12)}`;
  const fmtDur = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  const fmtAge = (m) => (m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`);
  const taskCount = (wf) => { const w = wfById[wf]; return Math.max(1, flatTaskIds(w || { stages: [] }).length); };
  const wfIds = Object.keys(RUN_PROFILE);
  const seedSpecs = [
    { wf: "wf_web_release", status: "running", started: "just now" },
    { wf: "wf_events_etl", status: "queued", started: "just now" },
    { wf: "wf_store_snapshot", status: "cancelled", started: "6m ago" },
    { wf: "wf_image_rebuild", status: "failed", started: "11m ago" },
    { wf: "wf_nightly_e2e", status: "succeeded", started: "24m ago" },
    { wf: "wf_web_release", status: "succeeded", started: "38m ago", degraded: { failed: [2], skipped: [] } },
    { wf: "wf_events_etl", status: "succeeded", started: "52m ago", degraded: { failed: [], skipped: [1] } },
    { wf: "wf_metrics_rollup", status: "succeeded", started: "1h ago", degraded: { failed: [1], skipped: [] } },
    { wf: "wf_web_release", status: "succeeded", started: "1h ago" },
    { wf: "wf_web_release", status: "failed", started: "2h ago", stopAt: 7 },
    { wf: "wf_nightly_e2e", status: "succeeded", started: "2h ago" },
  ];
  const TOTAL = 140;
  const runs = [];
  let ageMin = 30;
  for (let i = 0; i < TOTAL; i++) {
    const spec = seedSpecs[i];
    const wf = spec ? spec.wf : pick(wfIds);
    const p = RUN_PROFILE[wf];
    const n = taskCount(wf);
    const dur = Math.max(8, Math.round(p.base * (0.8 + rnd() * 0.45)));
    const trigger = p.manual ? "manual" : "cron";
    const actor = p.manual ? "user" : "scheduler";
    let status, started, stopAt = null, degraded = null;
    if (spec) { status = spec.status; started = spec.started; degraded = spec.degraded || null; }
    else {
      const roll = rnd();
      if (roll < 0.02) status = "queued";
      else if (roll < 0.05) status = "cancelled";
      else if (rnd() < p.fail) status = "failed";
      else status = "succeeded";
      ageMin += Math.floor(12 + rnd() * 220);
      started = fmtAge(ageMin);
      if (status === "succeeded" && n >= 2 && rnd() < 0.18) {
        const idx = 1 + Math.floor(rnd() * (n - 1));
        degraded = rnd() < 0.55 ? { failed: [idx], skipped: [] } : { failed: [], skipped: [idx] };
      }
    }
    if (status === "running") stopAt = Math.min(n - 1, Math.max(1, Math.floor(n / 2)));
    else if (status === "failed" || status === "cancelled") stopAt = spec && typeof spec.stopAt === "number" ? spec.stopAt : Math.floor(rnd() * n);
    const run = { id: uuid(), wf, trigger, actor, started, dur: status === "queued" ? "\u2014" : fmtDur(dur), status };
    if (stopAt != null) run.stopAt = stopAt;
    if (degraded && (degraded.failed.length || degraded.skipped.length)) run.degraded = degraded;
    runs.push(run);
  }
  return runs;
}
export const RUNS = buildRuns();
export const runById = (id) => RUNS.find((r) => r.id === id);
export const runsForWf = (wf) => RUNS.filter((r) => r.wf === wf);

// ---- time anchoring + formatting -----------------------------------
export const NOW_SEC = Math.floor(Date.UTC(2026, 5, 16, 9, 52, 0) / 1000);
export function ageToMinutes(s) {
  if (!s || /just now/i.test(s)) return 0;
  const m = /(\d+)\s*([mhd])/.exec(s);
  if (!m) return 0;
  const n = +m[1];
  return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
}
export const runStartSec = (run) => NOW_SEC - ageToMinutes(run && run.started) * 60;
export function lastRunSec(rel) {
  if (!rel || rel === "never") return null;
  if (rel === "just now") return NOW_SEC;
  const m = /(\d+)\s*([smhd])/.exec(rel);
  if (!m) return null;
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] || 1;
  return NOW_SEC - +m[1] * unit;
}

const _fmtCache = {};
function _wallFmt(tz) {
  const key = tz || "UTC";
  if (!_fmtCache[key]) {
    try {
      _fmtCache[key] = new Intl.DateTimeFormat("en-US", { timeZone: key, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (e) {
      _fmtCache[key] = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
  }
  return _fmtCache[key];
}
function _wallParts(sec, tz) {
  const o = {};
  for (const p of _wallFmt(tz).formatToParts(new Date(sec * 1000))) o[p.type] = p.value;
  let h = parseInt(o.hour, 10); if (h === 24) h = 0;
  return { y: +o.year, mo: +o.month, d: +o.day, h, mi: +o.minute, s: +o.second };
}
function tzOffsetMinutes(tz, atMs) {
  if (!tz) return 0;
  const ms = atMs == null ? Date.now() : atMs;
  const w = _wallParts(ms / 1000, tz);
  const asUTC = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}
export function tzShort(tz, atMs) {
  if (!tz) return "UTC";
  const ms = atMs == null ? Date.now() : atMs;
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName");
    if (part && !/^GMT[+\u2212-]/.test(part.value) && part.value !== "UTC") return part.value;
  } catch (e) {}
  const off = tzOffsetMinutes(tz, ms);
  if (off === 0) return "UTC";
  const sign = off < 0 ? "\u2212" : "+";
  const h = Math.floor(Math.abs(off) / 60), mm = Math.abs(off) % 60;
  return "UTC" + sign + h + (mm ? ":" + String(mm).padStart(2, "0") : "");
}
export function fmtTimestamp(sec, tz, opts) {
  if (sec == null) return "\u2014";
  opts = opts || {};
  const w = _wallParts(sec, tz);
  const p = (n) => String(n).padStart(2, "0");
  const clock = `${p(w.h)}:${p(w.mi)}` + (opts.seconds === false ? "" : `:${p(w.s)}`);
  return `${w.y}-${p(w.mo)}-${p(w.d)} ${clock}` + (opts.zone ? ` ${tzShort(tz, sec * 1000)}` : "");
}
export function fmtClockOnly(sec, tz, opts) {
  if (sec == null) return "\u2014";
  opts = opts || {};
  const w = _wallParts(sec, tz);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(w.h)}:${p(w.mi)}` + (opts.seconds === false ? "" : `:${p(w.s)}`);
}
export function fmtAgo(sec) {
  if (sec == null) return "\u2014";
  const m = Math.floor((NOW_SEC - sec) / 60);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  if (m < 1440) return Math.floor(m / 60) + "h ago";
  return Math.floor(m / 1440) + "d ago";
}
export const fmtTimeout = (s) => (s == null ? "no limit" : s >= 60 ? Math.round(s / 60) + "m" : s + "s");

// ---- per-task run outcome ------------------------------------------
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function runTasksFor(w, run) {
  const ids = flatTaskIds(w);
  const n = ids.length;
  const rs = run && run.status;
  const stop = run && typeof run.stopAt === "number" ? run.stopAt : -1;
  const seed = run ? strHash(run.id) : 12345;
  const durFor = (i, status) => {
    if (status === "skipped" || status === "queued") return "\u2014";
    if (status === "running") return "running\u2026";
    const v = (seed + i * 2654435761) >>> 0;
    return `${(v % 4) + 1}m ${String(v % 60).padStart(2, "0")}s`;
  };
  return ids.map((id, i) => {
    const s = taskById[id];
    let status;
    if (stop >= 0) {
      if (i < stop) status = "succeeded";
      else if (i === stop) status = rs === "failed" ? "failed" : rs === "cancelled" ? "cancelled" : rs === "running" ? "running" : "succeeded";
      else status = rs === "running" || rs === "failed" ? "queued" : "skipped";
    } else if (rs === "queued") {
      status = "queued";
    } else {
      const base = rs || w.lastStatus;
      status = (base === "fail" || base === "failed") && i === n - 1 ? "failed" : "succeeded";
      const dg = run && run.degraded;
      if (dg) {
        if (dg.failed && dg.failed.indexOf(i) !== -1) status = "failed";
        else if (dg.skipped && dg.skipped.indexOf(i) !== -1) status = "skipped";
      }
    }
    return { id, name: s.name, icon: s.icon, status, dur: durFor(i, status) };
  });
}

// cron next-run (UTC, brute-forced)
export function nextCronRun(cron, fromSec) {
  const parts = (cron || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const RANGE = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  const matches = (field, idx, val) => {
    if (field === "*") return true;
    return field.split(",").some((part) => {
      let step = 1, base = part;
      const slash = part.indexOf("/");
      if (slash !== -1) { base = part.slice(0, slash); step = +part.slice(slash + 1) || 1; }
      let lo, hi;
      if (base === "*" || base === "") [lo, hi] = RANGE[idx];
      else if (base.indexOf("-") !== -1) { const b = base.split("-"); lo = +b[0]; hi = +b[1]; }
      else lo = hi = +base;
      if (isNaN(lo) || isNaN(hi)) return false;
      for (let x = lo; x <= hi; x += step) { const xx = idx === 4 ? x % 7 : x; if (xx === val) return true; }
      return false;
    });
  };
  const domR = parts[2] !== "*", dowR = parts[4] !== "*";
  let t = (Math.floor(fromSec / 60) + 1) * 60;
  const cap = t + 366 * 86400;
  for (; t <= cap; t += 60) {
    const d = new Date(t * 1000);
    if (!matches(parts[0], 0, d.getUTCMinutes())) continue;
    if (!matches(parts[1], 1, d.getUTCHours())) continue;
    if (!matches(parts[3], 3, d.getUTCMonth() + 1)) continue;
    const domOk = matches(parts[2], 2, d.getUTCDate());
    const dowOk = matches(parts[4], 4, d.getUTCDay());
    const dayOk = domR && dowR ? domOk || dowOk : domOk && dowOk;
    if (dayOk) return t;
  }
  return null;
}
export function fmtCountdown(targetSec, nowSec) {
  if (targetSec == null) return "\u2014";
  let s = Math.round(targetSec - nowSec);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (!d && !h && !m) return "in <1m";
  const parts = [];
  if (d) parts.push(d + "d");
  if (d || h) parts.push(h + "h");
  parts.push(m + "m");
  return "in " + parts.join(" ");
}
