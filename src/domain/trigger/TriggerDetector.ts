/**
 * TriggerDetector (Wave 14)
 *
 * High-performance sample-domain Schmitt trigger comparator for oscilloscopes:
 * - Edge detection: Rising and Falling
 * - Hysteresis band for noise and chatter immunity
 * - Holdoff timer preventing secondary triggers on complex bursts
 * - Sub-sample linear interpolation for zero-jitter waveform phase alignment
 * - Forward streaming and reverse ring-buffer search
 */

import { TriggerSlope } from '../types';
import { TriggerDetectionResult, TriggerDetectorState } from './types';

export interface TriggerDetectorOptions {
  level?: number;
  slope?: TriggerSlope;
  hysteresis?: number;
  holdoffSamples?: number;
  sampleRate?: number;
}

export class TriggerDetector {
  private _level: number;
  private _slope: TriggerSlope;
  private _hysteresis: number;
  private _holdoffSamples: number;
  private _sampleRate: number;

  // Comparator internal state
  private _armed: boolean;
  private _lastTriggerSampleIndex: number;
  private _prevSample: number | null;
  private _state: TriggerDetectorState;

  constructor(options: TriggerDetectorOptions = {}) {
    this._level = options.level ?? 0.0;
    this._slope = options.slope ?? 'RISING';
    this._hysteresis = options.hysteresis ?? 0.02; // 20mV default noise band
    this._holdoffSamples = options.holdoffSamples ?? 100;
    this._sampleRate = options.sampleRate ?? 1_000_000;

    this._armed = false;
    this._lastTriggerSampleIndex = -Number.MAX_SAFE_INTEGER;
    this._prevSample = null;
    this._state = 'UNARMED';
  }

  public get level(): number {
    return this._level;
  }

  public get slope(): TriggerSlope {
    return this._slope;
  }

  public get hysteresis(): number {
    return this._hysteresis;
  }

  public get holdoffSamples(): number {
    return this._holdoffSamples;
  }

  public get sampleRate(): number {
    return this._sampleRate;
  }

  public get state(): TriggerDetectorState {
    return this._state;
  }

  public get isArmed(): boolean {
    return this._armed;
  }

  public get lastTriggerSampleIndex(): number {
    return this._lastTriggerSampleIndex;
  }

  public setLevel(level: number): void {
    this._level = level;
  }

  public setSlope(slope: TriggerSlope): void {
    this._slope = slope;
  }

  public setHysteresis(hysteresis: number): void {
    this._hysteresis = Math.max(0, hysteresis);
  }

  public setHoldoffSamples(samples: number): void {
    this._holdoffSamples = Math.max(0, Math.round(samples));
  }

  public setSampleRate(rate: number): void {
    this._sampleRate = Math.max(1, rate);
  }

  public reset(): void {
    this._armed = false;
    this._lastTriggerSampleIndex = -Number.MAX_SAFE_INTEGER;
    this._prevSample = null;
    this._state = 'UNARMED';
  }

  /**
   * Evaluates a single sample in continuous stream.
   *
   * @param sample - Physical voltage of current sample
   * @param sampleIndex - Monotonic global index of current sample
   * @returns TriggerDetectionResult if trigger fired on this sample, null otherwise
   */
  public processSample(sample: number, sampleIndex: number): TriggerDetectionResult | null {
    const vPrev = this._prevSample;
    this._prevSample = sample;

    if (vPrev === null) {
      // First sample: check initial arming
      this.updateArmingState(sample);
      return null;
    }

    // Check holdoff condition
    const holdoffElapsed = sampleIndex - this._lastTriggerSampleIndex >= this._holdoffSamples;
    if (!holdoffElapsed) {
      this._state = 'HOLDOFF';
      this.updateArmingState(sample);
      return null;
    }

    const vHigh = this._level + this._hysteresis;
    const vLow = this._level - this._hysteresis;

    if (this._slope === 'RISING') {
      // Arm condition: signal must drop below lower hysteresis threshold
      if (sample <= vLow) {
        this._armed = true;
        this._state = 'ARMED';
      }

      // Trigger condition: armed and crossing level upward
      if (this._armed && vPrev < this._level && sample >= this._level) {
        const vDiff = sample - vPrev;
        const delta = vDiff > 1e-12 ? Math.min(0.999999, Math.max(0.0, (this._level - vPrev) / vDiff)) : 0.0;
        const timestamp = (sampleIndex - 1 + delta) / this._sampleRate;

        this._armed = false;
        this._lastTriggerSampleIndex = sampleIndex;
        this._state = 'TRIGGERED';

        return {
          sampleIndex,
          fractionalOffset: delta,
          timestamp,
          slope: 'RISING',
          level: this._level,
          voltage: sample
        };
      }
    } else {
      // FALLING
      // Arm condition: signal must rise above upper hysteresis threshold
      if (sample >= vHigh) {
        this._armed = true;
        this._state = 'ARMED';
      }

      // Trigger condition: armed and crossing level downward
      if (this._armed && vPrev > this._level && sample <= this._level) {
        const vDiff = vPrev - sample;
        const delta = vDiff > 1e-12 ? Math.min(0.999999, Math.max(0.0, (vPrev - this._level) / vDiff)) : 0.0;
        const timestamp = (sampleIndex - 1 + delta) / this._sampleRate;

        this._armed = false;
        this._lastTriggerSampleIndex = sampleIndex;
        this._state = 'TRIGGERED';

        return {
          sampleIndex,
          fractionalOffset: delta,
          timestamp,
          slope: 'FALLING',
          level: this._level,
          voltage: sample
        };
      }
    }

    if (this._armed) {
      this._state = 'ARMED';
    } else {
      this._state = 'UNARMED';
    }

    return null;
  }

