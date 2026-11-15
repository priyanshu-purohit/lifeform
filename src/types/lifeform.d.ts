export {};

declare global {
  interface Window {
    /** Narrow bridge exposed by electron/preload.ts. Undefined in a plain browser. */
    lifeform?: {
      getApiKey(): Promise<string>;
    };
  }
}
