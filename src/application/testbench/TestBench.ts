import { SignalGenerator } from '../../domain/simulation/SignalGenerator';
import { SimulationClock } from '../../domain/simulation/SimulationClock';
import { WaveformType } from '../../domain/simulation/types';
import { OscilloscopeService } from '../services/OscilloscopeService';
import { BoundedRingBuffer } from '../../data/BoundedRingBuffer';

export interface TestBenchConfig {
  sampleRate: number;      // Samples per second (default: 1_000_000)
  signalFrequency: number; // Hz (default: 1000)
  signalAmplitude: number; // Peak amplitude in Volts (default: 1.0, Vpp = 2.0)
  signalOffset: number;    // DC offset in Volts (default: 0.0)
  signalWaveform: WaveformType; // default: 'SINE'
  bufferCapacity: number;  // default: 65536
  displayPoints: number;   // default: 600
}

export interface TestBenchTelemetry {
  frequency: number;          // Hz
  amplitude: number;          // Peak in Volts
  sampleRate: number;         // S/s
  timeDiv: number;            // s/div
  voltsDiv: number;           // V/div
  triggerLevel: number;       // Volts
  visibleTimeWindow: number;  // Seconds (10 * timeDiv)
  displayBufferSize: number;  // Point count
  triggerPosition: number;    // Horizontal division index (5.0 = center)
  triggered: boolean;         // True if edge trigger locked
  triggerSampleIndex: number; // Global index of locked trigger
  totalAcquiredSamples: number;
}

export const DEFAULT_TESTBENCH_CONFIG: TestBenchConfig = {
  sampleRate: 1_000_000,
  signalFrequency: 1000,
  signalAmplitude: 1.0,
  signalOffset: 0.0,
  signalWaveform: 'SINE',
  bufferCapacity: 65536,
  displayPoints: 600
};

/**
 * TestBench: Application-level orchestrator connecting Signal Generator,
 * Acquisition, Bounded Ring Buffer, Trigger Engine, and Display Buffer.
 */
export class TestBench {
  public readonly config: TestBenchConfig;
  public readonly service: OscilloscopeService;
  public readonly signalGenerator: SignalGenerator;
  public readonly clock: SimulationClock;
  public readonly ringBuffer: BoundedRingBuffer;

  // Pre-allocated scratch buffers to ensure ZERO allocations in runtime loop
  private readonly _batchScratch: Float32Array;
  private readonly _displayBuffer: Float32Array;

  // Trigger state tracking
  private _lastTriggerSampleIndex: number = -1;
  private _lastTriggerLocked: boolean = false;

  constructor(
    config?: Partial<TestBenchConfig>,
    service?: OscilloscopeService
  ) {
    this.config = { ...DEFAULT_TESTBENCH_CONFIG, ...config };
    this.service = service ?? new OscilloscopeService();

    this.clock = new SimulationClock(this.config.sampleRate);
    this.signalGenerator = new SignalGenerator({
      waveform: this.config.signalWaveform,
      frequency: this.config.signalFrequency,
      amplitude: this.config.signalAmplitude * 2.0, // Vpp = 2 * Peak
      offset: this.config.signalOffset
    });

    this.ringBuffer = new BoundedRingBuffer({
      capacity: this.config.bufferCapacity,
      overflowPolicy: 'OVERWRITE',
      underflowPolicy: 'PARTIAL'
    });

    // Scratch buffers
    this._batchScratch = new Float32Array(32768);
    this._displayBuffer = new Float32Array(this.config.displayPoints);

    // Prime the ring buffer with initial samples (at least 20 ms of data)
    const initialSamples = Math.min(
      this.config.bufferCapacity,
      Math.round(this.config.sampleRate * 0.02)
    );
    this.acquire(initialSamples);
  }

  /**
   * Generates a batch of physical samples from the signal generator and writes
   * them into the circular ring buffer.
   *
   * @param sampleCount Number of samples to synthesize and acquire.
   */
  public acquire(sampleCount: number): void {
    if (sampleCount <= 0) return;

    let remaining = sampleCount;
    while (remaining > 0) {
      const chunk = Math.min(remaining, this._batchScratch.length);
      this.signalGenerator.generateBatch(this.clock, chunk, this._batchScratch);
      this.ringBuffer.write(this._batchScratch, chunk);
      remaining -= chunk;
    }
  }

  /**
   * Advance simulation by deltaMs, synthesizing new samples based on sampleRate.
   */
  public step(deltaMs: number): void {
    if (this.service.getState() === 'STOPPED') {
      return; // Freeze acquisition when oscilloscope is in STOP mode
    }

    const samplesToGenerate = Math.max(
      1,
      Math.round((deltaMs / 1000) * this.config.sampleRate)
    );
    this.acquire(samplesToGenerate);
  }

  /**
   * Searches for digital trigger condition in recent samples.
   *
   * @param level Trigger threshold in Volts.
   * @param edge 'RISING' | 'FALLING'
   * @param searchSpan Maximum number of samples to look back.
   * @returns Global sample index of the trigger crossing, or -1 if not found.
   */
  public findTriggerCrossing(
    level: number,
    edge: 'RISING' | 'FALLING' = 'RISING',
    searchSpan: number = 4096,
    maxSearchIndex?: number
  ): number {
    const totalWritten = this.ringBuffer.totalWritten;
    const oldestAvailable = this.ringBuffer.totalRead;
    const available = totalWritten - oldestAvailable;

    if (available < 2) return -1;

    const upperLimit = maxSearchIndex !== undefined ? Math.min(totalWritten - 1, maxSearchIndex) : totalWritten - 1;
    const lowerLimit = Math.max(oldestAvailable + 1, upperLimit - searchSpan);

    if (upperLimit <= lowerLimit) return -1;

    // Search backwards from upperLimit towards lowerLimit
    for (let idx = upperLimit; idx >= lowerLimit; idx--) {
      const vPrev = this.sampleAtGlobal(idx - 1);
      const vCurr = this.sampleAtGlobal(idx);

      if (vPrev === null || vCurr === null) continue;

      if (edge === 'RISING') {
        if (vPrev < level && vCurr >= level) {
          return idx;
        }
      } else {
        if (vPrev > level && vCurr <= level) {
          return idx;
        }
      }
    }

    return -1;
  }

