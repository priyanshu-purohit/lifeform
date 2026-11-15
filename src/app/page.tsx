import { AmbientField } from "@/components/welcome/ambient-field";
import { ConsentForm } from "@/components/welcome/consent-form";

// Welcome: a Server Component. Only the background canvas and the consent form are
// Client Components.

const EXPERIENCES = [
  {
    index: "01",
    name: "Explore",
    verb: "Visual",
    text: "A living world that shifts its colour, motion and rhythm with your pulse and breath.",
    accent: "text-teal-200",
    line: "from-teal-300/60",
  },
  {
    index: "02",
    name: "Understand",
    verb: "Insight",
    text: "Your measurements over time: averages, changes within a session, and comparisons between sessions.",
    accent: "text-indigo-200",
    line: "from-indigo-300/60",
  },
  {
    index: "03",
    name: "Create",
    verb: "Sound",
    text: "Original music composed on this device from the same patterns, live or from a past session.",
    accent: "text-amber-200",
    line: "from-amber-300/60",
  },
] as const;

const MEASURED = [
  { label: "Pulse rate", unit: "beats per minute" },
  { label: "Breathing rate", unit: "breaths per minute" },
  { label: "Heart-rate variability", unit: "only when the SDK reports it" },
] as const;

const PRIVACY = [
  "Video is analysed on this device by the Presage SmartSpectra SDK. It is never recorded or saved.",
  "The SDK goes online only to verify the licence key. Its usage telemetry is turned off.",
  "Only numeric session summaries are ever stored, and only on this device.",
] as const;

export default function WelcomePage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden">
      <AmbientField />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_40%,#0b1a1f_0%,#05070a_55%,#020304_100%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-mono text-xs tracking-[0.4em] text-zinc-400">LIFEFORM</span>
        <span className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 font-mono text-[11px] text-zinc-400 backdrop-blur">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-600" />
          Camera off
        </span>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="flex min-h-[78vh] flex-col items-center justify-center px-6 text-center">
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
            Camera-powered physiology
          </p>
          <h1 className="welcome-rise bg-linear-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text pl-[0.3em] text-[clamp(2.25rem,10vw,6rem)] font-extralight tracking-[0.3em] text-transparent sm:pl-[0.4em] sm:tracking-[0.4em]">
            LIFEFORM
          </h1>
          <p className="welcome-rise mt-8 max-w-xl text-lg leading-relaxed text-zinc-300 [animation-delay:150ms] sm:text-xl">
            Your body creates patterns. LIFEFORM turns those patterns into experiences you can{" "}
            <span className="text-teal-200">see</span>,{" "}
            <span className="text-indigo-200">understand</span>, and{" "}
            <span className="text-amber-200">hear</span>.
          </p>
          <a
            href="#begin"
            className="welcome-rise mt-12 font-mono text-xs uppercase tracking-[0.3em] text-zinc-400 transition-colors [animation-delay:300ms] hover:text-teal-200"
          >
            Start ↓
          </a>
        </section>

        {/* Three experiences */}
        <section aria-labelledby="experiences" className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
          <h2 id="experiences" className="sr-only">
            Three experiences
          </h2>
          <p className="mb-10 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Sit in front of your camera for a few minutes. One measurement session powers three
            experiences.
          </p>
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-800/80 md:grid-cols-3">
            {EXPERIENCES.map((x) => (
              <li key={x.index} className="relative flex flex-col gap-4 bg-zinc-950/80 p-7 backdrop-blur-sm">
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${x.line} to-transparent`}
                />
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-zinc-500">{x.index}</span>
                  <span className={`font-mono text-[11px] uppercase tracking-[0.25em] ${x.accent}`}>
                    {x.verb}
                  </span>
                </div>
                <h3 className="text-2xl font-light tracking-[0.2em] text-zinc-100 uppercase">{x.name}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{x.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Consent */}
        <section
          id="begin"
          aria-labelledby="begin-title"
          className="mx-auto grid w-full max-w-6xl scroll-mt-8 gap-10 px-6 pt-8 pb-24 sm:px-10 md:grid-cols-[1fr_1fr] md:gap-16"
        >
          <div className="flex flex-col gap-8">
            <div>
              <h2 id="begin-title" className="text-3xl font-light text-zinc-100">
                Before you begin
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                LIFEFORM reads tiny changes in your face and upper body through the camera.
                Here is exactly what that involves.
              </p>
            </div>

            <div>
              <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                What is measured
              </h3>
              <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
                {MEASURED.map((m) => (
                  <li key={m.label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                    <span className="text-zinc-200">{m.label}</span>
                    <span className="text-right text-zinc-500">{m.unit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                Your privacy
              </h3>
              <ul className="flex flex-col gap-3 text-sm leading-relaxed text-zinc-400">
                {PRIVACY.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-teal-300/70" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-8 self-center rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-8 backdrop-blur-sm">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-teal-200/70">
                Camera consent
              </span>
              <p className="text-sm leading-relaxed text-zinc-400">
                For the best reading, face a soft, even light and keep still. The next screen
                helps you position yourself and check the picture.
              </p>
            </div>
            <ConsentForm />
          </div>
        </section>
      </main>

      <footer className="relative z-10 flex flex-col gap-2 border-t border-zinc-900 px-6 py-6 text-xs text-zinc-600 sm:flex-row sm:justify-between sm:px-10">
        <span>Not a medical device. Readings are for creative and personal exploration only.</span>
        <span>The animation on this page is a preview, not your data.</span>
      </footer>
    </div>
  );
}
