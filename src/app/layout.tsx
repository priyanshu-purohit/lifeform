import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { MeasurementLifecycle } from "@/components/measurement-lifecycle";
import { MusicLifecycle } from "@/components/music-lifecycle";
import { SessionRecorder } from "@/components/session-recorder";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LIFEFORM",
  description:
    "Your body creates patterns. LIFEFORM turns those patterns into experiences you can see, understand, and hear.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Keeps one measurement session alive across routes and switches the camera off when unused. */}
        <Suspense fallback={null}>
          <MeasurementLifecycle />
          {/* Lets Create's music play across the three experiences; stops it on Welcome and Setup. */}
          <MusicLifecycle />
        </Suspense>
        {/* Saves a local summary of each session when it ends, on any route. */}
        <SessionRecorder />
      </body>
    </html>
  );
}
