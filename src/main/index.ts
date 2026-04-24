/**
 * Investighost - Proceso Principal (Main Process)
 * 
 * Propósito: Punto de entrada de Electron, gestión de ventana y sistema
 * Alcance: Node.js/Electron main process - no tiene acceso a DOM
 * 
 * Decisiones técnicas:
 *   - Usa electron-is-dev para detectar modo desarrollo
 *   - Carga Vite dev server en desarrollo, archivos estáticos en producción
 *   - Preload script para comunicación segura main/renderer
 * 
 * Limitaciones:
 *   - better-sqlite3 requiere build tools nativas (VS Build Tools en Windows)
 *   - Por ahora la DB está preparada pero no inicializada
 * 
 * Cambios recientes: Creación inicial del esqueleto
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import isDev from 'electron-is-dev'

// Mantener referencia global para evitar garbage collection
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'default',
    show: false, // Mostrar cuando esté listo para evitar parpadeo
  })

  // Cargar contenido según entorno
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers para comunicación segura
ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:get-platform', () => {
  return process.platform
})

// Ciclo de vida de la app
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})