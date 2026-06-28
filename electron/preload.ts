import { contextBridge, ipcRenderer } from 'electron'

const portArg = process.argv.find((a) => a.startsWith('--backend-port='))
const port = portArg ? portArg.split('=')[1] : '8765'

contextBridge.exposeInMainWorld('backend', {
  httpUrl: `http://127.0.0.1:${port}/api`,
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  revealPath: (p: string): Promise<boolean> => ipcRenderer.invoke('shell:revealPath', p),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  // Signal the main process that the first data load is done so it can drop the splash.
  appReady: (): void => ipcRenderer.send('app:ready'),
})
