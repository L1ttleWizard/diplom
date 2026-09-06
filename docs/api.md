# API Contracts & Schemas

## 1. Domain Commands (`src/domain/commands/commands.ts`)

Commands are dispatched to `OscilloscopeService.executeCommand(cmd)`. Every command is strongly typed and strictly validated before modifying domain state.

### Command Signatures:

| Command Type | Payload | Validation Rules | Description |
| :--- | :--- | :--- | :--- |
| `RUN` | `{}` | State machine must accept transition to `ARMED`/`RUNNING` | Starts active acquisition |
| `STOP` | `{}` | Transitions state machine to `STOPPED` | Freezes current waveform |
| `SET_TIME_DIV` | `{ timeDiv: number }` | Must be a member of standard 1-2-5 scale (`10e-9` to `5.0` s) | Sets horizontal scale |
| `SET_VOLT_DIV` | `{ channelId: ChannelId, voltDiv: number }` | `voltDiv` in 1-2-5 scale (`0.001` to `10.0` V), channel exists | Sets vertical scale |
| `SET_TRIGGER_LEVEL`| `{ level: number }` | Finite number, within operational voltage bounds (-50V..+50V) | Adjusts trigger voltage threshold |
| `SET_TRIGGER_MODE` | `{ mode: 'AUTO' \| 'NORMAL' \| 'SINGLE' }` | Valid enum string | Sets sweep trigger mode |
| `ENABLE_CHANNEL` | `{ channelId: ChannelId }` | Valid `CH1` or `CH2` | Enables channel display & acquisition |
| `DISABLE_CHANNEL`| `{ channelId: ChannelId }` | At least one channel must remain enabled | Disables channel display |

---

## 2. Domain Events (`src/domain/events/events.ts`)

Published by `EventBus` when domain state mutates. 3D adapters and display engines subscribe to these events.

### Event Definitions:

| Event Name | Payload Format | Triggering Condition |
| :--- | :--- | :--- |
| `STATE_CHANGED` | `{ previous: OscilloscopeState, current: OscilloscopeState }` | Oscilloscope state machine transitions |
| `ACQUISITION_STARTED` | `{ timestamp: number, sampleRate: number }` | Domain begins data acquisition loop |
| `ACQUISITION_STOPPED` | `{ timestamp: number }` | User stops acquisition or single sweep completes |
| `TRIGGERED` | `{ timestamp: number, channelId: ChannelId, level: number }` | Hardware/virtual trigger fires |
| `TIME_DIV_CHANGED` | `{ timeDiv: number }` | Timebase setting modified |
| `CHANNEL_UPDATED` | `{ channelId: ChannelId, voltDiv: number, enabled: boolean, offset: number, coupling: string }` | Channel parameter updated |
| `TRIGGER_CONFIG_CHANGED` | `{ mode: string, source: ChannelId, level: number, edge: string }` | Trigger parameter modified |
| `MEASUREMENT_UPDATED` | `{ channelId: ChannelId, measurements: MeasurementResult[] }` | Automated measurements calculated |
| `DEVICE_ERROR` | `{ message: string, code: string }` | State machine or acquisition error occurs |

---

## 3. Application Service API (`src/application/services/OscilloscopeService.ts`)

```typescript
export class OscilloscopeService {
  constructor(oscilloscope: Oscilloscope, eventBus: EventBus);

  // Command dispatch
  executeCommand(command: OscilloscopeCommand): void;

  // Query state (immutable snapshots)
  getOscilloscope(): Oscilloscope;
  getState(): OscilloscopeState;
  getChannel(id: ChannelId): Channel | undefined;
  getTrigger(): Trigger;
  getAcquisition(): Acquisition;
  getEventBus(): EventBus;
}
```

---

## 4. Signal Engine & Simulation Clock API (`src/domain/simulation/`)

### 4.1 `SimulationClock`
```typescript
export class SimulationClock {
  constructor(initialSampleRate: number = 1_000_000, initialSampleIndex: number = 0);

  // Time queries
  public get sampleIndex(): number;
  public get sampleRate(): number;
  public get simulationTime(): number; // sampleIndex / sampleRate
  public get timeStep(): number;       // 1 / sampleRate

  // Clock progression (Zero wall-clock)
  public step(): number;
  public advance(sampleCount: number): number;
  public timeAt(sampleIndex: number): number;
  public setTime(targetTimeSeconds: number): void;
  public setSampleRate(newRate: number): void;
  public reset(): void;
  public snapshot(): ClockState;
}
```

