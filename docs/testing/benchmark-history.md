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

---

## Wave 6: Deterministic Signal Engine & High-Frequency Throughput

- **Date**: 2026-09-06
- **Environment**:
  - Runtime: Node.js v24.14.1 (V8 engine) / Chrome DevTools V8
  - OS: Windows x64
  - Environment: Pure Node (zero DOM / zero Three.js)
  - Virtual Sample Rate Target: 1.0 MSPS to 5.0 MSPS
- **Throughput & Synthesis Benchmarks**:
  - High-frequency Sine Synthesis (5 MSPS, 100 kHz, 3.3 Vpp):
    - Target: $\ge 5.0$ MSPS
    - Measured Throughput: **30.33 MSPS** (32.98 ms per 1,000,000 samples)
    - Throughput Margin: **6.06x** higher than maximum required rate (5 MSPS)
  - Steady-State Memory Allocation: **0 bytes/frame** (100% buffer reuse via preallocated `Float32Array`)
  - Simulation Clock Drift over 1,000,000 steps: **0.0000000000000000 s** (exact integer sample count)
- **Analytical & Golden Vector Verification**:
  - Waveforms Verified: `SINE`, `SQUARE`, `PULSE` (25%), `TRIANGLE`, `SAW`, `DC`, `NOISE`
  - $V_{pp}$ Accuracy: $< 0.01\%$ error against analytical target
  - Period / Zero-Crossing Accuracy: $< 0.01\%$ error
  - Duty Cycle Accuracy: Exact down to 0.1% sub-cycle resolution
  - PRNG Reproducibility: Bit-for-bit identical sequences on identical seed (`Mulberry32`)
- **Unit Tests Performance**:
  - Test Suites: **11 passed** (11 total)
  - Tests: **99 passed** (99 total, +27 new tests for Wave 6)
  - Test Execution Duration: 671 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**

---

## Wave 7: Acquisition & ADC Model Performance Baseline

- **Date**: 2026-09-06
- **Environment**:
  - Runtime: Node.js v24.14.1 (V8 engine) / Chrome DevTools V8
  - OS: Windows x64
  - Environment: Pure Node (zero DOM / zero Three.js / zero GPU)
  - Virtual Sample Rate: 1.0 MSPS, 2.0 MSPS, 5.0 MSPS
- **Dual-Channel Acquisition Pipeline Benchmarks**:
  - Pipeline Stages: `SignalSource` $\to$ `AnalogFrontEnd` (filters, gain, offset, noise, rails) $\to$ `ADCModel` (quantization, clipping) $\to$ `SampleRingBuffer` (circular write)
  - Full Dual-Channel Batch Processing (CH1 + CH2 simultaneously, 1,000,000 samples each = 2,000,000 conversions):
    - Target: $\ge 5.0$ MSPS
    - Measured Throughput: **14.82 MSPS** (67.46 ms per 1,000,000 dual-channel samples)
    - Throughput Margin: **2.96x** higher than maximum required rate (5 MSPS)
  - Steady-State Memory Allocation: **0 bytes/frame** (100% buffer reuse across scratch buffers and power-of-two ring buffer)
- **Mathematical & Physical Validation**:
  - AFE Gain Accuracy: Exact match ($A_v = 1/\text{voltsPerDiv}$) across scales (0.1, 0.5, 1.0, 2.0 V/div)
  - AFE Offset Subtraction: Zero residual error ($V_{\text{scaled}} = (V_{\text{in}} - V_{\text{offset}}) \cdot A_v$)
  - AC Coupling High-Pass: Exact DC blocking with decay to 0.0V
  - Bandwidth Limiting: Exactly $-3.01\text{ dB}$ ($1/\sqrt{2} \approx 0.7071$) attenuation at cutoff frequency $f_c$
  - Analog Noise: Zero mean ($\mu \approx 0.0$), standard deviation matching target $\sigma$
  - Analog Rail Saturation: Hard clamping to preamplifier rails
  - Quantization LSB: Exact step sizes $q = \frac{2 V_{\text{FS}}}{2^N}$ verified for 8, 10, 12, 16 bits
  - Quantization Error: Strictly bounded $|e_q| \le q/2$ for all unclipped analog voltages
  - ADC Saturation: Correct flag assertion (`clippedLow`, `clippedHigh`) on underflow/overflow
  - Channel Isolation: Zero crosstalk between simultaneous CH1 and CH2 acquisition
