import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      fetchBaseballSavantCsv: (options?: {
        startDate?: string
        endDate?: string
        playerType?: 'pitcher' | 'batter'
      }) => Promise<string>
      minimizeWindow: () => void
      toggleMaximizeWindow: () => void
      closeWindow: () => void
    }
  }
}