  /**
   * Processes a contiguous batch of samples from an array.
   */
  public findTriggerInBatch(
    samples: Float32Array,
    offset: number,
    count: number,
    baseSampleIndex: number
  ): TriggerDetectionResult | null {
    const end = Math.min(samples.length, offset + count);
    for (let i = offset; i < end; i++) {
      const res = this.processSample(samples[i], baseSampleIndex + (i - offset));
      if (res !== null) {
        return res;
      }
    }
    return null;
  }

  /**
   * Searches backwards in a sample window (e.g. from circular buffer)
   * to find the latest valid trigger crossing satisfying slope, level, and hysteresis.
   *
   * @param sampleAt - Accessor function returning sample voltage at monotonic index
   * @param searchEndIndex - Upper bound of search (most recent sample to check)
   * @param searchSpan - Maximum number of samples to look backwards
   */
  public findTriggerReverse(
    sampleAt: (index: number) => number | null,
    searchEndIndex: number,
    searchSpan: number
  ): TriggerDetectionResult | null {
    const searchStartIndex = Math.max(1, searchEndIndex - searchSpan);
    if (searchEndIndex <= searchStartIndex) return null;

    const vHigh = this._level + this._hysteresis;
    const vLow = this._level - this._hysteresis;

    // Scan backwards from searchEndIndex down to searchStartIndex
    for (let idx = searchEndIndex; idx >= searchStartIndex; idx--) {
      const vPrev = sampleAt(idx - 1);
      const vCurr = sampleAt(idx);
      if (vPrev === null || vCurr === null) continue;

      if (this._slope === 'RISING') {
        if (vPrev < this._level && vCurr >= this._level) {
          // Verify hysteresis: check preceding samples for drop below vLow
          let armed = false;
          const preLookback = Math.min(256, idx - searchStartIndex);
          for (let k = 1; k <= preLookback; k++) {
            const v = sampleAt(idx - k);
            if (v !== null && v <= vLow) {
              armed = true;
              break;
            }
          }

          if (armed || this._hysteresis === 0) {
            const vDiff = vCurr - vPrev;
            const delta = vDiff > 1e-12 ? Math.min(0.999999, Math.max(0.0, (this._level - vPrev) / vDiff)) : 0.0;
            const timestamp = (idx - 1 + delta) / this._sampleRate;

            return {
              sampleIndex: idx,
              fractionalOffset: delta,
              timestamp,
              slope: 'RISING',
              level: this._level,
              voltage: vCurr
            };
          }
        }
      } else {
        // FALLING
        if (vPrev > this._level && vCurr <= this._level) {
          // Verify hysteresis: check preceding samples for rise above vHigh
          let armed = false;
          const preLookback = Math.min(256, idx - searchStartIndex);
          for (let k = 1; k <= preLookback; k++) {
            const v = sampleAt(idx - k);
            if (v !== null && v >= vHigh) {
              armed = true;
              break;
            }
          }

          if (armed || this._hysteresis === 0) {
            const vDiff = vPrev - vCurr;
            const delta = vDiff > 1e-12 ? Math.min(0.999999, Math.max(0.0, (vPrev - this._level) / vDiff)) : 0.0;
            const timestamp = (idx - 1 + delta) / this._sampleRate;

            return {
              sampleIndex: idx,
              fractionalOffset: delta,
              timestamp,
              slope: 'FALLING',
              level: this._level,
              voltage: vCurr
            };
          }
        }
      }
    }

    return null;
  }

  private updateArmingState(sample: number): void {
    if (this._slope === 'RISING') {
      if (sample <= this._level - this._hysteresis) {
        this._armed = true;
        this._state = 'ARMED';
      }
    } else {
      if (sample >= this._level + this._hysteresis) {
        this._armed = true;
        this._state = 'ARMED';
      }
    }
  }
}
