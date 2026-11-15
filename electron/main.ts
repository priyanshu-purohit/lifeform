import path from "node:path";
import { app, BrowserWindow, ipcMain, session } from "electron";
import { bindSmartSpectraIpc } from "@smartspectra/node-sdk/main";

const DEV_URL = process.env.LIFEFORM_DEV_URL ?? "http://localhost:3000";
const APP_ORIGIN = new URL(DEV_URL).origin;

// The API key lives only in .env (git-ignored) and is read here in the main process.
// It is never baked into the Next.js bundle.
try {
  process.loadEnvFile(path.join(app.getAppPath(), ".env"));
} catch {
  console.warn("[lifeform] No .env file found; SMARTSPECTRA_API_KEY is unset.");
}

function isOurOrigin(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  bindSmartSpectraIpc(win);
  win.loadURL(DEV_URL);
}

app.whenReady().then(() => {
  // Grant only camera/media, and only to our own app page. Deny everything else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details?.requestingUrl || wc?.getURL();
    callback(permission === "media" && isOurOrigin(url));
  });

  ipcMain.handle("lifeform:get-api-key", (event) => {
    if (!isOurOrigin(event.senderFrame?.url)) throw new Error("Untrusted sender");
    return process.env.SMARTSPECTRA_API_KEY ?? "";
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
