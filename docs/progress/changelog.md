# Project Changelog

## [Wave 4] - 2026-09-06
### Added
- Virtual oscilloscope display engine (`DisplayEngine`) with calibrated 10x8 graticule, central tick marks, channel and trigger markers.
- Off-screen dynamic texture pipeline (`DisplayRenderTarget`) bound to `MeshStandardMaterial` of `oscilloscope_screen` mesh.
- Formalized 3-tier coordinate systems: Display pixels, screen-local coordinates, and world space.
- Dynamic diagnostic waveform pattern with phase animation in RUN state and freeze on STOP.
- Zero-DOM overlay architecture: screen rendered entirely inside WebGL2 3D mesh.
- Architectural documentation: `docs/architecture/oscilloscope-display.md`.
- Architectural Decision Record: `docs/decisions/2026-09-06-ADR-002-virtual-display-and-3d-interaction.md`.

## [Wave 3] - 2026-09-06
### Added
- Standardized stable semantic IDs (`STABLE_IDS`) across oscilloscope physical mesh hierarchy.
- Pointer interaction pipeline: `RaycastManager` with NDC normalized raycasting, hover, click, drag lifecycle events.
- Command translation adapter `OscilloscopeInteractionAdapter` converting normalized mouse dragging into 1-2-5 scale commands.
- Visual rotation as representation: Knobs observe domain events (`TIME_DIV_CHANGED`, `CHANNEL_UPDATED`) rather than direct mouse position.
- Unit tests for RaycastManager and OscilloscopeInteractionAdapter (63 total unit tests passing).
- Architectural documentation: `docs/architecture/3d-oscilloscope-interaction.md`.

## [Wave 2] - 2026-09-06
### Added
- Three.js 3D Scene Foundation and WebGL2 renderer bootstrap.
- Standardized scene hierarchy (`lab_root` with environment, lighting, oscilloscope, generator, circuit).
- Three-point studio lighting with PCFSoftShadowMap shadows.
- CameraManager with Orbit, Zoom, Pan, Reset controls and pole clamp protection.
- ResizeController with ResizeObserver and window fallback.
- RenderLoop with Zero Per-Frame Allocations.
- AssetLifecycle with geometry and material caching and recursive disposal.
- GLTFAssetLoader with procedural fallback on missing assets.
- LabSceneBuilder creating physical oscilloscope body, display mesh, knobs, BNC jacks, and buttons.
- PerformanceMonitor with real-time sliding percentile calculations (p50/p95/p99) and Three.js draw call tracking.
- Interactive dev testbed (`index.html`, `src/main.ts`) with floating HUD overlay and quality tier switcher.
- Automated tests for CameraManager, AssetLifecycle, PerformanceMonitor, and SceneHierarchy (54 tests passing).
- Architecture documentation `docs/architecture/3d-rendering.md`.

## [Wave 1] - 2026-09-06
### Added
- Greenfield repository initialization with Git, TypeScript, and Vitest.
- Layered directory structure: `domain`, `application`, `rendering`, `data`, `workers`, `wasm`, `storage`.
- 8 core domain entities: `Oscilloscope`, `Channel`, `Trigger`, `Acquisition`, `Measurement`, `SignalSource`, `Circuit`, `Experiment`.
- 1-2-5 scale value objects: `TimeDiv` (10ns..5s), `VoltDiv` (1mV..10V).
- Finite State Machine: `OscilloscopeStateMachine` with transitions `IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED` and `ERROR` handling.
- Typed command model: `RUN`, `STOP`, `SET_TIME_DIV`, `SET_VOLT_DIV`, `SET_TRIGGER_LEVEL`, `SET_TRIGGER_MODE`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`.
- Domain events and `EventBus` pub/sub implementation.
- Application facade `OscilloscopeService` for command execution and event publishing.
- Architectural boundary checking script `scripts/check-boundaries.mjs`.
- 39 automated unit tests running in pure Node environment without DOM or Three.js.
- Architectural documentation: `domain-model.md`, `control-plane.md`, `runtime-topology.md`.
- Architectural Decision Record: `ADR-001`.
