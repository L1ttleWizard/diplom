import { ClockState } from './types';
import { DomainValidationError } from '../types';

/**
 * Deterministic Simulation Clock.
 *
 * Implements sample-driven time progression:
 *   simulationTime = sampleIndex / sampleRate
 *   timeStep = 1.0 / sampleRate
 *
 * Strictly adheres to GEMINI.md Rule 1 and Rule 3:
 * Zero wall-clock (Date.now(), performance.now()) usage.
 * Exact mathematical determinism across all platforms and execution speeds.
 */
export class SimulationClock {
  private _sampleIndex: number = 0;
  private _sampleRate: number;

  constructor(sampleRate: number = 1_000_000, initialIndex: number = 0) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new DomainValidationError('sampleRate', 'Sample rate must be a positive finite number');
    }
    this._sampleRate = sampleRate;
    this._sampleIndex = Math.max(0, Math.floor(initialIndex));
  }

  /**
   * Current discrete sample index (monotonic integer count)
   */
  public get sampleIndex(): number {
    return this._sampleIndex;
  }

  /**
   * Sampling rate in samples per second (Hz)
   */
  public get sampleRate(): number {
    return this._sampleRate;
  }

  /**
   * Current deterministic simulation time in seconds
   */
  public get simulationTime(): number {
    return this._sampleIndex / this._sampleRate;
  }

  /**
   * Exact physical delta time between adjacent samples
   */
  public get timeStep(): number {
    return 1.0 / this._sampleRate;
  }

  /**
   * Advance clock by exactly 1 sample tick.
   * @returns Updated simulation time in seconds
   */
  public step(): number {
    this._sampleIndex++;
    return this.simulationTime;
  }

  /**
   * Advance clock by specified integer number of sample ticks.
   * @param numSamples Number of samples to advance (must be non-negative)
   * @returns Updated simulation time in seconds
   */
  public advance(numSamples: number): number {
    if (numSamples < 0) {
      throw new DomainValidationError('numSamples', 'Cannot advance clock by negative samples');
    }
    this._sampleIndex += Math.floor(numSamples);
    return this.simulationTime;
  }

  /**
   * Reset the clock back to sampleIndex = 0 (t = 0.0s)
   */
  public reset(): void {
    this._sampleIndex = 0;
  }

  /**
   * Deterministically jump to a specific simulation time.
   * Converts seconds into nearest discrete sample index.
   */
  public setTime(timeInSeconds: number): void {
    if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
      throw new DomainValidationError('timeInSeconds', 'Simulation time must be a non-negative finite number');
    }
    this._sampleIndex = Math.round(timeInSeconds * this._sampleRate);
  }

  /**
   * Deterministically set sample index directly.
   */
  public setSampleIndex(index: number): void {
    if (!Number.isFinite(index) || index < 0) {
      throw new DomainValidationError('index', 'Sample index must be a non-negative finite integer');
    }
    this._sampleIndex = Math.floor(index);
  }

  /**
   * Update sample rate, preserving current simulation time as closely as discrete quantization allows.
   */
  public setSampleRate(newRate: number): void {
    if (!Number.isFinite(newRate) || newRate <= 0) {
      throw new DomainValidationError('sampleRate', 'Sample rate must be a positive finite number');
    }
    const currentSeconds = this.simulationTime;
    this._sampleRate = newRate;
    this._sampleIndex = Math.round(currentSeconds * newRate);
  }

  /**
   * Compute exact deterministic simulation time for an arbitrary sample index without mutating state.
   */
  public timeAt(index: number): number {
    return index / this._sampleRate;
  }

  /**
   * Export an immutable state snapshot
   */
  public snapshot(): ClockState {
    return {
      sampleIndex: this._sampleIndex,
      sampleRate: this._sampleRate,
      simulationTime: this.simulationTime,
      timeStep: this.timeStep
    };
  }
}
