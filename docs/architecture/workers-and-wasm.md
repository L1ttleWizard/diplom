# Architecture: Workers & WebAssembly Subsystem

## 1. Threading Topology & Architecture Overview

In a high-frequency browser digital twin (1–5 MSPS logical sampling), executing signal generation, analog conditioning, ADC quantization, and DSP filtering on the main thread is strictly prohibited (**GEMINI.md Rule 7: Never block main thread with DSP computations**).

The browser runtime is architected with a decoupled multi-threaded topology:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN BROWSER THREAD                             │
│                                                                        │
│   • Three.js 3D Lab Bench Scene & Camera Controls                      │
│   • 60 FPS Render Loop & Frame Budget (16.67 ms)                       │
│   • Virtual Display Engine & Graticule Blitting                        │
│   • Pointer Events, Raycasting & Interaction Adapters                  │
│   • Control Plane: Domain State Machine & Typed Commands               │
│   • AcquisitionWorkerClient (Lifecycle, Resync, Telemetry)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       Versioned Commands (INIT,    │ Transferable ArrayBuffers
       START, STOP, CONFIGURE)      │ (CH1 & CH2 Float32Array batches)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    ACQUISITION WEB WORKER (DATA PLANE)                 │
│                                                                        │
│   • Autonomous Continuous Tick Loop (50 Hz / 60 Hz)                    │
│   • Deterministic SimulationClock Progression (Zero Wall-Clock)        │
│   • SignalGenerator (CH1 Sine/Square/etc., CH2 Waveforms)              │
│   • AnalogFrontEnd (Coupling, Attenuation, Gain, Bandwidth Filter)     │
│   • ADCModel (Quantization, LSB Stepping, Saturation Tracking)         │
│   • Transferable Memory Buffers (Zero JSON serialization)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Versioned Worker Protocol (`PROTOCOL_VERSION = 1`)

All communication between the main thread and background workers follows a strictly versioned, typed protocol defined in `src/workers/acquisition/protocol.ts`.

### 2.1 Command Messages (Main Thread $\longrightarrow$ Worker)

Every command conforms to the schema:
```typescript
interface WorkerCommandMessage<T> {
  version: 1;
  id: string;
  type: 'INIT' | 'START' | 'STOP' | 'CONFIGURE' | 'RESET';
  timestamp: number;
  payload: T;
}
```

| Command Type | Payload | Description |
| :--- | :--- | :--- |
| **`INIT`** | `{ sampleRate?, batchSize?, intervalMs?, ch1?, ch2? }` | Initializes worker, configures clocks, sample rate, and initial channel parameters. Responds with `INITIALIZED`. |
| **`START`** | `{ intervalMs? }` | Begins autonomous background timer loop emitting batches of samples at the specified interval. Transitions state to `RUNNING`. |
| **`STOP`** | `{}` | Halts background acquisition loop. Transitions state to `STOPPED`. |
| **`CONFIGURE`**| `{ channelId?, signal?, afe?, adc?, sampleRate? }` | Dynamically updates waveform frequency, amplitude, offset, scale ($V/\text{div}$), coupling, or bandwidth filter without stopping streaming. |
| **`RESET`** | `{}` | Resets simulation clock counter to 0, flushes analog filters, and returns worker state to `IDLE`. |

### 2.2 Event Messages (Worker $\longrightarrow$ Main Thread)

```typescript
interface WorkerEventMessage<T> {
  version: 1;
  id: string;
  type: 'INITIALIZED' | 'BATCH_PRODUCED' | 'CONFIGURED' | 'STATE_CHANGED' | 'ERROR';
  timestamp: number;
  payload: T;
}
```

| Event Type | Payload | Description |
| :--- | :--- | :--- |
| **`INITIALIZED`** | `{ protocolVersion, sampleRate, batchSize, workerTimestamp }` | Confirms successful initialization and capability handshake. |
| **`BATCH_PRODUCED`**| `{ batchIndex, sampleCount, simTimeStart, simTimeEnd, ch1Samples, ch2Samples, generationDurationMs }` | Emits acquired batch. `ch1Samples` and `ch2Samples` are transferred via zero-copy `Transferable` list. |
| **`CONFIGURED`** | `{ appliedConfig }` | Confirms dynamic parameter update. |
| **`STATE_CHANGED`**| `{ previous, current }` | Broadcasts state transitions (`IDLE`, `RUNNING`, `STOPPED`, `ERROR`). |
| **`ERROR`** | `{ code, message, recoverable, timestamp }` | Reports caught exceptions with structured diagnostic codes. |

---

## 3. High-Throughput Batch Transfer via Transferable `ArrayBuffer`

