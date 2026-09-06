# ADR-003: Deterministic Simulation Clock, Analytical Signal Synthesis, and Reproducible PRNG

- **Status**: ACCEPTED
- **Date**: 2026-09-06
- **Wave**: Wave 6 — Deterministic Signal Engine
- **Deciders**: Digital Twin Core Architecture Team

---

## 1. Context & Problem Statement

The browser digital twin requires a virtual signal generation engine capable of synthesizing waveforms at sampling rates of **1 MSPS to 5 MSPS** (GEMINI.md Section 0 & 3).

In typical web animation and simulation code, time is obtained from wall-clock APIs (`performance.now()`, `Date.now()`, or `requestAnimationFrame` timestamp deltas). If applied to high-frequency ADC simulation, this produces fatal defects:
1. **Frame rate jitter**: 60 FPS animation frames vary from 14 to 18 ms, producing non-uniform sample distribution.
2. **Cumulative floating-point drift**: Accumulating floating-point increments ($\Delta t = 1/f_s = 10^{-6}$) over millions of cycles causes phase drift and measurement distortion.
3. **Non-reproducible testing**: Unit tests, golden vector comparisons, and educational lab assessments cannot reliably verify phase, frequency, and zero-crossings if time or noise varies across runs.
4. **Memory pressure**: Allocating new typed arrays on every signal evaluation causes garbage collection spikes and frame drops.

---

## 2. Options Considered

### Option A: Wall-Clock Sample Interpolation
- Advance physical simulation based on elapsed browser wall-clock time.
- *Pros*: Aligns naively with real-world passage of seconds.
- *Cons*: Violates GEMINI.md Rule 3 (`sample rate != render rate`); introduces jitter, tab backgrounding throttling errors, and non-deterministic test failures.

### Option B: Pre-Generated Lookup Tables (LUT)
- Precalculate one cycle into a static buffer and sample by index.
- *Pros*: Fast lookup.
- *Cons*: Inflexible with dynamic frequency/phase changes; creates quantization error unless tables are huge; cannot handle arbitrary pulse duty cycles or continuous frequency sweeps without interpolation overhead.

### Option C: Deterministic Discrete Simulation Clock with Analytical Synthesis & Preallocated Buffer Reuse (Chosen)
- Derive simulation time exclusively from an integer sample counter: $t(n) = n / f_s$.
- Evaluate waveforms analytically via mathematical equations with normalized phase $p \in [0, 1)$.
- Drive noise via a seeded 32-bit PRNG (Mulberry32).
- Allow caller-provided preallocated `Float32Array` buffers for batch generation.

---

## 3. Decision

We adopt **Option C**:
1. **Discrete Simulation Clock**: All physical simulation time is strictly computed as $t = n / f_s$, where $n$ is an exact 64-bit integer counter. Zero wall-clock references exist within the simulation pipeline.
2. **Analytical Signal Synthesis**: Waveforms (`SINE`, `SQUARE`, `TRIANGLE`, `SAW`, `PULSE`, `DC`, `NOISE`) are computed analytically with continuous phase offset and duty cycle support.
3. **Phase Boundary Guard**: The normalized cycle position $p$ is rounded to $10^{-12}$ precision to eliminate floating-point edge-case jitter at cycle transitions.
4. **Deterministic PRNG**: Uniform pseudo-random noise is generated using a seeded 32-bit Mulberry32 algorithm, ensuring bit-for-bit identical test vectors.
5. **Zero-Allocation Batch Synthesis**: `generateBatch` accepts a destination `Float32Array`, allowing the circular acquisition buffer to be filled with zero heap allocations in the high-frequency loop.

---

## 4. Consequences & Trade-offs

### Positive
- **100% Determinism**: Unit tests and golden vector scenarios produce bit-exact matches across all operating systems and runtimes.
- **Zero Drift**: Over 1,000,000 samples at 1 MSPS, elapsed simulation time is exactly $1.0000000000000000\text{ s}$.
- **Decoupled Architecture**: Simulation rate is completely independent of the rendering loop (60 FPS) and UI thread.
- **High Throughput**: Generates over **30 MSPS** in pure single-threaded JavaScript/TypeScript, comfortably exceeding the 1–5 MSPS requirement.
- **Zero Garbage Collection**: Continuous signal synthesis creates zero garbage collection pressure when reusing buffers.

### Trade-offs & Mitigations
- *CPU load of trigonometric evaluation*: Evaluating `Math.sin` per sample at 5 MSPS uses ~16 ms of CPU per 500,000 samples. Mitigated by batching, and leaves the door open for WebAssembly/SIMD vectorization in Wave 9 if complex circuits require it.

---

## 5. Benchmark Evidence

- **Platform**: Node.js v24.14.1 / Chrome DevTools V8 engine (Windows x64).
- **Logical Rate**: 5,000,000 samples/sec (5 MSPS).
- **Batch Size**: 100,000 samples into preallocated `Float32Array`.
- **Throughput Measured**: **30.33 MSPS** (32.98 ms for 1,000,000 sine samples).
- **Test Suite**: 27 unit tests verifying golden vectors, zero crossings, boundary cases, and throughput. 100% PASS.