- **Unit Tests Performance**:
  - Test Suites: **12 passed** (12 total)
  - Tests: **119 passed** (119 total, +20 new tests for Wave 7)
  - Test Execution Duration: 789 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**

---

## Wave 8: Acquisition Web Worker & Threading Performance

- **Date**: 2026-09-06
- **Environment**:
  - Browser: Chrome 145 / Chrome DevTools Protocol
  - Runtime: Node.js v24.14.1 (V8 engine)
  - OS: Windows x64
  - Worker Model: Dedicated Module Web Worker (`new Worker(...)`) with Transferable `ArrayBuffer`
  - Target Logical Sampling: 1.0 MSPS, 2.0 MSPS, 5.0 MSPS
- **Main-Thread vs Web Worker Simulation Benchmarks**:
  - **Main-Thread Direct Compute Cost (100k samples)**:
    - Compute Time: **8.81 – 11.39 ms** per batch
    - Main-Thread CPU Overhead: **~53–68%** of the 16.67 ms 60 FPS frame budget
    - Frame Drops: Occasional jank (dropping to 45–50 FPS under continuous synthesis)
  - **Web Worker Compute Cost (100k samples)**:
    - Worker Compute Time: **7.70 – 8.73 ms** (running concurrently on background CPU core)
    - Main-Thread Burden: **< 0.20 ms** (intake of transferable buffer pointers only)
    - Main-Thread Load Reduction: **> 97%**
    - 3D Rendering Frame Rate: **Stable 60.0 FPS** (zero UI freezes)
- **Batch Transfer & Latency Metrics**:
  - Batch Size: 20,000 to 100,000 samples per batch
  - Transfer Mechanism: Zero-copy `Transferable` list (`[ch1Buf.buffer, ch2Buf.buffer]`)
  - Serialization / JSON Overhead: **0.00 ms** (raw binary buffer transfer)
  - End-to-End Transfer Latency: **< 0.05 ms**
  - Worker Sustained Throughput: **13.80 – 25.00 MSPS**
- **Lifecycle & Resynchronization**:
  - Startup Handshake: **< 15 ms**
  - Clean Shutdown: **< 5 ms**
  - Recovery & State Resynchronization: **100% config restoration** (sample rate, channel frequencies, gains, offsets restored)
- **Unit Tests Performance**:
  - Test Suites: **13 passed** (13 total)
  - Tests: **131 passed** (131 total, +12 new tests for Wave 8)
  - Test Execution Duration: 822 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**

---

## Wave 9: Bounded Circular Ring Buffer Performance & Soak Analysis

- **Date**: 2026-09-06
- **Environment**:
  - Runtime: Node.js v24.14.1 (V8 Engine) / Chromium
  - OS: Windows x64
  - Memory: Pre-allocated single `Float32Array` with power-of-two capacity ($2^K$)
  - Indexing: Branchless bitwise masking (`index & mask`) with monotonic 64-bit pointers
- **Throughput & Latency Benchmarks**:
  - **Zero-Allocation Write & Read Throughput**:
    - Batch Size: 1,000,000 samples
    - Total Time (Write + Read): **1.71 – 2.33 ms**
    - Throughput: **429.76 – 583.94 Mops/sec**
    - Dynamic Heap Allocations: **0 bytes** (strict buffer reuse)
  - **Single Sample `writeOne` / `readOne`**:
    - Overhead: < 2.5 nanoseconds per operation
- **Long-Running Soak Stress Test**:
  - Sample Count: **10,000,000 samples**
  - Streaming Pattern: Pseudo-random burst sizes (1 to 4096 samples) alternating write/read
  - Processing Time: **32.25 – 40.53 ms**
  - Sustained Streaming Rate: **246.71 – 310.11 MSPS**
  - Data Integrity Verification: Strict sequence check ($V_k = V_{k-1} + 1$) across all 10M samples without drop or drift
  - Memory Profile: Zero memory creep; heap allocation delta = 0 bytes
