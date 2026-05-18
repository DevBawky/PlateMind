import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fetchBaseballSavantCsv: (options?: { startDate?: string; endDate?: string; playerType?: 'pitcher' | 'batter' }) =>
    ipcRenderer.invoke('baseball-savant:fetch-csv', options),
  minimizeWindow: () => ipcRenderer.send('window-control:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-control:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window-control:close')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
