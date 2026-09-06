import { SignalGenerator } from '../../domain/simulation/SignalGenerator';
import { SimulationClock } from '../../domain/simulation/SimulationClock';
import { WaveformType } from '../../domain/simulation/types';
import { OscilloscopeService } from '../services/OscilloscopeService';
import { BoundedRingBuffer } from '../../data/BoundedRingBuffer';
import { TriggerEngine } from '../../domain/trigger/TriggerEngine';
import { CaptureWindow } from '../../domain/trigger/types';

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
  public readonly triggerEngine: TriggerEngine;

  // Pre-allocated scratch buffers to ensure ZERO allocations in runtime loop
  private readonly _batchScratch: Float32Array;
  private readonly _displayBuffer: Float32Array;

  // Trigger state tracking
  private _lastTriggerSampleIndex: number = -1;
  private _lastTriggerLocked: boolean = false;
  private _newlyAcquiredSamplesSinceRender: number = 0;

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

    this.triggerEngine = new TriggerEngine({
      sampleRate: this.config.sampleRate,
      timeDiv: this.service.oscilloscope.timeDiv.value,
      level: this.service.oscilloscope.trigger.level,
      slope: this.service.oscilloscope.trigger.slope,
      mode: this.service.oscilloscope.trigger.mode,
      source: this.service.oscilloscope.trigger.source,
      holdoff: this.service.oscilloscope.trigger.holdoff,
      position: this.service.oscilloscope.trigger.position,
      hysteresis: this.service.oscilloscope.trigger.hysteresis,
      autoTimeout: this.service.oscilloscope.trigger.autoTimeout
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
    this._newlyAcquiredSamplesSinceRender += sampleCount;
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
   * Delegates to TriggerEngine detector.
   */
  public findTriggerCrossing(
    level: number,
    edge: 'RISING' | 'FALLING' = 'RISING',
    searchSpan: number = 4096,
    maxSearchIndex?: number
  ): number {
    const totalWritten = this.ringBuffer.totalWritten;
    const upperLimit = maxSearchIndex !== undefined ? Math.min(totalWritten - 1, maxSearchIndex) : totalWritten - 1;
    
    this.triggerEngine.detector.setLevel(level);
    this.triggerEngine.detector.setSlope(edge);
    const res = this.triggerEngine.detector.findTriggerReverse(
      (idx) => this.sampleAtGlobal(idx),
      upperLimit,
      searchSpan
    );
    return res ? res.sampleIndex : -1;
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
   * Uses sample-domain TriggerEngine for zero-jitter phase alignment and mode semantics.
   */
  public computeDisplayBuffer(
    destination?: Float32Array,
    pointsCount?: number
  ): Float32Array {
    const points = pointsCount ?? this.config.displayPoints;
    const dest = destination ?? this._displayBuffer;

    const scope = this.service.oscilloscope;
    const timeDiv = scope.timeDiv.value;
    const ch1 = scope.getChannel('CH1');
    const voltDiv = ch1.voltsPerDiv.value;
    const chOffset = ch1.offset;
    const trigger = scope.trigger;

    // Synchronize TriggerEngine with active domain settings
    this.triggerEngine.configure({
      sampleRate: this.config.sampleRate,
      timeDiv,
      level: trigger.level,
      slope: trigger.slope,
      mode: trigger.mode,
      source: trigger.source,
      holdoff: trigger.holdoff,
      position: trigger.position,
      hysteresis: trigger.hysteresis,
      autoTimeout: trigger.autoTimeout
    });

    const totalWritten = this.ringBuffer.totalWritten;
    const totalRead = this.ringBuffer.totalRead;

    const captureWin = this.triggerEngine.processAcquisition(
      (idx) => this.sampleAtGlobal(idx),
      totalWritten,
      totalRead,
      this._newlyAcquiredSamplesSinceRender
    );
    this._newlyAcquiredSamplesSinceRender = 0;

    if (captureWin !== null) {
      this._lastTriggerSampleIndex = captureWin.triggerSampleIndex;
      this._lastTriggerLocked = captureWin.isTriggered;

      this.triggerEngine.extractDisplayBuffer(
        (idx) => this.sampleAtGlobal(idx),
        captureWin,
        dest,
        points,
        voltDiv,
        chOffset
      );

      if (captureWin.isTriggered) {
        scope.notifyTriggerFired(
          captureWin.triggerSampleIndex,
          captureWin.fractionalOffset,
          captureWin.isForcedAuto
        );
      }
    } else {
      if (this.triggerEngine.state === 'WAITING_TRIGGER') {
        this._lastTriggerLocked = false;
      }
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
      triggerPosition: trigger.position * 10, // Position in graticule divisions
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
