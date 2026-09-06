# Project Changelog

## [Wave 11] - 2026-09-06
### Added
- Architectural evaluation comparing Rust/WASM vs. C/C++/WASM across 8 criteria (build complexity, binary size, boundary cost, SIMD, debugging, tooling, maintainability, team familiarity).
- Selected Freestanding C-ABI via WABT (`wabt` npm package) for zero-dependency reproducibility and ultra-compact 884-byte binary footprint.
- Mathematical reference C specification `src/wasm/dsp_kernel.c` and WebAssembly Text module `src/wasm/dsp_kernel.wat`.
- Reproducible build pipeline in `scripts/build-wasm.mjs` generating `src/wasm/dsp_kernel.wasm` and TypeScript base64 loader `src/wasm/dsp_kernel_binary.ts` via `pnpm run build:wasm`.
- Explicit C-ABI exports: `dsp_init`, `dsp_get_input_buffer_ptr`, `dsp_get_output_buffer_ptr`, `dsp_compute_stats`, `dsp_peak_detect_decimate`.
- Linear memory model (1 MB initial, auto-expandable to 16 MB via `memory.grow`) with segmented offsets for stats struct, decimation output buckets, and ADC sample buffer.
- TypeScript wrapper `WasmDspEngine` (`src/wasm/WasmDspEngine.ts`) implementing `IWasmDspEngine` with automated memory expansion and typed `WasmDspError` handling.
- Pure JavaScript reference implementation `JsDspEngine` (`src/wasm/JsDspEngine.ts`) for cross-validation, baseline benchmarking, and runtime fallback.
- 13 automated unit tests (`tests/wasm/wasm-dsp.test.ts`) validating lifecycle, analytical precision (DC, Sine, Square), peak-detect narrow spike preservation, and dynamic memory growth.
- Comparative benchmarks (`tests/wasm/wasm-vs-js.benchmark.test.ts`):
  - `computeStats` (100k samples): WASM achieves **1449.5 MSPS** (0.069 ms) vs 777.4 MSPS in JS — **1.86x faster**.
  - `peakDetectDecimate` (100k samples $\to$ 1k buckets): WASM achieves **1241.1 MSPS** (0.081 ms).
  - `peakDetectDecimate` (500k samples $\to$ 2k buckets, 5 MSPS scale): WASM takes **0.376 ms** (1328.8 MSPS), consuming only **2.25% of the 60 FPS frame budget (16.67 ms)**.
- Full architectural and API documentation:
  - `docs/architecture/dsp-wasm-abi.md`
  - `docs/decisions/2026-09-06-ADR-008-wasm-toolchain-and-dsp-core.md`
  - Updates to `docs/architecture/workers-and-wasm.md`, `docs/setup.md`, `docs/api.md`, `docs/architecture.md`, `docs/testing/benchmark-history.md`.

