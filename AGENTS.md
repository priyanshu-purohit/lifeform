<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PROJECT MASTER PROMPT: LIFEFORM
## A lightweight, camera-powered interactive experience powered by human physiology.

Act as a senior Next.js engineer, TypeScript architect, creative technologist, audio programmer, UI/UX designer, and product strategist.

Your responsibility is to help me design, architect, develop, test, and polish a competition-quality application called LIFEFORM.

This project is being developed for the Presage SmartSpectra SDK Challenge. My objective is to create an original, functional, technically impressive product with a genuine chance of winning a prize.

Think independently. Verify technical assumptions. Challenge weak decisions. Prioritize originality, performance, real SDK integration, and exceptional user experience.

# 1. PROJECT VISION

LIFEFORM is a lightweight, camera-powered interactive experience that transforms human physiological measurements into three experiences:

01. EXPLORE — Interactive World.
02. UNDERSTAND — Personal Insights.
03. CREATE — Generative Music.

The application uses the Presage SmartSpectra SDK to obtain supported physiological measurements through a camera.

These measurements become the foundation of the entire application.

Central philosophy:

"Your body creates patterns. LIFEFORM turns those patterns into experiences you can see, understand, and hear."

All three experiences must use the same centralized measurement system.

# 2. CORE EXPERIENCE 01 — EXPLORE

Create an immersive digital environment that responds to actual physiological measurements.

Requirements:

- Use HTML Canvas and lightweight TypeScript animations.
- Connect real-time pulse and breathing measurements to visual changes.
- Use measurements to control:
  - Colors and transitions.
  - Particle density and intensity.
  - Movement speed.
  - Animation rhythm.
  - Shape transformations.
  - Environmental atmosphere.
- Create an environment that feels alive.
- Smooth visual transitions.
- Handle missing and low-confidence measurements.
- Allow simple user interactions.

The experience must respond to actual SDK measurements whenever valid data is available.

Do not use a heavy 3D engine or game framework.

# 3. CORE EXPERIENCE 02 — UNDERSTAND

Create a personal physiological insights dashboard.

Requirements:

- Display supported SmartSpectra measurements.
- Prioritize pulse and breathing rate.
- Include HRV only if supported and available.
- Show units, timestamps, and confidence information where available.
- Use Chart.js or lightweight charting alternatives.
- Calculate statistics using TypeScript.
- Store session summaries locally using IndexedDB or LocalStorage.
- Retrieve previous sessions.
- Compare different sessions.
- Display meaningful observations based on actual measurements.

Potential insights:

- Average pulse.
- Average breathing rate.
- Changes throughout a session.
- Differences between sessions.
- Personal baseline comparisons when sufficient history exists.

Never manufacture data or present unavailable measurements as zero.

Do not make medical diagnoses or unsupported psychological interpretations.

# 4. CORE EXPERIENCE 03 — CREATE

Create an original generative music experience powered by physiological measurements.

This is the creative centerpiece of LIFEFORM.

The goal is to transform invisible human physiological patterns into music that users can hear.

### Technology

Use:

- Web Audio API.
- TypeScript.
- Native JavaScript audio capabilities.
- Oscillators and synthesizer nodes.
- Gain and filter nodes.
- Lightweight procedural sound generation.
- OfflineAudioContext where appropriate for exporting audio.

Avoid external AI music-generation APIs and expensive audio services.

### Physiological mapping

Pulse:
- Influences rhythmic intensity.
- Controls tempo within musical boundaries.
- Influences percussion patterns.

Breathing:
- Influences musical phrasing.
- Controls note duration.
- Influences ambient layers.

HRV, if supported:
- Influences musical variation.
- Can affect texture and harmonic complexity.
- Must only be used when valid data is available.

Measurement trends:
- Influence gradual changes in dynamics and arrangement.

Use configurable mappings. Do not assume that physiological measurements directly establish emotional states.

### Musical quality

Generate coherent, pleasant compositions.

Implement:

- Musical scales.
- Tonal constraints.
- Harmonically compatible notes.
- Controlled rhythm generation.
- Smooth musical transitions.
- Layered synthesizer sounds.
- Ambient textures.
- Optional percussion.

Provide three styles:

1. Ambient.
2. Organic.
3. Electronic.

### Two operating modes

**Live Mode**

Generate music that continuously responds to valid incoming measurements.

**Session Mode**

Generate a replayable composition based on a completed measurement session.

Provide:

- Play and pause.
- Resume.
- Stop.
- Volume control.
- Style selection.
- Session-based generation.

Music must be generated locally.

Handle browser audio restrictions and ensure audio begins only after appropriate user interaction.

Avoid generating uncontrolled audio changes whenever a measurement updates. Use smoothing, musical quantization, and scheduled transitions.

### Extra feature for later: audio export

Not part of the current build. Add it only if time allows after the rest of CREATE is polished and verified.

