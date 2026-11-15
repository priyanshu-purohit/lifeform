// Bundled by esbuild: sandboxed preloads cannot require files from node_modules at runtime.
import "@smartspectra/node-sdk/preload"; // exposes window.__smartspectraBridge for the SDK renderer
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lifeform", {
  getApiKey: (): Promise<string> => ipcRenderer.invoke("lifeform:get-api-key"),
});
