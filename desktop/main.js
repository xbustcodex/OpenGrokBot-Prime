/**
 * Minimal Electron shell for OpenGrokBot-Prime.
 * Loads the web UI and talks to the local API on :8799.
 */
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "OpenGrokBot-Prime",
  });

  win.loadURL("http://127.0.0.1:8799/").catch(() => {
    win.loadFile(path.join(__dirname, "../src/ui/index.html"));
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
