const { app, BrowserWindow, shell, session } = require("electron")
const path = require("path")

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: "#0c0c10",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
    },
  })

  if (isDev) win.loadURL("http://localhost:5000")
  else win.loadFile(path.join(__dirname, "..", ".next", "server", "app", "index.html"))

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
}

app.whenReady().then(() => {
  // Cross-origin isolation headers required by WebContainers
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Embedder-Policy": ["require-corp"],
        "Cross-Origin-Opener-Policy": ["same-origin"],
      },
    })
  })
  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