## [Wave 10] - 2026-09-06
### Added
- SharedArrayBuffer Data Plane implementation for high-frequency dual-channel sample streaming between Acquisition Worker and consumers.
- Cross-Origin Isolation configuration in `vite.config.ts` (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`).
- Runtime capability detector `SharedMemoryCapability` (`src/data/shared/SharedMemoryCapability.ts`) verifying SAB, Atomics, cross-origin isolation, and safe allocation.
- Binary memory layout `SharedRingBufferLayout` (`src/data/shared/SharedRingBufferLayout.ts`) with 128-byte control header (magic, version, capacity, monotonic indices, sequence, flags) and 128-byte aligned CH1/CH2 Float32Array regions.
- SPSC lock-free writer `SharedRingBufferProducer` (`src/data/shared/SharedRingBufferProducer.ts`) using Store-Release Atomics fences.
- Non-blocking reader `SharedRingBufferConsumer` (`src/data/shared/SharedRingBufferConsumer.ts`) using Load-Acquire Atomics fences, strictly avoiding `Atomics.wait` on the main browser thread.
- Unified transport facade `DataPlaneTransport` (`src/data/shared/DataPlaneTransport.ts`) supporting transparent fallback to `MessagePassingTransport` when cross-origin isolation is not configured.
- Acquisition Worker integration: writes samples directly to SAB and delivers lightweight metadata notifications with 0 transferred buffers.
- HUD UI indicators in `index.html` and `src/main.ts`: Transport Mode (SharedArrayBuffer vs Fallback) and Cross-Origin isolation status.
- 20 new tests across 4 suites: capability detection, SPSC streaming, wrap-around, overflow/underrun, 10M soak test (>80 MSPS), fallback equivalence, and comparative postMessage vs SAB benchmark (175 total repository tests passing).
- Measured performance gains: 100% elimination of GC allocation churn (from 7.63 MB/M down to 0 bytes), >14x higher throughput (up to 207 MSPS), and stable 60 FPS in live browser.
- Documentation: `docs/architecture/shared-array-buffer.md`, `docs/decisions/2026-09-06-ADR-007-shared-array-buffer-data-plane.md`.

## [Test Bench Milestone] - 2026-09-06
### Fixed
- Fixed static diagnostic waveform stub in `DynamicDisplayLayer` that ignored domain state and 3D knob inputs.
- Restored end-to-end signal flow from `SignalGenerator` (1 kHz, 1 V, 1 MSPS) -> `BoundedRingBuffer` -> `Trigger Comparator` -> `Window Decimator` -> `DisplayBuffer` -> `DynamicDisplayLayer` -> Three.js 3D Screen Texture.
- Synchronized 3D knob mesh rotations (`knob.rotation.z`) with domain aggregate state events (`TimeBaseChangedEvent`, `VoltsPerDivChangedEvent`).
- Added real-time HUD telemetry overlay displaying physical signal frequency, amplitude, sample rate, time/div, volts/div, trigger level, window duration, and trigger lock state.
- Created `tests/application/test-bench.test.ts` with 7 automated end-to-end tests validating metrological invariants and 3D pointer drag interactions (155 total repository tests passing).
- Created `docs/testing/test-bench.md` and `docs/architecture/control-to-display-flow.md`.

## [Wave 9] - 2026-09-06
### Added
- Bounded circular sample ring buffer (`BoundedRingBuffer`) in `src/data/BoundedRingBuffer.ts` utilizing power-of-two capacity ($2^K$) and branchless bitwise masking (`idx & mask`).
- Monotonic 64-bit cumulative pointer arithmetic (`_writeIndex`, `_readIndex`), eliminating index wrap ambiguity and supporting continuous 5 MSPS acquisition for up to 57,000 years.
- Explicit configurable overflow policies: `OVERWRITE` (default circular push), `DROP` (tail drop), `ERROR` (`RingBufferOverflowError`).
- Explicit configurable underflow policies: `PARTIAL` (default non-blocking drain), `ZERO_FILL` (0.0 padding for DSP), `ERROR` (`RingBufferUnderflowError`).
- Non-destructive query APIs (`peek`, `readLatest`, `readWindow`) tailored for trigger detection and display decimation.
- Strict Zero-Allocation Invariant: 0 bytes heap allocations on all write and read paths.
- Backward compatibility layer (`SampleRingBuffer`) extending `BoundedRingBuffer` for seamless interop with Wave 7 and Wave 8 components.
- Exhaustive test suite with 17 tests (`tests/data/ring-buffer.test.ts`): empty, full, single element, boundary wrap, 100x wrap-around, fast reader, fast writer, all policies, long-running soak test, and zero-allocation throughput benchmark.
- 10,000,000-sample randomized burst soak test streaming at **> 300 MSPS** with zero sequence drift ($V_k = V_{k-1} + 1$) and flatline heap memory.
- Zero-allocation benchmark achieving **> 430 Mops/sec** throughput (1.71 – 2.33 ms per 1,000,000 samples).
- Full Data Plane architecture document: `docs/architecture/data-plane.md`.
- Architectural Decision Record: `docs/decisions/2026-09-06-ADR-006-bounded-sample-ring-buffer.md`.

## [Wave 8] - 2026-09-06
### Added
- Dedicated background Web Worker (`acquisition.worker.ts`) and headless core (`AcquisitionWorkerCore`) for continuous signal synthesis and ADC acquisition.
- Versioned worker communication protocol (`PROTOCOL_VERSION = 1`) with typed commands (`INIT`, `START`, `STOP`, `CONFIGURE`, `RESET`) and events (`INITIALIZED`, `BATCH_PRODUCED`, `CONFIGURED`, `STATE_CHANGED`, `ERROR`).
- Zero-copy batch transfer via Transferable `ArrayBuffer` (`[ch1Buf.buffer, ch2Buf.buffer]`), eliminating JSON serialization and memory copy costs.
- Main-thread worker management facade (`AcquisitionWorkerClient`) with startup handshake timeout, clean shutdown, and automatic state resynchronization on worker restart.
- In-process worker adapter (`InProcessWorkerPort`) enabling automated headless worker testing without browser DOM `Worker`.
- Dev testbed UI integration in `src/main.ts` and `index.html` with real-time worker telemetry (status, throughput MSPS, latency, START/STOP and RESTART controls).
- Performance benchmarking proving >97% reduction in main-thread compute burden (from ~10 ms down to < 0.2 ms) and maintaining rock-solid 60 FPS 3D rendering with zero UI freezes.
- 12 automated unit and benchmark tests for protocol validation, lifecycle transitions, state recovery, and throughput (131 total tests passing).
- Comprehensive architectural documentation `docs/architecture/workers-and-wasm.md`.
- Architectural Decision Record `docs/decisions/2026-09-06-ADR-005-acquisition-worker-protocol.md`.

## [Wave 7] - 2026-09-06
### Added
- Analog Front End model (`AnalogFrontEnd`) featuring AC/DC/GND coupling, 1X/10X probe attenuation, vertical gain ($A_v = 1/\text{voltsPerDiv}$), channel offset, 1st-order RC bandwidth limiter, Box-Muller Gaussian thermal noise, and analog rail saturation.
- Physical ADC quantizer model (`ADCModel`) with configurable resolution (8-16 bits), uniform mid-tread transfer curve, LSB step derivation ($q = 2 V_{\text{FS}} / 2^N$), and overflow/underflow clipping indicators.
- Multi-rate logical sample rate support: 1 MSPS, 2 MSPS, and 5 MSPS.
- Isolated dual-channel acquisition (`AcquisitionChannel`) for CH1 and CH2 with zero crosstalk.
- Multi-channel acquisition coordinator (`AcquisitionEngine`) synchronized to `SimulationClock`.
- High-performance Data Plane ring buffer (`SampleRingBuffer`) with power-of-two capacity, branchless bitwise masking, and zero heap allocations.
- Mathematical reference test suite with 20 tests verifying DC linearity, probe attenuation, offset subtraction, AC coupling high-pass, bandwidth limiter ($-3.01\text{ dB}$ at $f_c$), clipping, quantization, noise, and 14.82 MSPS dual-channel throughput (119 total tests passing).
- Comprehensive physical documentation: `docs/architecture/acquisition-adc-model.md`.
- Architectural Decision Record: `docs/decisions/2026-09-06-ADR-004-acquisition-adc-physical-model.md`.

## [Wave 6] - 2026-09-06
### Added
- Deterministic simulation clock (`SimulationClock`) deriving time from integer sample counter: $t = n / f_s$ with zero cumulative drift over millions of samples.
- Reference signal generator (`SignalGenerator`) supporting 7 waveforms: `SINE`, `SQUARE`, `TRIANGLE`, `SAW`, `PULSE`, `DC`, `NOISE`.
- Pure analytical instantaneous voltage evaluation $V(t)$ with continuous phase offset and duty cycle support ($0..100\%$).
- Phase boundary guard rounding normalized cycle position to $10^{-12}$ precision, eliminating edge roundoff jitter.
- Seeded pseudo-random noise generator (`DeterministicRandom`) utilizing 32-bit Mulberry32 PRNG for reproducible test runs.
- High-frequency batch synthesis (`generateBatch`) supporting preallocated `Float32Array` buffers with zero per-batch allocations and **30.33 MSPS** throughput.
- Comprehensive Golden Vectors suite (`GoldenVectors`) with analytical waveform scenarios and measurement utilities (`measureVpp`, `measurePeriod`, `measureDutyCycle`, `findZeroCrossings`).
- Boundary cases support: $f=0\text{ Hz}$ DC hold, Nyquist limit $f = f_s / 2$, sub-Hertz frequencies, extreme duty cycles, and phase wrap-around.
- 27 automated unit tests for simulation clock, PRNG, signal generator, golden vectors, edge cases, and high-frequency throughput (99 repository tests passing).
- Architectural documentation: `docs/architecture/signal-engine.md`.
- Architectural Decision Record: `docs/decisions/2026-09-06-ADR-003-deterministic-signal-engine.md`.

## [Wave 5] - 2026-09-06
### Added
- Cached static graticule layer (`StaticGridLayer`) with 10x8 divisions, 0.2 div minor sub-ticks, center crosshairs, outer bezel frame with corner brackets, perimeter division markers, and static labels.
- Off-screen static caching engine preventing per-frame graticule rebuilds and reducing CPU overhead by >90%.
- Dynamic overlay layer (`DynamicDisplayLayer`) with real-time trigger level marker and threshold line, time cursors ($t_A, t_B, \Delta t, 1/\Delta t$), voltage cursors ($V_1, V_2, \Delta V$), automated measurements HUD table (Vpp, Vrms, Freq, Period), and dynamic scale readouts.
- Display Device Pixel Ratio (DPR) scaling (1.0x, 1.5x, 2.0x) with crisp physical backing canvas resolution.
- Dynamic viewport resizing and coordinate system tracking.
- Test suite with 14 display tests including caching assertions, geometry verification, and CPU execution time benchmarks (72 total tests passing).
- Devbed HUD controls for DPR switching (1.0x, 1.5x, 2.0x), cursor toggling, measurement HUD toggling, and RUN/STOP commands.
- Updated display architecture documentation `docs/architecture/oscilloscope-display.md`.

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
