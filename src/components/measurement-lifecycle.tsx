"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { closeCamera, isSdkSessionOpen, releaseMeasurement } from "@/features/measurements";
import { useMeasurements } from "@/hooks/use-measurements";

// Decides, for the whole app, when the camera and SDK may stay on:
//   - Welcome ("/") and closing the window end everything.
//   - The camera stays open on Setup (for tuning) or while a real session is measuring.
//   - Anywhere else, a camera with no session behind it is closed at once.
// Renders nothing.
export function MeasurementLifecycle() {
  const pathname = usePathname();
  const sdkOpen = isSdkSessionOpen(useMeasurements());

  useEffect(() => {
    if (pathname === "/") releaseMeasurement();
    else if (pathname !== "/setup" && !sdkOpen) closeCamera();
  }, [pathname, sdkOpen]);

  useEffect(() => {
    window.addEventListener("pagehide", releaseMeasurement);
    return () => window.removeEventListener("pagehide", releaseMeasurement);
  }, []);

  return null;
}
