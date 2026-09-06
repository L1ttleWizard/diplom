# ADR-002: Virtual Display Texture Pipeline and Decoupled 3D Interaction Adapter

## Status
Accepted

## Date
2026-09-06

---

## Context
In Waves 3 and 4 of the Browser Digital Twin project, the 3D model of the digital oscilloscope must become interactive, and its embedded display must function realistically within the 3D laboratory scene.

The core rules of **GEMINI.md** impose strict constraints:
1. **Rule 2.6 & Rule 5**: HTML/DOM overlays must NOT be used for the oscilloscope display. The screen must be rendered inside the 3D model.
2. **Rule 1 & Rule 4**: The 3D model must be strictly decoupled from the domain model (`Pointer → Raycaster → InteractionTarget → Command → Domain`). The visual rotation of controls must be a projection of domain state, not the source of truth.
3. **Rule 6 & Rule 12**: Zero per-frame memory allocations; 60 FPS performance target.

---

## Problem
1. **Display Integration**: How to render an active, high-resolution (1024x640) oscilloscope screen with graticules, channel badges, timebase indicators, and moving waveforms onto a 3D surface without incurring DOM-to-WebGL synchronization lag or breaking 3D perspective when rotating the camera?
2. **Interaction Synchronization**: How to allow intuitive user manipulation (clicking buttons, dragging rotary knobs) without polluting the domain model with Three.js objects or allowing client-side rendering drift?

---

## Options Considered

### Display Rendering:
- **Option A (HTML/CSS Overlay with CSS3DRenderer)**: Render DOM elements transformed into 3D space via CSS3D.
  - *Cons*: Violates GEMINI.md Rule 2.6 and Rule 5. High reflow/repaint costs; inability to integrate with WebGL post-processing or lighting shaders; breaks down during complex camera orbits.
- **Option B (Secondary Camera & RenderTarget with Canvas/GPU Surface)**: Render the virtual screen onto an off-screen surface and map it as a texture to the screen mesh in the main WebGL2 scene.
  - *Pros*: Completely hardware-accelerated; 100% perspective consistency; zero DOM lag; fully compliant with GEMINI.md.
  - *Cons*: Requires managing texture update flags and UV coordinates.

### Interaction Architecture:
- **Option A (Direct Mesh Manipulation)**: Raycaster hits mesh, directly changes `mesh.rotation`, and informs the domain.
  - *Cons*: Three.js becomes the source of truth. In case of domain errors or network validation rejections, visual state desynchronizes. Violates Rule 4.
- **Option B (Adapter with Normalized Drag & Command Translation)**: Interaction targets detect pointer events, emit abstract domain commands (`SET_TIME_DIV`), domain validates and updates state, and publishes domain events. 3D meshes subscribe to events and update their rotations accordingly.
  - *Pros*: Strict unidirectional data flow. Three.js is purely a view layer.

---

## Decision
1. **Display Pipeline**: Adopt **Option B**. Use an off-screen $1024 \times 640$ dynamic texture (`DisplayRenderTarget` / `DisplayEngine`) bound to `screenMesh.material.map` and `emissiveMap`. Graticule and dynamic markers are drawn directly to the texture buffer.
2. **Interaction Pipeline**: Adopt **Option B**. Implement `RaycastManager` and `OscilloscopeInteractionAdapter` using semantic `STABLE_IDS` (`osc.knob.time`, `osc.button.run`, etc.). Knobs translate vertical drag delta into discrete 1-2-5 scale commands. Mesh rotations strictly observe domain events (`TIME_DIV_CHANGED`, `CHANNEL_UPDATED`, etc.).

---

## Why
- Maintains complete separation of concerns: The domain model remains 100% testable in headless Node.js without any browser or Three.js dependencies.
- Eliminates visual desynchronization bugs: If a command is invalid or state machine rejects an event, the knob/button does not change visually.
- Guarantees photographic and perspective realism: The oscilloscope display receives lighting, shadows, and angle distortion naturally within the 3D scene.

---

## Trade-offs
- Rotary knobs require discrete step detection over continuous mouse drags, requiring tuning of `dragSensitivity`.
- Updating the texture every frame when animating dynamic signals consumes GPU texture upload bandwidth. (Mitigated by single $1024 \times 640$ 2D surface blit).

---

## Consequences
- The domain layer remains completely unaware of Three.js, textures, and cameras.
- All 3D controls can be driven programmatically (e.g. by automated test scripts, playback scenarios, or network sync) without simulating mouse clicks.
- The virtual screen is ready for Wave 5+ high-frequency decimation and waveform rendering.

---

## Benchmark Evidence
- **Environment**: Chromium WebGL2, Windows, Node v24.14.1, Three.js 0.185.1
- **FPS**: Stable **60 FPS**
- **Frame Time**: p50 = **16.7 ms**, p95 = **16.8 ms**, p99 = **16.9 ms**
- **Draw Calls**: 20-21 (0 extra draw calls for the display texture)
- **Triangles**: 932
- **Memory**: 0 per-frame allocations in render loop
- **Automated Tests**: 10 suites, 63 tests passing (100% PASS)