### 4.2 `SignalGenerator`
```typescript
export type WaveformType = 'SINE' | 'SQUARE' | 'TRIANGLE' | 'SAW' | 'PULSE' | 'DC' | 'NOISE';

export interface SignalGeneratorOptions {
  waveform?: WaveformType; // Default 'SINE'
  frequency?: number;     // Default 1000 Hz
  amplitude?: number;     // Default 2.0 Vpp
  offset?: number;        // Default 0.0 V
  phase?: number;         // Default 0.0 deg
  dutyCycle?: number;     // Default 50.0%
  noiseSeed?: number;     // Default 1337
}

export class SignalGenerator {
  constructor(options?: SignalGeneratorOptions);

  // Configuration
  public setWaveform(waveform: WaveformType): void;
  public setFrequency(freq: number): void;
  public setAmplitude(amp: number): void;
  public setOffset(offset: number): void;
  public setPhase(phaseDeg: number): void;
  public setDutyCycle(duty: number): void;

  // Synthesis methods
  public sampleAt(t: number): number;
  public generateBatch(
    clock: SimulationClock,
    count: number,
    outputBuffer?: Float32Array
  ): Float32Array;
}
```

---

## 5. Acquisition & ADC Model API (`src/domain/acquisition/`, `src/data/`)

### 5.1 `AnalogFrontEnd`
```typescript
export interface AFEConfig {
  coupling?: Coupling;              // 'DC' | 'AC' | 'GND'
  probeAttenuation?: ProbeAttenuation; // '1X' | '10X'
  voltsPerDiv?: number;             // Volts per division scale
  offset?: number;                  // Channel offset in Volts
  bandwidthLimit?: boolean;         // Enable 1st-order RC low-pass filter
  cutoffFrequency?: number;         // Cutoff frequency in Hz (default 20 MHz)
  noiseRms?: number;                // Input thermal noise RMS standard deviation
  minRailVoltage?: number;          // Negative amplifier rail (default -5.0V)
  maxRailVoltage?: number;          // Positive amplifier rail (default +5.0V)
}

export class AnalogFrontEnd {
  constructor(config?: AFEConfig);
  public processSample(vIn: number, dt: number): number;
  public processBatch(vIn: Float32Array, vOut: Float32Array, dt: number, count?: number): void;
  public resetFilters(): void;
}
```

### 5.2 `ADCModel`
```typescript
export interface ADCConfig {
  resolution?: 8 | 10 | 12 | 14 | 16; // ADC bit resolution (default 8)
  fullScaleVoltage?: number;           // Full scale voltage VFS (default 4.0V)
  sampleRate?: number;                 // 1 MSPS, 2 MSPS, 5 MSPS
}

export class ADCModel {
  constructor(config?: ADCConfig);
  public get lsbVoltage(): number; // 2 * VFS / 2^N
  public convertSample(vAnalog: number): {
    code: number;
    reconstructedVoltage: number;
    clippedLow: boolean;
    clippedHigh: boolean;
  };
  public convertBatch(
    analogIn: Float32Array,
    digitalCodes?: Uint16Array | Uint32Array,
    reconstructedOut?: Float32Array,
    count?: number
  ): ADCConversionResult;
}
```

### 5.3 `AcquisitionEngine`
```typescript
export class AcquisitionEngine {
  public readonly ch1: AcquisitionChannel;
  public readonly ch2: AcquisitionChannel;
  public readonly clock: SimulationClock;

  constructor(config?: AcquisitionEngineConfig);
  public setSampleRate(rate: number): void;
  public acquire(count: number): DualChannelAcquisitionResult;
  public reset(): void;
}
```

### 5.4 `SampleRingBuffer` (`src/data/SampleRingBuffer.ts`)
```typescript
export class SampleRingBuffer implements ISampleRingBuffer {
  constructor(capacity?: number); // Power-of-two capacity
  public write(samples: Float32Array, count?: number): number;
  public read(destination: Float32Array, count: number): number;
  public readLatest(destination: Float32Array, count: number): number;
  public readWindow(destination: Float32Array, globalStartIndex: number, count: number): number;
  public clear(): void;
}
```

