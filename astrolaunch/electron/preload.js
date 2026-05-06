const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("astrolaunch", {
  platform: process.platform,
  version: "0.1.0",
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => {
    const listener = (_e, ...args) => fn(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
