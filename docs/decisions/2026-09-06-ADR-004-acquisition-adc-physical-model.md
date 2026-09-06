# ADR-004: Acquisition and ADC Physical Model Architecture

- **Status**: ACCEPTED
- **Date**: 2026-09-06
- **Wave**: Wave 7 — Acquisition / ADC Model
- **Deciders**: Digital Twin Core Architecture Team

---

## 1. Context & Problem Statement

In a laboratory digital oscilloscope, raw signal voltages pass through complex analog input conditioning (attenuators, coupling switches, variable gain amplifiers, anti-aliasing filters) before entering an ADC quantizer and circular memory.

Previously, virtual signals were directly sampled in the generator. To fulfill the requirements of a realistic digital twin suitable for a bachelor's thesis (ВКР) and conform to **GEMINI.md Rule 1 (Control/Data plane split)** and **Rule 4 (No direct 1–5 MSPS to GPU)**, we must:
1. Model the physical signal path: $\text{Signal Source} \to \text{Analog Front End (AFE)} \to \text{ADC} \to \text{Ring Buffer}$.
2. Support configurable physical parameters: coupling (`DC`/`AC`/`GND`), probe attenuation ($1\times/10\times$), gain ($A_v = 1/\text{voltsPerDiv}$), offset ($V_{\text{offset}}$), bandwidth limit (single-pole RC low-pass filter), thermal noise, and rail clipping.
3. Model ADC quantization with configurable resolution (8 to 16 bits), LSB calculation ($q = \frac{2 V_{\text{FS}}}{2^N}$), and saturation flags.
4. Support logical sample rates: 1 MSPS, 2 MSPS, 5 MSPS.
5. Provide independent CH1 and CH2 acquisition channels with zero crosstalk.
6. Guarantee zero memory allocations during high-frequency sample streaming.

---

## 2. Options Considered

### Option A: Ideal Direct Sampling (Software Bypass)
- Directly evaluate mathematical equations and map to screen pixels without modeling AFE/ADC physical artifacts.
- *Pros*: Trivial implementation.
- *Cons*: Unrealistic; lacks physical realism for a university thesis; cannot demonstrate quantization noise, clipping, bandwidth roll-off, or AC coupling transients.

### Option B: Circuit-Level SPICE Simulation per Sample
- Solve full non-linear differential equations of discrete transistors and op-amps.
- *Pros*: Maximum physical detail.
- *Cons*: Far too slow for real-time 1–5 MSPS in a browser; would drop frame rates to < 5 FPS.

### Option C: Discrete Analytical Physical Stage Modeling (Chosen)
- Model each stage with its exact continuous differential equation discretized via backward difference and bilinear transforms:
  - High-pass AC coupling: $y[n] = \beta (y[n-1] + x[n] - x[n-1])$ with $\beta = \frac{1}{1 + 2\pi f_c \Delta t}$.
  - Low-pass bandwidth limit: $y[n] = y[n-1] + \alpha (x[n] - y[n-1])$ with $\alpha = \frac{2\pi f_c \Delta t}{1 + 2\pi f_c \Delta t}$.
  - Box-Muller Gaussian thermal noise.
  - Rail and ADC saturation clamping.
  - Uniform mid-tread quantizer with LSB step $q = 2 V_{\text{FS}} / 2^N$.
  - Power-of-two circular ring buffers with branchless bitwise masking.

---

## 3. Decision

We adopt **Option C**:
1. **Three-Stage Pipeline**: Strict separation into `SignalSource` $\to$ `AnalogFrontEnd` $\to$ `ADCModel` $\to$ `SampleRingBuffer`.
2. **Deterministic Multi-Rate Clocking**: Synchronized by `SimulationClock` supporting 1, 2, and 5 MSPS.
3. **Independent Channels**: Dedicated `AcquisitionChannel` instances for `CH1` and `CH2` with zero shared state or crosstalk.
4. **Data Plane Ring Buffers**: High-performance `SampleRingBuffer` with preallocated `Float32Array` memory and $O(1)$ branchless masking.
5. **Zero GPU Coupling**: ADC outputs to memory buffers; GPU rendering stages only pull decimated frames.

---

## 4. Consequences & Trade-offs

### Positive
- **Physical Accuracy**: Faithfully models oscilloscope electronics (quantization steps, clipping, $-3\text{ dB}$ bandwidth attenuation, DC blocking).
- **Academic Rigor**: Complete mathematical formulations included in documentation for bachelor's thesis (ВКР).
- **Exceptional Throughput**: Achieves **14.82 MSPS** dual-channel throughput in single-threaded TypeScript, easily beating the 5 MSPS requirement.
- **Zero Memory Allocation**: Zero garbage collection pressure in high-frequency batch loops.

### Trade-offs
- Filtering and quantization introduce sub-sample numerical delays and quantization noise, as occurs in real hardware.

---

## 5. Benchmark Evidence

- **Platform**: Node.js v24.14.1 (V8 engine) / Chrome DevTools V8 (Windows x64).
- **Dual-Channel Throughput**: **14.82 MSPS** (67.46 ms for 1,000,000 samples across CH1 and CH2).
- **Memory Allocation Rate**: 0 bytes allocated in steady-state batch acquisition loop.
- **Test Suite**: 20 automated unit tests (119 repository total, 100% PASS).
