export {}

declare global {
  interface Window {
    backend: {
      httpUrl: string
      openDirectory: () => Promise<string | null>
      revealPath: (p: string) => Promise<boolean>
      openExternal: (url: string) => Promise<boolean>
      appVersion: () => Promise<string>
    }
  }
}