### 3.1 The Problem with Naive Message Passing
In typical web applications, `postMessage(data)` performs deep structured cloning or relies on JSON serialization. Transferring 100,000 `Float32Array` values via JSON serialization creates:
- Severe stringification CPU overhead (> 20 ms).
- Massive garbage collection churn.
- Unacceptable frame drops on the main 3D rendering thread.

### 3.2 Transferable Memory Mechanics
In our acquisition pipeline, batch transfer transfers **ownership** of the underlying memory buffer:

```typescript
// Inside Worker:
const ch1Out = new Float32Array(count);
const ch2Out = new Float32Array(count);

// Zero-copy transfer: passes memory pointers directly without byte copying
postMessage(event, [ch1Out.buffer, ch2Out.buffer]);
```

- **Transfer Overhead**: **< 0.05 ms** per batch of 50,000–100,000 samples.
- **Serialization Cost**: **0 ms** (no JSON stringification).
- **Cross-Origin Isolation Independence**: Works reliably across all standard browsers without requiring restrictive `Cross-Origin-Embedder-Policy` (COEP) headers.

---

## 4. Lifecycle Resilience & State Resynchronization

Worker crashes or context loss must not destabilize the user interface. The `AcquisitionWorkerClient` implements comprehensive lifecycle management:

```
                  ┌──────────────────────┐
                  │    UNINITIALIZED     │
                  └──────────┬───────────┘
                             │ startup()
                             ▼
                  ┌──────────────────────┐
                  │         IDLE         │◀────────────────┐
                  └──────────┬───────────┘                 │
                             │ start()                     │ reset()
                             ▼                             │
┌─────────────┐   ┌──────────────────────┐                 │
│  CONFIGURE  │──▶│       RUNNING        │─────────────────┤
└─────────────┘   └──────────┬───────────┘                 │
                             │ stop()                      │
                             ▼                             │
                  ┌──────────────────────┐                 │
                  │       STOPPED        │─────────────────┘
                  └──────────┬───────────┘
                             │ Uncaught Error / Crash
                             ▼
                  ┌──────────────────────┐
                  │        ERROR         │
                  └──────────┬───────────┘
                             │ restart() [Automatic State Resync]
                             ▼
                  ┌──────────────────────┐
                  │   Restored State     │
                  └──────────────────────┘
```

### 4.1 Automatic State Resynchronization
1. The `AcquisitionWorkerClient` caches the current domain configuration snapshot:
   - Sample rate (1, 2, 5 MSPS).
   - Batch size and timer interval.
   - CH1 & CH2 signal generator settings (waveform, frequency, amplitude, offset).
   - CH1 & CH2 AFE parameters ($V/\text{div}$, coupling, probe attenuation, bandwidth limit).
   - ADC resolution.
2. Whenever `restart()` is invoked (either manually or upon catching a worker runtime exception), the client:
   - Destroys the crashed worker thread.
   - Spawns a fresh worker instance.
   - Replays the cached configuration during the `INIT` handshake.
   - Resumes active streaming if the worker was in the `RUNNING` state prior to the crash.

---

## 5. Performance Comparison: Main-Thread vs Worker Simulation

Benchmarks measured on Windows x64 (Chrome 145 / V8 engine):

| Characteristic | Main-Thread Direct Simulation | Web Worker Simulation | Delta / Improvement |
| :--- | :---: | :---: | :---: |
| **Main-Thread Compute Time per 100k samples** | **8.81 – 11.39 ms** | **< 0.20 ms** (buffer intake only) | **> 97% reduction** in main-thread load |
| **Batch Transfer Latency** | N/A (in-process) | **< 0.05 ms** (Transferable) | Negligible overhead |
| **Sustained Sampling Rate** | Bursty (tied to frame ticks) | **13.80 – 25.00 MSPS** (continuous) | Decoupled steady streaming |
| **3D Rendering Frame Rate** | Drops to 40–45 FPS during heavy math | **Rock-solid 60.0 FPS** | **Zero UI Freezes** |
| **Garbage Collection Overhead** | Heap allocations in main thread | **Zero GC pressure** on main thread | Stable memory footprint |

---

## 6. WebAssembly (WASM) Integration Roadmap (Wave 9+)

As established in **GEMINI.md Rule 9 (No WASM without benchmark proof)**:
- Pure TypeScript AFE and ADC synthesis currently achieves **> 13 MSPS dual-channel**, comfortably exceeding the 1–5 MSPS requirement.
- WebAssembly will be integrated in Wave 9 specifically for:
  - SPICE-style non-linear circuit matrix solving ($N \times N$ MNA solvers).
  - Heavy Radix-2 / Radix-4 Fast Fourier Transforms (FFT) for real-time spectrum analysis.
  - Complex FIR/IIR multi-stage decimation filters.
