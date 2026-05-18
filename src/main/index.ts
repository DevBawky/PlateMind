import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

const isDev = !app.isPackaged

interface BaseballSavantFetchOptions {
  startDate?: string
  endDate?: string
  playerType?: 'pitcher' | 'batter'
}

const getDefaultDateRange = (): Required<Pick<BaseballSavantFetchOptions, 'startDate' | 'endDate'>> => {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 7)

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10)
  }
}

const buildBaseballSavantCsvUrl = ({
  startDate,
  endDate,
  playerType
}: Required<BaseballSavantFetchOptions>): string => {
  const params = new URLSearchParams({
    all: 'true',
    hfPT: '',
    hfAB: '',
    hfGT: 'R|',
    hfPR: '',
    hfZ: '',
    hfStadium: '',
    hfBBL: '',
    hfNewZones: '',
    hfPull: '',
    hfC: '',
    hfSea: '',
    hfSit: '',
    player_type: playerType,
    hfOuts: '',
    home_road: '',
    pitcher_throws: '',
    batter_stands: '',
    hfSA: '',
    hfEventOuts: '',
    hfEventRuns: '',
    hfABSFlag: '',
    game_date_gt: startDate,
    game_date_lt: endDate,
    hfMo: '',
    hfTeam: '',
    hfOpponent: '',
    hfRO: '',
    position: '',
    hfInfield: '',
    hfOutfield: '',
    hfInn: '',
    hfBBT: '',
    hfFlag: '',
    type: 'details',
    metric_1: '',
    group_by: '',
    min_pitches: '0',
    min_results: '0',
    min_pas: '0',
    sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed',
    sort_order: 'desc'
  })

  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`
}

const registerBaseballSavantIpc = (): void => {
  ipcMain.handle('baseball-savant:fetch-csv', async (_event, options: BaseballSavantFetchOptions = {}) => {
    const defaultRange = getDefaultDateRange()
    const url = buildBaseballSavantCsvUrl({
      startDate: options.startDate ?? defaultRange.startDate,
      endDate: options.endDate ?? defaultRange.endDate,
      playerType: options.playerType ?? 'pitcher'
    })
    const response = await fetch(url, {
      headers: {
        accept: 'text/csv,*/*'
      }
    })

    if (!response.ok) {
      throw new Error(`Baseball Savant 요청 실패: ${response.status}`)
    }

    return response.text()
  })
}

const registerWindowControlsIpc = (): void => {
  ipcMain.on('window-control:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window-control:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window) {
      return
    }

    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })

  ipcMain.on('window-control:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'PLATEMIND',
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    frame: false,
    ...(process.platform === 'win32' ? { thickFrame: false } : {}),
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!isDev && input.code === 'KeyR' && (input.control || input.meta)) {
      event.preventDefault()
    }

    if (isDev && input.code === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'undocked' })
      }
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  app.setAppUserModelId('com.platemind.app')
  app.setName('PLATEMIND')

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  registerBaseballSavantIpc()
  registerWindowControlsIpc()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
