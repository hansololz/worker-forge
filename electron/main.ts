import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { existsSync } from 'fs'
import { join } from 'path'

let backend: ChildProcess | null = null
let backendPort = 8765

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Worker Forge',
    backgroundColor: '#0c0e12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 19 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--backend-port=${backendPort}`],
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

app.whenReady().then(async () => {
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