---

## 6. Acquisition Worker Protocol & Client API (`src/workers/`)

### 6.1 Versioned Protocol (`src/workers/acquisition/protocol.ts`)
```typescript
export const PROTOCOL_VERSION = 1;

export type WorkerCommandType = 'INIT' | 'START' | 'STOP' | 'CONFIGURE' | 'RESET';
export type WorkerEventType = 'INITIALIZED' | 'BATCH_PRODUCED' | 'CONFIGURED' | 'STATE_CHANGED' | 'ERROR';

export interface WorkerCommandMessage<T = unknown> {
  version: 1;
  id: string;
  type: WorkerCommandType;
  timestamp: number;
  payload: T;
}

export interface WorkerEventMessage<T = unknown> {
  version: 1;
  id: string;
  type: WorkerEventType;
  timestamp: number;
  payload: T;
}
```

### 6.2 `AcquisitionWorkerClient` (`src/workers/acquisition/AcquisitionWorkerClient.ts`)
```typescript
export class AcquisitionWorkerClient {
  constructor(portFactory?: () => IWorkerPort);

  // Lifecycle
  public startup(config?: WorkerInitPayload, timeoutMs?: number): Promise<void>;
  public start(intervalMs?: number): void;
  public stop(): void;
  public configure(update: WorkerConfigurePayload): void;
  public reset(): void;
  public shutdown(): void;
  public restart(): Promise<void>; // Includes automatic state resynchronization

  // Event subscriptions
  public onBatch(callback: (batch: WorkerBatchPayload) => void): () => void;
  public onStateChange(callback: (state: WorkerState) => void): () => void;
  public onError(callback: (error: WorkerErrorPayload) => void): () => void;

  // Telemetry metrics
  public get state(): WorkerState;
  public get latestLatencyMs(): number;
  public get avgLatencyMs(): number;
  public get rollingThroughputMsps(): number;
  public get totalBatches(): number;
  public get totalSamples(): number;
}
```

---

## 7. Data Plane Bounded Ring Buffer API (`src/data/`)

### 7.1 Configuration & Policies (`src/data/types.ts`)
```typescript
export type OverflowPolicy = 'OVERWRITE' | 'DROP' | 'ERROR';
export type UnderflowPolicy = 'PARTIAL' | 'ZERO_FILL' | 'ERROR';

export interface RingBufferOptions {
  capacity: number;
  overflowPolicy?: OverflowPolicy;   // Default: 'OVERWRITE'
  underflowPolicy?: UnderflowPolicy; // Default: 'PARTIAL'
}

export interface RingBufferStats {
  capacity: number;
  available: number;
  freeSpace: number;
  totalWritten: number;
  totalRead: number;
  overflowCount: number;
  underflowCount: number;
  wrapCount: number;
  overflowPolicy: OverflowPolicy;
  underflowPolicy: UnderflowPolicy;
}
```

### 7.2 `BoundedRingBuffer` (`src/data/BoundedRingBuffer.ts`)
```typescript
export class BoundedRingBuffer {
  constructor(options: RingBufferOptions);

  // Buffer state properties
  public get capacity(): number;
  public get available(): number;
  public get freeSpace(): number;
  public get totalWritten(): number;
  public get totalRead(): number;
  public get wraparound(): boolean;
  public get wrapCount(): number;
  public get overflowCount(): number;
  public get underflowCount(): number;

  // Zero-allocation write methods
  public write(samples: Float32Array | number[], count?: number): number;
  public writeOne(sample: number): boolean;

  // Zero-allocation read methods
  public read(destination: Float32Array, count?: number): number;
  public readOne(): number | null;

  // Non-destructive queries (trigger / display)
  public peek(offsetFromRead?: number): number | null;
  public readLatest(destination: Float32Array, count: number): number;
  public readWindow(destination: Float32Array, globalStartIndex: number, count: number): number;

  // Maintenance & telemetry
  public reset(): void;
  public getStats(): RingBufferStats;
}
```