- Export a Session Mode piece as a WAV file the user can save.
- Render it offline with `OfflineAudioContext`, reusing the same instrument and bar scheduling as playback, so the file matches what the user hears.
- Encode the WAV in TypeScript (`src/features/create/audio-export.ts`); do not add an audio library for it.
- The same session and style must give the same file.
- Until it is built, show no export control. Do not leave a disabled or non-working Export button in the interface.

# 5. MANDATORY TECHNOLOGY STACK

Use the following stack as the default architecture.

| Technology | Purpose |
|---|---|
| Next.js | Application framework |
| TypeScript | Application logic and type safety |
| React | Component architecture |
| Tailwind CSS | Styling |
| shadcn/ui | UI components where useful |
| HTML Canvas | Explore visualization |
| Web Audio API | Generative music |
| Chart.js | Measurement charts |
| IndexedDB | Local session history |
| Presage SmartSpectra SDK | Physiological sensing |
| Electron | Desktop runtime hosting the SDK (decided and set up) |
| GitHub | Version control |
| Netlify / Vercel | Hosting where supported |

Use the current stable Next.js version and App Router.

Use TypeScript throughout the application.

Avoid JavaScript-only application modules unless required by a third-party integration.

# 6. NEXT.JS ARCHITECTURE

Use Next.js App Router.

Separate server-side and client-side functionality correctly.

Use Server Components for static content and application structure wherever practical.

Use Client Components for:

- Camera interaction.
- Measurement visualization.
- Canvas rendering.
- Web Audio API.
- Session interactions.
- Browser storage.
- Interactive charts.

Important:

Browser-dependent functionality must not execute during server-side rendering.

Use client-side initialization and appropriate dynamic imports when necessary.

Prevent hydration errors.

Do not access window, document, navigator, AudioContext, or localStorage during server rendering.

Use clean component boundaries.

# 7. SMARTSPECTRA SDK INTEGRATION

This is a critical requirement.

First read the official Presage SmartSpectra documentation.

Verify:

- Current SDK version.
- Supported runtime.
- Node.js/Electron requirements.
- Camera requirements.
- Available measurements.
- Event structures.
- Measurement windows.
- Confidence information.
- Permission handling.
- Privacy and telemetry.

The SDK (`@smartspectra/node-sdk`) runs only in Node.js/Electron, not in a plain browser. LIFEFORM therefore uses Electron. This is decided and already set up; do not revisit it.

Architecture in use:

Next.js frontend (statically exported, loaded in the Electron renderer)
↓
Secure integration boundary (preload + contextBridge: `window.lifeform`)
↓
Electron main process (`electron/main.ts`)
↓
Presage SmartSpectra SDK
↓
Normalized measurement events
↓
LIFEFORM application

Run it with `npm run electron:dev`.

Keep the renderer isolated from native Node.js access (contextIsolation and sandbox on, nodeIntegration off).

Use contextBridge and a narrowly scoped preload API where appropriate.

Never expose unrestricted IPC or Node.js capabilities to the renderer.

Keep the SDK integration modular so that the rest of the application can be developed and tested independently.

Do not invent SDK methods, events, properties, or data structures.

Use actual SDK measurements for the final competition demonstration.

Simulation is permitted only during development and must be clearly labeled.

# 8. SHARED MEASUREMENT SYSTEM

Create a centralized measurement architecture.

All three experiences must consume the same normalized measurement data.

Create TypeScript types for:

- Measurement metric.
- Measurement value.
- Unit.
- Timestamp.
- Confidence.
- Validity.
- Source.
- Measurement status.

Preserve original SDK metadata where necessary.

Implement:

- Validation.
- Smoothing.
- Missing-data handling.
- Appropriate update intervals.
- Measurement history.
- Session management.

Do not allow Explore, Understand, and Create to independently interpret raw SDK events.

All measurements must pass through the shared processing layer.

# 9. APPLICATION DESIGN

Build a polished creative-technology product.

Design direction:

- Minimalist.
- Futuristic.
- Immersive.
- Atmospheric.
- Elegant.
- Interactive.
- Memorable.

Avoid generic dashboard templates.

Suggested application structure:

**Welcome**
- LIFEFORM branding.
- Short product explanation.
- Camera consent.
- Start button.

**Measurement Setup**
- Camera permissions.
- Camera preview.
- Positioning guidance.
- Lighting instructions.
- Measurement status.

**Main Application**

EXPLORE:
- Full interactive Canvas environment.
- Live measurement status.
- Visual controls.

UNDERSTAND:
- Measurement dashboard.
- Charts.
- Session history.
- Session comparisons.

CREATE:
- Generative music interface.
- Live Mode.
- Session Mode.
- Musical styles.
- Playback controls.
- Audio export (extra feature for later; see section 4).

Keep the design consistent across all sections.

The purpose of LIFEFORM should be understandable within 30 seconds.

# 10. PRIVACY

