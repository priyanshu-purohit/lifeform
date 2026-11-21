"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { musicEngine } from "@/hooks/use-audio";

/** Music never plays on these pages: arriving on one stops it. */
const SILENT_ROUTES: readonly string[] = ["/", "/setup"];

// Decides, for the whole app, where Create's music may play. It keeps playing across
// Explore, Understand and Create, and stops on Welcome, on Setup and when the window
// closes. Otherwise only the Stop button ends it. Renders nothing.
export function MusicLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    if (SILENT_ROUTES.includes(pathname)) musicEngine.stop();
  }, [pathname]);

  useEffect(() => {
    const stop = () => musicEngine.stop();
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, []);

  return null;
}
