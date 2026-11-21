// Public surface of the shared measurement layer. Experiences import from here only.
export type * from "./measurement.types";
export { measurementStore } from "./measurement.store";
// The camera and SDK session are app-level, so a measurement survives route changes.
export {
  TARGET_FPS,
  applyCameraSettings,
  closeCamera,
  getCameraCaps,
  getCameraStream,
  listCameras,
  openCamera,
  readTrackSettings,
  saveCameraSettings,
  selectCamera,
  subscribeCamera,
  type CameraCaps,
  type CameraDevice,
  type CameraSettings,
} from "./camera.source";
// Local estimate of SDK credit use, and the automatic stop that protects the budget.
export {
  DEFAULT_SESSION_LIMIT_MIN,
  SECONDS_PER_CREDIT,
  SESSION_LIMIT_CHOICES_MIN,
  estimateCredits,
  getCreditsUsedEstimate,
  getSessionLimitMin,
  resetCreditsUsedEstimate,
  setSessionLimitMin,
  subscribeCredits,
} from "./credits";
export {
  NO_PULSE_TIMEOUT_MS,
  isSdkSessionOpen,
  releaseMeasurement,
  startMeasurement,
  stopMeasurement,
} from "./measurement.session";
// Development-only, clearly labelled simulation (disabled in production builds).
export {
  SIMULATION_AVAILABLE,
  startSimulation,
  stopSimulation,
  isSimulationRunning,
  isSimulatedSignalLost,
  setSimulatedSignalLost,
  subscribeSimulation,
} from "./simulation.source";