  /**
   * Retrieves physical sample voltage at absolute acquisition index without allocations.
   */
  public sampleAtGlobal(globalIndex: number): number | null {
    const oldest = this.ringBuffer.totalRead;
    const newest = this.ringBuffer.totalWritten;

    if (globalIndex < oldest || globalIndex >= newest) {
      return null;
    }

    const offsetFromRead = globalIndex - oldest;
    return this.ringBuffer.peek(offsetFromRead);
  }

  /**
   * Decimates and transforms ring buffer samples into the display buffer.
   * Applies horizontal time windowing and vertical Volt/Div scaling.
   */
  public computeDisplayBuffer(
    destination?: Float32Array,
    pointsCount?: number
  ): Float32Array {
    const points = pointsCount ?? this.config.displayPoints;
    const dest = destination ?? this._displayBuffer;

    const scope = this.service.oscilloscope;
    const timeDiv = scope.timeDiv.value; // seconds per div
    const ch1 = scope.getChannel('CH1');
    const voltDiv = ch1.voltsPerDiv.value; // Volts per div
    const chOffset = ch1.offset; // Volts
    const trigger = scope.trigger;

    // 10 divisions across the horizontal graticule
    const visibleTimeWindow = 10 * timeDiv;
    const samplesInWindow = Math.max(2, Math.round(visibleTimeWindow * this.config.sampleRate));
    const halfWindow = Math.round(samplesInWindow * 0.5);

    const oldestAvailable = this.ringBuffer.totalRead;
    const newestAvailable = this.ringBuffer.totalWritten;

    // Trigger search with post-trigger margin so the right half of the screen is not truncated
    const maxSearchIdx = newestAvailable - 1 - halfWindow;
    const searchSpan = Math.max(samplesInWindow * 2, 4096);

    let trigIdx = -1;
    if (maxSearchIdx > oldestAvailable + 2) {
      trigIdx = this.findTriggerCrossing(
        trigger.level,
        trigger.slope === 'FALLING' ? 'FALLING' : 'RISING',
        searchSpan,
        maxSearchIdx
      );
    }

    let startSampleIndex: number;

    if (trigIdx !== -1) {
      this._lastTriggerSampleIndex = trigIdx;
      this._lastTriggerLocked = true;
      startSampleIndex = trigIdx - halfWindow;
    } else {
      this._lastTriggerLocked = false;
      if (trigger.mode === 'AUTO') {
        startSampleIndex = newestAvailable - samplesInWindow;
      } else {
        startSampleIndex =
          this._lastTriggerSampleIndex !== -1
            ? this._lastTriggerSampleIndex - halfWindow
            : newestAvailable - samplesInWindow;
      }
    }

    if (startSampleIndex < oldestAvailable) {
      startSampleIndex = oldestAvailable;
    }

    // Decimation & Vertical Transformation
    const centerPointIdx = Math.floor(points / 2);
    for (let i = 0; i < points; i++) {
      let sampleIdx: number;
      if (trigIdx !== -1) {
        // Exactly map center display index (e.g. 300) to trigIdx
        sampleIdx = trigIdx + Math.round(((i - centerPointIdx) / points) * samplesInWindow);
      } else {
        const frac = i / (points - 1);
        sampleIdx = Math.round(startSampleIndex + frac * samplesInWindow);
      }

      sampleIdx = Math.min(newestAvailable - 1, Math.max(oldestAvailable, sampleIdx));

      const rawVoltage = this.sampleAtGlobal(sampleIdx) ?? 0.0;
      const divOffset = (rawVoltage - chOffset) / voltDiv;
      dest[i] = divOffset;
    }

    return dest;
  }

  /**
   * Diagnostic telemetry for validation and HUD reporting.
   */
  public getTelemetry(): TestBenchTelemetry {
    const scope = this.service.oscilloscope;
    const timeDiv = scope.timeDiv.value;
    const ch1 = scope.getChannel('CH1');
    const voltsDiv = ch1.voltsPerDiv.value;
    const trigger = scope.trigger;

    return {
      frequency: this.signalGenerator.frequency,
      amplitude: this.signalGenerator.amplitude / 2.0, // Peak voltage
      sampleRate: this.config.sampleRate,
      timeDiv,
      voltsDiv,
      triggerLevel: trigger.level,
      visibleTimeWindow: 10 * timeDiv,
      displayBufferSize: this.config.displayPoints,
      triggerPosition: 5.0, // 5th division = center
      triggered: this._lastTriggerLocked,
      triggerSampleIndex: this._lastTriggerSampleIndex,
      totalAcquiredSamples: this.ringBuffer.totalWritten
    };
  }

  /**
   * Get direct reference to pre-allocated display buffer.
   */
  public getCh1DisplayBuffer(): Float32Array {
    return this._displayBuffer;
  }
}
