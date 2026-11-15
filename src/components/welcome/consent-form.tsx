"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { giveCameraConsent } from "@/features/privacy/consent";

/** Explicit camera consent. The camera is not opened here; the Setup page does that. */
export function ConsentForm() {
  const router = useRouter();
  const checkboxId = useId();
  const [agreed, setAgreed] = useState(false);

  function begin(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;
    giveCameraConsent();
    router.push("/setup");
  }

  return (
    <form onSubmit={begin} className="flex flex-col gap-5">
      <label
        htmlFor={checkboxId}
        className="group flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-zinc-300"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-zinc-600 transition-colors group-hover:border-teal-300/70 peer-checked:border-teal-300 peer-checked:bg-teal-300/15 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-300/60"
        >
          <svg
            viewBox="0 0 16 16"
            className={`size-3.5 text-teal-200 transition-opacity ${agreed ? "opacity-100" : "opacity-0"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          I allow LIFEFORM to use my camera to measure pulse and breathing during this
          session. I can stop at any time.
        </span>
      </label>

      <button
        type="submit"
        disabled={!agreed}
        className="group relative inline-flex h-12 items-center justify-center gap-3 overflow-hidden rounded-full bg-teal-200 px-8 text-sm font-medium tracking-wide text-zinc-950 transition-all hover:bg-teal-100 hover:shadow-[0_0_40px_-8px_rgba(94,234,212,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
      >
        Begin measurement setup
        <span aria-hidden="true" className="transition-transform group-enabled:group-hover:translate-x-1">
          →
        </span>
      </button>
      <p className="text-xs text-zinc-500">
        The camera turns on only on the next screen, after you press its button.
      </p>
    </form>
  );
}