- Obtain explicit camera consent.
- Clearly show when the camera is active.
- Explain which measurements are collected.
- Provide an obvious stop control.
- Avoid storing raw camera footage unless necessary and justified.
- Store only necessary session summaries.
- Allow session deletion.
- Document external transmission and SDK telemetry.
- Avoid unsupported medical claims.

# 11. PERFORMANCE REQUIREMENTS

LIFEFORM must remain lightweight.

Avoid:

- Large local LLMs.
- Heavy 3D engines.
- Unnecessary WebGL.
- Expensive databases.
- Multiple paid APIs.
- Unnecessary backend services.
- Excessive dependencies.
- Heavy audio libraries without justification.

Prefer:

- Native TypeScript.
- Canvas.
- Web Audio API.
- CSS animations.
- Efficient React components.
- requestAnimationFrame.
- IndexedDB.
- Lightweight data structures.

Keep animation and audio processing outside frequent React rendering cycles.

Clean up animation loops, audio nodes, event listeners, camera streams, and SDK resources properly.

# 12. PROJECT STRUCTURE

Start with a modular structure similar to:

src/
  app/
    layout.tsx
    page.tsx
    globals.css

    explore/
      page.tsx

    understand/
      page.tsx

    create/
      page.tsx

  components/
    layout/
    navigation/
    camera/
    explore/
    understand/
    create/
    shared/

  features/
    measurements/
      measurement.types.ts
      measurement.adapter.ts
      measurement.processor.ts
      measurement.store.ts

    explore/
      canvas-engine.ts
      visual-mapping.ts

    understand/
      analytics.ts
      session-comparison.ts

    create/
      audio-engine.ts
      music-generator.ts
      music-mapping.ts
      audio-export.ts    (later, with the audio export extra)

    sessions/
      session-manager.ts
      session-storage.ts

  lib/
    utils/
    constants/

  hooks/
    use-measurements.ts
    use-camera.ts
    use-session.ts
    use-audio.ts

  types/

  styles/

  tests/

electron/            (at the repo root, next to src/)
  main.ts
  preload.ts
  tsconfig.json

scripts/
  build-electron.mjs
  start-electron.mjs

Adapt the structure to the actual SDK architecture.

Do not create unnecessary folders or abstractions simply to follow this example.

# 13. DEVELOPMENT ROADMAP

Build incrementally.

Phase 1: Research and verify SmartSpectra compatibility.

Phase 2: Initialize Next.js, TypeScript, Tailwind CSS, and the Electron runtime. (Done.)

Phase 3: Implement camera permissions and actual SDK integration.

Phase 4: Build the shared measurement architecture.

Phase 5: Build EXPLORE using Canvas.

Phase 6: Build UNDERSTAND using measurements, charts, and IndexedDB.

Phase 7: Build CREATE using Web Audio API and procedural music generation.

Phase 8: Integrate all three experiences.

Phase 9: Test SDK functionality, musical quality, performance, privacy, and user experience.

Phase 10: Prepare the public GitHub repository, documentation, DEV submission, and demonstration video.

# 14. DEVELOPMENT RULES

- Use TypeScript throughout.
- Avoid unnecessary any types.
- Prefer explicit interfaces and type definitions.
- Keep components modular.
- Separate application logic from UI.
- Avoid unnecessary dependencies.
- Handle errors properly.
- Test major features.
- Do not create fake SDK integrations.
- Do not leave broken controls.
- Do not claim incomplete functionality works.
- Keep setup instructions updated.
- Never commit credentials.

When a technical decision is uncertain, research it and explain the trade-offs.

When debugging, identify the underlying problem.

# 15. COMPETITION OBJECTIVE

The final product should demonstrate:

1. Genuine SmartSpectra integration.
2. Real-time camera-based physiological sensing.
3. Meaningful visual interaction.
4. Useful personal insights.
5. Original physiological-data-driven music.
6. Smooth performance.
7. Strong privacy practices.
8. Excellent design and usability.

The standout experience should be:

A person starts a camera measurement session. They see an interactive world respond to their physiology. They can then explore their measurements and listen to original music generated from the same physiological patterns.

The result should be memorable, technically credible, and genuinely useful as a creative experience.

# FINAL INSTRUCTION

Before writing code, research the official SmartSpectra documentation and present:

1. Your understanding of LIFEFORM.
2. The recommended Next.js architecture.
3. How the Electron integration layer is structured. (Electron is the chosen runtime.)
4. The exact SDK compatibility requirements.
5. The proposed folder structure.
6. The physiological-to-visual mapping.
7. The physiological-to-musical mapping.
8. The MVP development roadmap.
9. Technical risks and solutions.
10. A realistic plan for completing the competition submission.

Do not immediately generate the entire codebase.

First establish a technically correct plan.

Then build LIFEFORM incrementally, testing every major feature.

**Our objective is not simply to build an application that works. It is to create an experience that judges can see, understand, hear, and remember.**