import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { existsSync } from 'fs'
import { join } from 'path'

let backend: ChildProcess | null = null
let backendPort = 8765
let mainWindow: BrowserWindow | null = null
let splash: BrowserWindow | null = null

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

function resolveBackend(): { cmd: string; args: string[]; cwd?: string } {
  const portArgs = ['--host', '127.0.0.1', '--port', String(backendPort)]
  if (app.isPackaged) {
    const bin = join(process.resourcesPath, 'backend', 'worker-forge-backend')
    return { cmd: bin, args: portArgs }
  }
  // Dev: run the backend from its virtualenv so deps are available.
  const root = join(__dirname, '..', '..')
  const venvPython = join(root, 'backend', '.venv', 'bin', 'python')
  return {
    cmd: existsSync(venvPython) ? venvPython : 'python3',
    args: ['run.py', ...portArgs],
    cwd: join(root, 'backend'),
  }
}

async function waitForHealth(port: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return
    } catch {
      // backend not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('backend failed to become healthy in time')
}

async function startBackend(): Promise<void> {
  backendPort = await getFreePort()
  const { cmd, args, cwd } = resolveBackend()
  backend = spawn(cmd, args, { cwd, env: { ...process.env }, stdio: 'inherit' })
  backend.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`)
    backend = null
  })
  await waitForHealth(backendPort)
}

// Branded splash shown the instant the app launches and torn down once the
// renderer reports its first data load is done (ipc 'app:ready'). Inlined as a
// data: URL so it paints immediately with no bundler/file-copy dependency, and
// stays visible across BOTH startup gaps: the backend boot (no main window yet)
// and the renderer's initial loadAll(). Mirrors the in-app brand mark: a rounded
// accent square with the FontAwesome `hammer` glyph + the "Worker Forge" wordmark.
const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;cursor:default;
    -webkit-user-select:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  .card{position:absolute;inset:0;border-radius:16px;background:#0c0e12;border:1px solid #2a2f3a;
    -webkit-app-region:drag;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:17px}
  .mark{width:56px;height:56px;border-radius:13px;background:#e8833a;display:grid;place-items:center;
    box-shadow:0 6px 22px rgba(232,131,58,.30)}
  .mark svg{width:30px;height:30px;fill:#fff;transform:rotate(-6deg)}
  .name{font-size:22px;font-weight:600;letter-spacing:-.02em;color:#f4f5f7}
  .name b{color:#e8833a;font-weight:600}
  .meta{display:flex;flex-direction:column;align-items:center;gap:9px}
  .bar{width:148px;height:3px;border-radius:3px;background:#23272f;overflow:hidden}
  .bar i{display:block;width:42%;height:100%;border-radius:3px;background:#e8833a;
    animation:slide 1.15s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-115%)}100%{transform:translateX(305%)}}
  .sub{font-size:12px;color:#6b7280;letter-spacing:.01em}
</style></head><body><div class="card">
  <div class="mark"><svg viewBox="0 0 576 512"><path d="M413.5 237.5c-28.2 4.8-58.2-3.6-80-25.4l-38.1-38.1C280.4 159 272 138.8 272 117.6l0-12.1L192.3 62c-5.3-2.9-8.6-8.6-8.3-14.7s3.9-11.5 9.5-14l47.2-21C259.1 4.2 279 0 299.2 0l18.1 0c36.7 0 72 14 98.7 39.1l44.6 42c24.2 22.8 33.2 55.7 26.6 86L503 183l8-8c9.4-9.4 24.6-9.4 33.9 0l24 24c9.4 9.4 9.4 24.6 0 33.9l-88 88c-9.4 9.4-24.6 9.4-33.9 0l-24-24c-9.4-9.4-9.4-24.6 0-33.9l8-8-17.5-17.5zM27.4 377.1L260.9 182.6c3.5 4.9 7.5 9.6 11.8 14l38.1 38.1c6 6 12.4 11.2 19.2 15.7L134.9 484.6c-14.5 17.4-36 27.4-58.6 27.4C34.1 512 0 477.8 0 435.7c0-22.6 10.1-44.1 27.4-58.6z"/></svg></div>
  <div class="name">Worker <b>Forge</b></div>
  <div class="meta"><div class="bar"><i></i></div><div class="sub">Starting workspace…</div></div>
</div></body></html>`

function createSplash(): void {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    show: false,
  })
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML))
  splash.once('ready-to-show', () => splash?.show())
}

// Swap the splash for the real window. Idempotent — safe to call from the
// renderer's 'app:ready' signal and from the safety timeout below.
function revealMain(): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show()
    mainWindow.focus()
  }
  if (splash && !splash.isDestroyed()) {
    splash.close()
    splash = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Worker Forge',
    backgroundColor: '#0c0e12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 19 },
    show: false, // revealed once the renderer reports its first data load is done
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--backend-port=${backendPort}`],
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Safety net: if the renderer never sends 'app:ready' (crash, white screen),
  // still reveal the window so the user is never stranded on the splash.
  setTimeout(revealMain, 15000)
}

ipcMain.handle('dialog:openDirectory', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Choose a data directory folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

// Reveal a path in the OS file manager (e.g. the run's $WORKSPACE in Finder).
ipcMain.handle('shell:revealPath', async (_e, p: string): Promise<boolean> => {
  if (!p) return false
  shell.showItemInFolder(p)
  return true
})

// Open an external URL (About card links) in the user's default browser.
ipcMain.handle('shell:openExternal', async (_e, url: string): Promise<boolean> => {
  if (!url || !/^https?:\/\//i.test(url)) return false
  await shell.openExternal(url)
  return true
})

// App version (About card), sourced from package.json via Electron.
ipcMain.handle('app:version', (): string => app.getVersion())

// Renderer finished its first data load (loadAll settled) — drop the splash.
ipcMain.on('app:ready', () => revealMain())

app.whenReady().then(async () => {
  createSplash()
  try {
    await startBackend()
  } catch (err) {
    console.error('[backend] startup error:', err)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  backend?.kill()
})