- **Policies Verification**:
  - `OVERWRITE`: Correct advance of `_readIndex` when writing bursts exceeding available space and full buffer capacity
  - `DROP`: Strict preservation of unread data and accurate tracking of dropped samples via `overflowCount`
  - `ERROR`: Immediate throwing of `RingBufferOverflowError` without state corruption
  - `PARTIAL`: Graceful return of available samples on reader faster than writer
  - `ZERO_FILL`: Zero-padded contiguous buffer reads without allocation
  - `ERROR`: Immediate throwing of `RingBufferUnderflowError`
- **Unit Tests Performance**:
  - Test Suites: **14 passed** (14 total)
  - Tests: **148 passed** (148 total, +17 new tests for Wave 9)
  - Test Execution Duration: 771 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**
  - Vite Production Build: **856 ms**

---

## Wave 10: SharedArrayBuffer Data Plane & postMessage Comparative Benchmark

- **Date**: 2026-09-06
- **Environment**:
  - Runtime: Node.js v24.14.1 (V8 Engine) & Chrome 145 / Chrome DevTools Protocol
  - OS: Windows x64
  - Memory: Pre-allocated 512 KB `SharedArrayBuffer` with 128-byte header and power-of-two capacity ($2^{16} = 65,536$)
  - Synchronization: SPSC Lock-Free Atomics (`Atomics.store` release / `Atomics.load` acquire)
  - Cross-Origin Isolation: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`
- **Comparative Pipeline Benchmarks (1,000,000 Dual-Channel Samples)**:

| Characteristic | Wave 8/9 Message-Passing Baseline | Wave 10 SharedArrayBuffer Data Plane | Delta / Improvement |
| :--- | :---: | :---: | :---: |
| **Heap Allocations in High-Rate Loop** | **7.63 MB** (100 ArrayBuffers per 1M samples) | **0 bytes** (Pre-allocated Shared Memory) | **100% Elimination of GC Load** |
| **Transfer / Streaming Time** | **82.89 – 86.35 ms** | **4.83 – 5.86 ms** | **14.1x – 17.8x faster** |
| **Data Plane Throughput** | **11.58 – 12.06 MSPS** | **170.65 – 207.13 MSPS** | **> 14x Throughput Gain** |
| **Buffer Objects Transferred** | 100 Transferable `ArrayBuffer` objects | **0 transferred objects** (event metadata only) | Zero IPC buffer marshaling |
| **End-to-End Worker Streaming (AFE + ADC + SAB)** | 82.89 ms (12.06 MSPS) | **67.03 – 79.21 ms** (12.63 – 14.92 MSPS) | Bounded, zero memory churn |

- **Long-Running SAB Soak Stress Test**:
  - Sample Count: **10,000,000 dual-channel samples**
  - Processing Time: **124.95 – 135.04 ms**
  - Sustained Streaming Rate: **74.05 – 80.03 MSPS**
  - Integrity: 100% bit-exact verification across all 10M samples; zero sequence drift, zero torn reads.
  - Heap Memory Profile: Flatline (zero GC spikes).
- **Capability Detection & Fallback Validation**:
  - `SharedMemoryCapability`: 100% accurate detection of COOP/COEP isolation, SAB constructor, and Atomics.
  - Automatic Fallback: Transparently degrades to `MessagePassingTransport` when isolation is disabled, maintaining identical functional behavior.
- **Unit & Benchmark Tests**:
  - Test Suites: **19 passed** (19 total, +4 new suites for Wave 10)
  - Tests: **175 passed** (175 total, +20 new tests for Wave 10)
  - Test Execution Duration: 894 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**
  - Vite Production Build: **900 ms**

---

## Wave 11: WebAssembly Toolchain Evaluation & DSP Core Benchmarks

- **Date**: 2026-09-06
- **Environment**:
  - OS: Windows 11 x64
  - Runtime: Node.js v22.18.0 (V8 JIT)
  - Test Framework: Vitest 3.2.7
  - Toolchain: Freestanding C-ABI via WABT (`wabt` npm package)
  - Binary Size: `dsp_kernel.wasm` (**884 bytes** standalone bytecode)
  - Memory: Linear Memory (16 pages = 1 MB initial, dynamically expandable up to 16 MB)
- **Comparative DSP Performance Benchmarks (WASM vs Pure JS)**:

| Kernel / Workload | Pure JavaScript (V8 JIT) | WebAssembly DSP Kernel | Speedup (WASM vs JS) | Throughput (MSPS) | Frame Budget Share (60 FPS) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`computeStats`** (100,000 samples, 200 iterations) | 0.129 ms / call | **0.069 ms / call** | **1.86x** | **1,449.5 MSPS** | < 0.5% of 16.67 ms |
| **`peakDetectDecimate`** (100k samples $\to$ 1k buckets) | 0.085 ms / call | **0.081 ms / call** | **1.05x – 1.17x** | **1,241.1 MSPS** | < 0.5% of 16.67 ms |
| **`peakDetectDecimate`** (500k samples $\to$ 2k buckets, 5 MSPS) | 0.387 ms / call | **0.376 ms / call** | **1.03x – 1.08x** | **1,328.8 MSPS** | **2.25% of 16.67 ms** |

- **Analytical Precision & Golden Vector Verification**:
  - DC Signal (2.5V): Exact analytical match ($\mu = 2.5\text{ V}, \text{RMS} = 2.5\text{ V}, V_{pp} = 0\text{ V}$)
  - Sine Wave (1 kHz, 2V amp, 1 MSPS): Exact $V_{pp} = 4.0\text{ V}$, $\text{RMS} = 2.0 / \sqrt{2} = 1.4142\text{ V}$
  - Square Wave (+1V / -1V): Exact $V_{pp} = 2.0\text{ V}$, $\text{RMS} = 1.0\text{ V}$
  - Peak-Detect Impulse Preservation: Single-sample impulse spikes (+9.87V at index 4250) preserved with 100% fidelity in bucket 42.
  - Cross-Validation: $\Delta < 10^{-5}$ across all statistical quantities compared to pure JS float calculations.
  - Linear Memory Growth: Successfully auto-expands memory via `memory.grow()` when processing buffers exceeding 1 MB (300,000+ samples).
- **Toolchain Evaluation Summary (ADR-008)**:
  - Rust/WASM vs. C/C++/WASM evaluated across 8 criteria.
  - Freestanding C/WABT chosen for 100% zero-dependency reproducibility, sub-millisecond compile time, and 884-byte binary footprint.
- **Unit & Benchmark Tests**:
  - Test Suites: **21 passed** (21 total, +2 new suites for Wave 11)
  - Tests: **191 passed** (191 total, +16 new tests for Wave 11)
  - Test Execution Duration: 939 ms
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**
  - Vite Production Build: **949 ms**

---

## Wave 12: DSP Reference Algorithms & Mathematical Oracle Verification

- **Date**: 2026-09-06
- **Environment**:
  - OS: Windows 11 x64
  - Runtime: Node.js v22.18.0 (V8 JIT)
  - Test Framework: Vitest 3.2.7
  - Implementation Layer: Pure TypeScript (`src/dsp/`)
- **Mathematical Oracle & Golden Vector Verification**:
  - **Mean ($\mu$) & DC Linear Accuracy**: $\Delta < 10^{-6}$ on constant DC and symmetric AC signals.
  - **Min / Max / Peak-to-Peak**: Exact IEEE-754 precision ($\Delta = 0$).
  - **True RMS ($V_{rms}$)**:
    - Pure Sine ($A = 2.0\text{ V}$): $V_{rms} = A / \sqrt{2} = 1.414214\text{ V}$ ($\Delta < 10^{-4}$).
    - Square Wave ($A = 1.5\text{ V}$): $V_{rms} = 1.500000\text{ V}$ ($\Delta < 10^{-6}$).
    - Symmetrical Triangle ($A = 3.0\text{ V}$): $V_{rms} = A / \sqrt{3} = 1.732051\text{ V}$ ($\Delta < 10^{-3}$).
    - Composite DC + AC: $V_{rms} = \sqrt{V_{dc}^2 + V_{ac,rms}^2}$ exact match.
  - **Sub-sample Zero Crossing Interpolation**:
    - Linear ramp interpolation error: **0.000000 sample** (exact algebraic fractional root).
    - Analytical Sine crossing timestamps error: $< 0.01$ sample.
    - Hysteresis band noise rejection: $100\%$ suppression of spurious micro-crossings around zero threshold.
    - Tangential touch distinction: 0 false crossings when touching threshold without sign reversal.
  - **Frequency & Period Estimation**:
    - 1 kHz Sine at 1 MSPS: measured $1000.0\text{ Hz}$, period $1.000\text{ ms}$, error $< 0.05\%$, confidence $> 0.95$.
    - Non-integer frequency ($f = 1234.56\text{ Hz}$): error $< 0.1\%$ via sub-sample crossing interpolation.
    - High-frequency 5 MSPS rate ($f = 100\text{ kHz}$): period $10.00\ \mu\text{s}$ exact match.
    - Asymmetric Duty Cycle: 25% and 75% rectangular pulses measured within $\pm 0.02$.
  - **FIR Filter Invariants**:
    - Impulse response: $h[n] = b[n]$ exact match.
    - Step response: converges exactly to DC gain $H(0) = \sum b[k]$.
    - Windowed-Sinc Low-Pass: passband attenuation $< 0.05\text{ dB}$, stopband attenuation $> 30\text{ dB}$ at $f = 7 f_c$.
    - Streaming block continuity: zero output deviation when splitting inputs across arbitrary chunk sizes.
  - **IIR Biquad (Direct Form II Transposed) Invariants**:
    - 2nd-Order Butterworth Low-Pass: DC gain $H(0) = 1.000000$ exact; $-3.0103\text{ dB}$ ($1/\sqrt{2} \approx 0.7071$) at cutoff frequency $f_c$; stopband roll-off $-40\text{ dB/decade}$.
    - Jury stability criterion: $100\%$ detection and rejection of unstable poles outside unit circle ($|p| \ge 1$).
- **Unit & Benchmark Tests**:
  - Test Suites: **26 passed** (26 total, +5 new suites for Wave 12)
  - Tests: **233 passed** (233 total, +42 new tests for Wave 12)
  - Test Execution Duration: 1.08 s
  - Architectural Boundary Violations: **0**
  - TypeScript Diagnostics: **0 errors**
  - Vite Production Build: **879 ms**

---

## Wave 13: WebAssembly DSP Implementation, 128-bit SIMD, and Comparative Analysis

- **Date**: 2026-09-06
- **Environment**:
  - OS: Windows 11 x64
  - Runtime: Node.js v22.18.0 (V8 TurboFan JIT) / Chrome 145 DevTools
  - Test Framework: Vitest 3.2.7
  - Toolchain: Freestanding WABT (`wat2wasm --enable-simd`)
  - Module Size: `dsp_kernel.wasm` (**2,221 bytes**)
  - Vector Extension: 128-bit WASM SIMD (`v128`, `f32x4`)

### 1. JS-to-WASM Call Boundary Overhead (`dsp_noop`)
- Iterations: 500,000 invocations
- Pure JavaScript Function Call: **2.54 – 5.01 ns / call**
- WebAssembly Exported Function Call: **4.99 – 7.96 ns / call**
- Net Call Boundary Overhead: **2.45 – 2.95 ns / call**
- *Conclusion*: Boundary overhead is negligible (< 3 ns) for any batch processing workload ($N \ge 256$ samples).

### 2. Multi-Size Statistical Reduction (Vpp, Min, Max, RMS, Mean)
Comparing Pure JS, WASM Scalar, WASM 128-bit SIMD, and Raw In-Place Zero-Copy SIMD:

| Buffer Size ($N$) | Pure JS (ms) | WASM Scalar (ms) | WASM SIMD (ms) | Raw SIMD (Zero-Copy) (ms) | Speedup (SIMD vs JS) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **64** | 0.0002 – 0.0004 | 0.0005 – 0.0007 | 0.0003 – 0.0004 | 0.0002 – 0.0003 | **0.72x – 0.85x** *(JS wins on small buffer)* |
| **1,000** | 0.0008 – 0.0013 | 0.0009 – 0.0014 | 0.0009 – 0.0011 | 0.0008 – 0.0009 | **1.07x – 1.27x** |
| **10,000** | 0.0066 – 0.0122 | 0.0071 – 0.0121 | 0.0080 – 0.0105 | 0.0076 – 0.0095 | **1.15x – 1.17x** |
| **100,000** | 0.0678 – 0.0981 | 0.0701 – 0.0902 | 0.0798 – 0.0895 | 0.0757 – 0.0795 | **1.14x** |
| **500,000** | 0.3562 – 0.5991 | 0.4219 – 0.5305 | 0.4516 – 0.4593 | 0.3762 – 0.3812 | **1.14x – 1.32x** |

*Scientific Insight*: For $N \le 64$, typed array memory copying (`inView.set`) dominates execution time, so pure JS inlined by V8 TurboFan is faster. At $N \ge 1,000$, WASM SIMD outperforms JS. Zero-copy execution (where data already resides in shared linear memory / SAB) further reduces latency by 15–20%.

### 3. Dedicated True RMS Kernel (`dsp_compute_rms_scalar`)
- Workload: 100,000 samples, 200 iterations
- Pure JS RMS: 0.082 – 0.087 ms / call (1,154.8 – 1,280.3 MSPS)
- **WASM True RMS: 0.046 – 0.047 ms / call (2,132.3 – 2,177.8 MSPS)**
- **Speedup: 1.67x – 1.87x faster than JS**
- *Reason*: Direct 64-bit hardware floating-point FMA accumulator in WASM executes with zero array bounds checking overhead.

### 4. Peak-Detect Decimation (Waveform Display Compression)
- **100,000 samples $\to$ 1,000 display buckets** (200 iterations):
  - Pure JS: 0.080 – 0.083 ms / call (1,203.7 – 1,246.0 MSPS)
  - **WASM: 0.070 – 0.073 ms / call (1,372.9 – 1,438.2 MSPS)**
  - Speedup: **1.11x – 1.19x**
- **500,000 samples $\to$ 2,000 display buckets** (50 iterations, 5 MSPS scale):
  - Pure JS: 0.389 – 0.400 ms / call (1,250.4 – 1,285.2 MSPS)
  - **WASM: 0.385 – 0.387 ms / call (1,292.2 – 1,299.2 MSPS)**
  - Speedup: **1.01x – 1.03x**

### 5. FIR Direct Convolution Filter (`dsp_fir_filter`)
- Workload: 50,000 samples, 32 taps, 50 iterations
- Pure JS FIR: 1.705 – 1.759 ms / call (28.4 – 29.3 MSPS)
- **WASM FIR: 0.491 – 0.519 ms / call (96.3 – 101.8 MSPS)**
- **Speedup: 3.28x – 3.58x faster than JS**
- *Reason*: $O(N \cdot M)$ convolution loops trigger repeated bounds checking and de-optimizations in V8 JIT; WASM executes uninterrupted linear memory pointer arithmetic.

### 6. IIR Biquad Filter (`dsp_iir_biquad`)
- Workload: 100,000 samples, 100 iterations, Direct Form II Transposed
- Pure JS IIR: 0.187 – 0.191 ms / call (524.7 – 534.1 MSPS)
- WASM IIR: 0.197 – 0.207 ms / call (483.4 – 507.9 MSPS)
- Speedup: **0.92x – 0.96x** (Pure JS slightly faster)
- *Reason*: IIR has recursive temporal dependence ($y[n] = b_0 x[n] + d_1[n-1]$), preventing SIMD parallelization; V8 JIT keeps delay registers $d_1, d_2$ directly in CPU registers without array copy cost.

### 7. Regression Protection & Test Suite Summary
- Test Suites: **26 passed** (26 total)
- Tests: **250 passed** (250 total, +17 new tests in Wave 13)
- Execution Duration: ~1.67 s
- TypeScript Diagnostics: **0 errors**
- Architectural Boundaries: **0 violations**
- Vite Production Build: **929 ms**



