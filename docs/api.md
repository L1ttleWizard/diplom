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
