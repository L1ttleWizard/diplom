import { SimulationClock } from '../simulation/SimulationClock';
import { AcquisitionChannel } from './AcquisitionChannel';
import { ADCConversionResult, LogicalSampleRate } from './types';
import { DomainValidationError } from '../types';

export interface AcquisitionEngineConfig {
  sampleRate?: LogicalSampleRate | number;
  maxBatchSize?: number;
}

export interface DualChannelAcquisitionResult {
  sampleCount: number;
  simulationTimeStart: number;
  simulationTimeEnd: number;
  ch1: ADCConversionResult;
  ch2: ADCConversionResult;
}

/**
 * Multi-Channel Acquisition Engine (Data Plane Orchestrator).
 *
 * Coordinates simultaneous, synchronized, clock-driven acquisition
 * across independent CH1 and CH2 channels.
 * Zero direct connection to GPU/Three.js.
 */
export class AcquisitionEngine {
  private readonly _clock: SimulationClock;
  public readonly ch1: AcquisitionChannel;
  public readonly ch2: AcquisitionChannel;

  // Preallocated scratch buffers for zero-allocation batch processing
  private readonly _maxBatchSize: number;
  private readonly _scratchRaw: Float32Array;
  private readonly _scratchAfe: Float32Array;

  // Output buffers for calibrated quantized voltages
  public readonly ch1QuantizedBuffer: Float32Array;
  public readonly ch2QuantizedBuffer: Float32Array;

  constructor(config: AcquisitionEngineConfig = {}) {
    const rate = config.sampleRate ?? 1_000_000;
    this._clock = new SimulationClock(rate);
    this._maxBatchSize = config.maxBatchSize ?? 100_000;

    this.ch1 = new AcquisitionChannel({ id: 'CH1' });
    this.ch2 = new AcquisitionChannel({ id: 'CH2' });

    this._scratchRaw = new Float32Array(this._maxBatchSize);
    this._scratchAfe = new Float32Array(this._maxBatchSize);
    this.ch1QuantizedBuffer = new Float32Array(this._maxBatchSize);
    this.ch2QuantizedBuffer = new Float32Array(this._maxBatchSize);

    // Sync ADC sample rates
    this.ch1.adc.setSampleRate(rate);
    this.ch2.adc.setSampleRate(rate);
  }

  public get clock(): SimulationClock {
    return this._clock;
  }

  public get sampleRate(): number {
    return this._clock.sampleRate;
  }

  public setSampleRate(rate: number): void {
    if (rate !== 1_000_000 && rate !== 2_000_000 && rate !== 5_000_000) {
      // Validate logical sample rate recommendation
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new DomainValidationError('sampleRate', 'Sample rate must be a positive finite number');
      }
    }
    this._clock.setSampleRate(rate);
    this.ch1.adc.setSampleRate(rate);
    this.ch2.adc.setSampleRate(rate);
  }

  /**
   * Performs clock-synchronized multi-channel acquisition of `count` samples.
   * Advances the SimulationClock by `count` samples.
   *
   * Zero heap allocations.
   */
  public acquire(count: number): DualChannelAcquisitionResult {
    if (count <= 0 || count > this._maxBatchSize) {
      throw new DomainValidationError(
        'count',
        `Batch size must be between 1 and maxBatchSize (${this._maxBatchSize})`
      );
    }

    const timeStart = this._clock.simulationTime;

    // 1. Acquire CH1
    const resCh1 = this.ch1.acquireBatch(
      this._clock,
      count,
      this._scratchRaw,
      this._scratchAfe,
      this.ch1QuantizedBuffer
    );

    // 2. Acquire CH2
    const resCh2 = this.ch2.acquireBatch(
      this._clock,
      count,
      this._scratchRaw,
      this._scratchAfe,
      this.ch2QuantizedBuffer
    );

    // 3. Advance clock after both channels have sampled the same time window
    this._clock.advance(count);
    const timeEnd = this._clock.simulationTime;

    return {
      sampleCount: count,
      simulationTimeStart: timeStart,
      simulationTimeEnd: timeEnd,
      ch1: resCh1,
      ch2: resCh2
    };
  }

  public reset(): void {
    this._clock.reset();
    this.ch1.afe.resetFilters();
    this.ch2.afe.resetFilters();
  }
}
