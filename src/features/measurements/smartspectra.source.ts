// Connects the SmartSpectra SDK (renderer side) to the shared measurement store. This is the
// only module that creates the SDK or listens to its events. UI code calls start/stop here
// and reads results from the store, never from the SDK.
//
// Renderer-only: the SDK is imported lazily, so importing this file is safe during SSR.

import type { SmartSpectraSDK } from "@smartspectra/node-sdk/renderer";
import { adaptMetrics, adaptProcessingStatus } from "./measurement.adapter";
import { measurementStore } from "./measurement.store";

const STATUS_ERROR = 5; // ProcessingStatus.kError

let sdk: SmartSpectraSDK | null = null;
let creating: Promise<SmartSpectraSDK> | null = null;

function report(e: unknown): never {
  const err = e as { code?: unknown; retryable?: unknown; message?: unknown };
  measurementStore.setError({
    code: typeof err?.code === "number" ? err.code : null,
    message: e instanceof Error ? e.message : String(e),
    retryable: err?.retryable === true,
  });
  throw e;
}

async function createSdk(): Promise<SmartSpectraSDK> {
  if (!window.lifeform) throw new Error("Not running inside the LIFEFORM Electron app.");
  const apiKey = await window.lifeform.getApiKey();
  if (!apiKey) throw new Error("SMARTSPECTRA_API_KEY is missing from .env.");

  const [{ SmartSpectraSDK, breathingMetrics, cardioMetrics }, { decodeMetrics }] =
    await Promise.all([
      import("@smartspectra/node-sdk/renderer"),
      import("@smartspectra/node-sdk/messages"),
    ]);

  const instance = new SmartSpectraSDK({
    apiKey,
    // cardioMetrics includes PULSE_RATE and HRV; breathingMetrics includes BREATHING_RATE.
    requestedMetrics: [...breathingMetrics, ...cardioMetrics],
    enableTelemetry: false,
  });

  instance.on("processingStatus", (code) => {
    measurementStore.setStatus(adaptProcessingStatus(code));
  });
  instance.on("validationStatus", (code, _timestampUs, hint) => {
    measurementStore.setGuidance(code === 0 ? null : { code, hint });
  });
  instance.on("error", (code, message, retryable) => {
    measurementStore.setError({ code, message, retryable });
  });
  instance.on("metrics", (buf) => {
    measurementStore.ingest(adaptMetrics(decodeMetrics(buf), "presage-sdk"));
  });

  return instance;
}

async function getSdk(): Promise<SmartSpectraSDK> {
  if (sdk) return sdk;
  creating ??= createSdk().finally(() => {
    creating = null;
  });
  sdk = await creating;
  return sdk;
}

/**
 * Starts a measurement session on a camera stream the caller opened (and still owns).
 * Begins a new session in the store; this is the step that uses SDK credits.
 */
export async function startSdkMeasurement(stream: MediaStream): Promise<void> {
  measurementStore.setError(null);
  try {
    const instance = await getSdk();
    // After a terminal error the SDK must be reset before it can start again.
    if (instance.processingStatus === STATUS_ERROR) await instance.reset();
    instance.useMediaStream(stream);
    measurementStore.beginSession("presage-sdk");
    await instance.start();
  } catch (e) {
    measurementStore.endSession();
    report(e);
  }
}

/** Stops processing and closes the session. The camera stream is left to its owner. */
export async function stopSdkMeasurement(): Promise<void> {
  try {
    await sdk?.stop();
  } catch (e) {
    report(e);
  } finally {
    measurementStore.endSession();
  }
}

/** Tears the SDK down completely (e.g. when leaving the measuring screens). */
export function destroySdkMeasurement(): void {
  sdk?.destroy();
  sdk = null;
  measurementStore.endSession();
  measurementStore.setStatus("inactive");
}
