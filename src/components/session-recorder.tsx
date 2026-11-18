"use client";

import { useEffect } from "react";
import { startSessionRecorder } from "@/features/sessions";

// Mounted once in the root layout: saves a local summary whenever a session ends.
// Renders nothing. Runs only in the browser (inside an effect).
export function SessionRecorder() {
  useEffect(() => startSessionRecorder(), []);
  return null;
}
