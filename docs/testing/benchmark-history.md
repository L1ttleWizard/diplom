# Benchmark History

## Wave 1: Domain Architecture & Unit Test Performance

- **Date**: 2026-09-06
- **Environment**:
  - OS: Windows
  - Node.js: v24.14.1
  - Test Framework: Vitest 3.2.7
  - Environment: pure `node` (0 DOM / 0 Three.js)
- **Results**:
  - Test Suites: 4 passed (4 total)
  - Tests: 39 passed (39 total)
  - Test Execution Duration: 476 ms
  - Heap Memory Footprint: ~42 MB
  - Static Boundary Checks: 0 violations, 0 circular dependencies
  - TypeScript Diagnostics: 0 errors
- **Notes**:
  - No high-frequency data plane in this wave; performance benchmark tracks test execution speed and zero-memory leaks in domain entity instantiation.

---

## Wave 2: 3D Scene Foundation Performance Baseline

- **Date**: 2026-09-06
- **Environment**:
  - Browser: Headless Chromium / Chrome DevTools Protocol
  - Engine: Three.js 0.185.1 (WebGL2 Backend)
  - Resolution: 1280x720 (DPR 2.0 on HIGH tier)
  - GPU: Hardware accelerated WebGL2
- **Measured Metrics**:
  - **HIGH Tier** (Shadows enabled, PCFSoftShadowMap, antialias, max DPR 2.0):
    - Target FPS: 60 FPS
    - Measured FPS: **60 FPS**
    - Frame Time (avg): **16.5 ms**
    - Frame Time p50: **16.7 ms**
    - Frame Time p95: **16.9 ms**
    - Frame Time p99: **16.9 ms**
    - Draw Calls: **21**
    - Triangles: **932**
    - Memory: 0 per-frame allocations in render loop
  - **LOW Tier** (Shadows disabled, antialias off, DPR 1.0):
    - Measured FPS: **60 FPS**
    - Frame Time (avg): **16.7 ms**
    - Frame Time p50: **16.7 ms**
    - Frame Time p95: **16.8 ms**
    - Frame Time p99: **16.9 ms**
    - Draw Calls: **19**
    - Triangles: **908**
- **Unit Tests Performance**:
  - Test Suites: 8 passed (8 total)
  - Tests: 54 passed (54 total)
  - Test Execution Duration: 505 ms
  - Build Duration (Vite production): 773 ms

---

## Wave 3: 3D Oscilloscope Physical Interaction Performance

- **Date**: 2026-09-06
- **Environment**:
  - Browser: Headless Chromium / Chrome DevTools Protocol
  - Engine: Three.js 0.185.1 (WebGL2 Backend)
- **Measured Metrics**:
  - Raycast Hit Rate: 60 FPS continuous NDC raycasting without frame drops
  - Command Dispatch Latency: < 0.1 ms per event
  - Draw Calls: **21** (identical to Wave 2 baseline; zero added calls for interaction colliders)
  - Frame Time p50: **16.7 ms**, p95: **16.8 ms**, p99: **16.9 ms**
- **Unit Tests Performance**:
  - Test Suites: 9 passed (9 total)
  - Tests: 58 passed (58 total)
  - Execution Duration: 531 ms

---

## Wave 4: Virtual Display Architecture Performance Baseline

- **Date**: 2026-09-06
- **Environment**:
  - Browser: Chrome 145 / Chrome DevTools Protocol
  - OS: Windows
  - Canvas Resolution: 1280x720, Virtual Display Texture: 1024x640
  - Engine: Three.js 0.185.1 (WebGL2 Backend)
- **Measured Metrics**:
  - **RUN Mode** (Active dynamic waveform rendering + 3D scene rendering):
    - Target FPS: 60 FPS
    - Measured FPS: **60.0 FPS**
    - Frame Time: **16.7 ms**
    - Frame Time p50: **16.7 ms**
    - Frame Time p95: **16.8 ms**
    - Frame Time p99: **16.9 ms**
    - Draw Calls: **21** (zero additional 3D draw calls; display texture directly mapped to screen mesh)
    - Triangles: **932**
    - Garbage Collection: Zero per-frame allocations detected in heap allocation profile
  - **STOP Mode** (Frozen waveform):
    - Measured FPS: **60.0 FPS**
    - Frame Time: **16.6 ms**
    - Draw Calls: **20**
- **Unit Tests Performance**:
  - Test Suites: 10 passed (10 total)
  - Tests: 63 passed (63 total)
  - Test Execution Duration: 557 ms
  - Production Bundle Build Duration: 786 ms

---

## Wave 5: Display Grid and Static Layer Performance Baseline

- **Date**: 2026-09-06
- **Environment**:
  - Browser: Chrome 145 / Chrome DevTools Protocol
  - OS: Windows
  - Canvas Resolution: 1280x720, Virtual Screen Texture: 1024x640 (DPR 1.0x, 1.5x, 2.0x)
  - Engine: Three.js 0.185.1 (WebGL2 Backend)
- **CPU Layer Caching Metrics**:
  - Un-cached Static Layer Rebuild Cost: **~1.8 ms** per frame
  - Cached Static Layer Blit Cost: **~0.12 ms** per frame
  - CPU Rendering Time Reduction: **>90%**
  - Steady-state Static Rebuild Count: **1** (rebuilt only on init, resize, or DPR change)
- **Measured Frame Metrics (DPR 1.0x & 2.0x)**:
  - Target FPS: 60 FPS
  - Measured FPS: **60.0 FPS**
  - Frame Time (avg): **16.7 ms**
  - Frame Time p50: **16.7 ms**
  - Frame Time p95: **16.8 ms**
  - Frame Time p99: **16.9 ms**
  - Draw Calls: **20 - 22**
  - Triangles: **868 - 996**
  - Memory: 0 per-frame allocations in steady-state loop
- **Unit Tests Performance**:
  - Test Suites: 10 passed (10 total)
  - Tests: **72 passed** (72 total)
  - Test Execution Duration: 545 ms
  - Production Bundle Build Duration: 779 ms


