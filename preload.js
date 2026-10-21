const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: s => ipcRenderer.invoke("settings:save", s),
  totalRam: () => ipcRenderer.invoke("system:ram"),
  listVersions: () => ipcRenderer.invoke("versions:list"),
  loginMicrosoft: () => ipcRenderer.invoke("auth:microsoft"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  restoreLogin: () => ipcRenderer.invoke("auth:restore"),
  launch: opts => ipcRenderer.invoke("game:launch", opts),
  openMods: target => ipcRenderer.invoke("folder:mods", target),
  packName: () => ipcRenderer.invoke("pack:name"),
  fabricVersions: () => ipcRenderer.invoke("fabric:versions"),
  appVersion: () => ipcRenderer.invoke("app:version"),
  on: (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data)),
});