### 7.3 `SampleRingBuffer` (`src/data/SampleRingBuffer.ts`)
Specialized subclass of `BoundedRingBuffer` providing backward-compatible signatures for oscilloscope acquisition pipelines.

---

## 8. SharedArrayBuffer Data Plane API (`src/data/shared/`)

### 8.1 `SharedMemoryCapability` (`src/data/shared/SharedMemoryCapability.ts`)
```typescript
export interface SharedMemoryCapabilityReport {
  isSupported: boolean;
  crossOriginIsolated: boolean;
  hasAtomics: boolean;
  canAllocateSAB: boolean;
  reason: string;
}

export class SharedMemoryCapability {
  public static check(forceRefresh?: boolean): SharedMemoryCapabilityReport;
  public static isSupported(): boolean;
  public static resetCache(): void;
}
```

### 8.2 `SharedRingBufferProducer` (`src/data/shared/SharedRingBufferProducer.ts`)
```typescript
export class SharedRingBufferProducer {
  constructor(buffer: SharedArrayBuffer);
  public readonly capacity: number;
  public readonly buffer: SharedArrayBuffer;

  public setState(state: 'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR'): void;
  public writeBatch(
    ch1: Float32Array,
    ch2: Float32Array,
    count: number,
    metadata?: Partial<SharedBatchMetadata>
  ): void;
  public reset(): void;
  public getStats(): SharedRingBufferStats;
}
```

### 8.3 `SharedRingBufferConsumer` (`src/data/shared/SharedRingBufferConsumer.ts`)
```typescript
export class SharedRingBufferConsumer {
  constructor(buffer: SharedArrayBuffer);
  public readonly capacity: number;
  public readonly buffer: SharedArrayBuffer;

  public readAvailable(ch1Out: Float32Array, ch2Out: Float32Array, maxCount?: number): number;
  public peekLatest(ch1Out: Float32Array, ch2Out: Float32Array, count: number): number;
  public flush(): void;
  public getStats(): SharedRingBufferStats;
}
```

### 8.4 `DataPlaneTransport` (`src/data/shared/DataPlaneTransport.ts`)
```typescript
export type DataPlaneTransportMode = 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING';

export interface IDataPlaneTransport {
  readonly mode: DataPlaneTransportMode;
  readonly capacity: number;
  writeBatch(ch1: Float32Array, ch2: Float32Array, count: number, metadata?: Partial<SharedBatchMetadata>): void;
  readAvailable(ch1Out: Float32Array, ch2Out: Float32Array, maxCount?: number): number;
  peekLatest(ch1Out: Float32Array, ch2Out: Float32Array, count: number): number;
  getStats(): SharedRingBufferStats;
  reset(): void;
  dispose(): void;
}

export class DataPlaneTransport {
  public static create(
    capacity?: number,
    options?: { forceFallback?: boolean; sampleRate?: number }
  ): IDataPlaneTransport;
}

---

## 9. WebAssembly DSP Core API (`src/wasm/`)

### 9.1 Types & Interfaces (`src/wasm/types.ts`)
```typescript
export interface SignalStats {
  min: number;         // Minimum voltage (V)
  max: number;         // Maximum voltage (V)
  vpp: number;         // Peak-to-peak voltage Vpp = max - min (V)
  rms: number;         // True RMS voltage (V)
  mean: number;        // DC offset / mean voltage (V)
  sampleCount: number; // Number of processed samples
}

export const WASM_ERR_OK = 0;
export const WASM_ERR_NULL_POINTER = -1;
export const WASM_ERR_INVALID_COUNT = -2;
export const WASM_ERR_OUT_OF_BOUNDS = -3;
export const WASM_ERR_INVALID_BUCKETS = -4;

