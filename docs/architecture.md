# System Architecture: Browser Digital Twin

## 1. High-Level Architecture Overview

The project is an interactive 3D digital twin of a laboratory measurement bench featuring a dual-channel digital storage oscilloscope, programmable signal generator, and circuit components.

### Core Architectural Split (GEMINI.md Rule 1)

The system enforces a strict barrier between the **Control Plane** and the **Data Plane**:

```
 CONTROL PLANE                                   DATA PLANE
┌────────────────────────┐                     ┌───────────────────────────┐
│       User UI          │                     │ Virtual Signal Generator  │
│  (3D Mesh / Hotkeys)   │                     │ (Analytical / SPICE/WASM) │
└───────────┬────────────┘                     └─────────────┬─────────────┘
            │ Pointer/Events                                 │
            ▼                                                │ 1-5 MSPS logical samples
┌────────────────────────┐                                   ▼
│    Raycast Adapter     │                     ┌───────────────────────────┐
│ (Normalized Drag/Click)│                     │    Acquisition Engine     │
└───────────┬────────────┘                     │ (Circular Buffers, Trigger)│
            │ Typed Commands                                 │
            ▼                                                │ Block-driven transfer
┌────────────────────────┐                                   ▼
│   OscilloscopeService  │                     ┌───────────────────────────┐
│     (Application)      │                     │     DSP / Decimation      │
└───────────┬────────────┘                     │  (Min/Max, Peak Detect)   │
            │ Mutates                                        │
            ▼                                                │ Decimated display points
┌────────────────────────┐                                   ▼
│   Domain Aggregates    │                     ┌───────────────────────────┐
│ (Oscilloscope, States) │                     │       Display Engine      │
└───────────┬────────────┘                     │    (Offscreen Texture)    │
            │ Emits Events                                   │
            ▼                                                │ 60 FPS Texture upload
┌────────────────────────┐                                   ▼
│       EventBus         │═════════════════════▶┌───────────────────────────┐
│  (State Synchronizer)  │                      │    Three.js 3D Screen     │
└────────────────────────┘                      │   (MeshStandardMaterial)  │
                                                └───────────────────────────┘
```

---

## 2. Directory Structure & Module Boundaries

| Directory | Layer Responsibility | Prohibited Dependencies |
| :--- | :--- | :--- |
| `src/domain/` | Core entities, value objects, state machines, commands, and events. | **React, Three.js, DOM APIs, Canvas, WebGL** |
| `src/application/` | Application services, use-cases, and event brokers. | **React, Three.js, direct DOM rendering** |
| `src/rendering/` | Three.js WebGL2 runtime, camera, lighting, display texture engine, interaction adapter. | **Domain business mutations** (must use typed commands) |
| `src/data/` | High-frequency ring buffers, SharedArrayBuffer, memory pools. | **React state** |
| `src/workers/` | Simulation worker, DSP worker, worker communication protocols. | **DOM, UI libraries** |
| `src/wasm/` | WebAssembly modules for heavy numerical analysis. | **UI frameworks** |
| `src/storage/` | IndexedDB, experiment state persistence. | **None** |

---

## 3. Subsystem Descriptions

- **Domain Model**: Detailed in [domain-model.md](./architecture/domain-model.md).
- **Control Plane**: Detailed in [control-plane.md](./architecture/control-plane.md).
- **3D Rendering Runtime**: Detailed in [3d-rendering.md](./architecture/3d-rendering.md).
- **Oscilloscope Interaction**: Detailed in [3d-oscilloscope-interaction.md](./architecture/3d-oscilloscope-interaction.md).
- **Virtual Display Subsystem**: Detailed in [oscilloscope-display.md](./architecture/oscilloscope-display.md).
- **Deterministic Signal Engine**: Detailed in [signal-engine.md](./architecture/signal-engine.md).
- **Acquisition & ADC Model**: Detailed in [acquisition-adc-model.md](./architecture/acquisition-adc-model.md).
- **Runtime Topology**: Detailed in [runtime-topology.md](./architecture/runtime-topology.md).