export interface IWasmDspEngine {
  readonly isInitialized: boolean;
  readonly memoryByteSize: number;
  init(): Promise<void>;
  computeStats(samples: Float32Array): SignalStats;
  peakDetectDecimate(
    samples: Float32Array,
    bucketCount: number,
    outMin?: Float32Array,
    outMax?: Float32Array
  ): { min: Float32Array; max: Float32Array };
}
```

### 9.2 `WasmDspEngine` (`src/wasm/WasmDspEngine.ts`)
```typescript
export class WasmDspEngine implements IWasmDspEngine {
  public get isInitialized(): boolean;
  public get memoryByteSize(): number;
  public init(): Promise<void>;
  public computeStats(samples: Float32Array): SignalStats;
  public peakDetectDecimate(
    samples: Float32Array,
    bucketCount: number,
    outMin?: Float32Array,
    outMax?: Float32Array
  ): { min: Float32Array; max: Float32Array };
}
```

### 9.3 `JsDspEngine` Reference Engine (`src/wasm/JsDspEngine.ts`)
Zero-dependency Pure TypeScript implementation conforming to `IWasmDspEngine` for baseline benchmarking, unit test cross-validation, and non-WASM runtime fallback.

---

## 10. DSP Reference Algorithms API (`src/dsp/`)

### 10.1 Statistical Reduction Functions (`src/dsp/statistics.ts`)
```typescript
export function computeMean(samples: Float32Array | number[]): number;
export function computeMin(samples: Float32Array | number[]): number;
export function computeMax(samples: Float32Array | number[]): number;
export function computePeakToPeak(samples: Float32Array | number[]): number;
export function computeRms(samples: Float32Array | number[]): number;
export function computeSignalStats(samples: Float32Array | number[]): SignalStats;
```

### 10.2 Zero Crossing Detection (`src/dsp/zeroCrossing.ts`)
```typescript
export type ZeroCrossingDirection = 'RISING' | 'FALLING' | 'BOTH';

export interface ZeroCrossingOptions {
  threshold?: number;           // Default: 0.0 V
  hysteresis?: number;          // Default: 0.0 V (Schmitt trigger band)
  direction?: ZeroCrossingDirection; // Default: 'BOTH'
}

export interface ZeroCrossing {
  index: number;                // Sub-sample linearly interpolated fractional index
  direction: 'RISING' | 'FALLING';
  slope: number;                // Slope at crossing (V/sample)
}

export function findZeroCrossings(
  samples: Float32Array | number[],
  options?: ZeroCrossingOptions
): ZeroCrossing[];
```

### 10.3 Fundamental Frequency & Period Estimation (`src/dsp/frequency.ts`)
```typescript
export interface FrequencyEstimationResult {
  frequency: number;            // Estimated fundamental frequency (Hz)
  period: number;               // Estimated period (s)
  cycleCount: number;           // Number of full cycles analyzed
  dutyCycle: number;            // Measured positive duty cycle (0.0 to 1.0)
  confidence: number;           // Confidence factor (0.0 to 1.0)
  valid: boolean;               // True if at least 1 full cycle is identified
}

export function estimateFrequency(
  samples: Float32Array | number[],
  sampleRate: number,
  options?: FrequencyOptions
): FrequencyEstimationResult;
```

### 10.4 FIR Filtering (`src/dsp/fir.ts`)
```typescript
export interface IFirFilter {
  readonly taps: number;
  readonly coefficients: Float64Array;
  reset(): void;
  processSample(sample: number): number;
  processBlock(samples: Float32Array, output?: Float32Array): Float32Array;
  filterBatch(samples: Float32Array): Float32Array;
}

export class FirFilter implements IFirFilter {
  constructor(coefficients: Float64Array | number[]);
  public static createMovingAverage(taps: number): FirFilter;
  public static createLowPass(
    sampleRate: number,
    cutoffFreq: number,
    taps?: number,
    window?: 'HANN' | 'HAMMING' | 'RECT'
  ): FirFilter;
}
```

### 10.5 IIR Biquad Filtering (`src/dsp/iir.ts`)
```typescript
export interface BiquadCoefficients {
  b0: number; b1: number; b2: number;
  a0: number; a1: number; a2: number;
}

export class IirBiquadFilter implements IIirFilter {
  constructor(coeffs: BiquadCoefficients, validateStability?: boolean);
  public static checkStability(a1: number, a2: number): boolean;
  public static createButterworthLowPass(sampleRate: number, cutoffFreq: number, Q?: number): IirBiquadFilter;
  public static createFirstOrderLowPass(sampleRate: number, cutoffFreq: number): IirBiquadFilter;
  public processSample(x: number): number;
  public processBlock(samples: Float32Array, output?: Float32Array): Float32Array;
  public filterBatch(samples: Float32Array): Float32Array;
  public reset(): void;
}
```

