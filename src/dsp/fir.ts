/**
 * FIR (Finite Impulse Response) Filter Reference Implementation (Wave 12)
 *
 * Implements Direct-Form FIR convolution with stateful streaming and batch processing:
 *   y[n] = \sum_{k=0}^{M-1} b[k] \cdot x[n - k]
 *
 * Includes standard design helpers:
 * - Moving Average
 * - Windowed-Sinc Low-Pass (Hann, Hamming, Rectangular)
 */

import { DspError, DspErrorCode, IFirFilter } from './types';

export class FirFilter implements IFirFilter {
  public readonly taps: number;
  public readonly coefficients: Float64Array;
  private readonly _state: Float64Array; // Delay line of size (taps - 1)

  constructor(coefficients: Float64Array | number[]) {
    if (!coefficients || coefficients.length === 0) {
      throw new DspError(DspErrorCode.INVALID_COEFFICIENTS, 'FIR filter coefficients cannot be empty');
    }

    this.taps = coefficients.length;
    this.coefficients = new Float64Array(coefficients);
    this._state = new Float64Array(Math.max(0, this.taps - 1));
  }

  /**
   * Resets internal delay line to zeros.
   */
  public reset(): void {
    this._state.fill(0.0);
  }

  /**
   * Processes a single input sample through the FIR filter.
   *
   * @param sample - Input scalar value x[n]
   * @returns Filtered output y[n]
   */
  public processSample(sample: number): number {
    if (this.taps === 1) {
      return this.coefficients[0] * sample;
    }

    // y[n] = b[0] * x[n] + \sum_{k=1}^{M-1} b[k] * state[k-1]
    let y = this.coefficients[0] * sample;
    const stateLen = this._state.length;

    for (let k = 0; k < stateLen; k++) {
      y += this.coefficients[k + 1] * this._state[k];
    }

    // Shift delay line: state[k] <- state[k-1], state[0] <- sample
    for (let k = stateLen - 1; k > 0; k--) {
      this._state[k] = this._state[k - 1];
    }
    this._state[0] = sample;

    return y;
  }

  /**
   * Processes a contiguous block of samples, updating filter state continuously.
   *
   * @param samples - Input buffer
   * @param output - Optional preallocated buffer for output
   * @returns Filtered output buffer
   */
  public processBlock(samples: Float32Array, output?: Float32Array): Float32Array {
    const len = samples.length;
    const out = output && output.length >= len ? output : new Float32Array(len);

    for (let i = 0; i < len; i++) {
      out[i] = this.processSample(samples[i]);
    }

    return out;
  }

  /**
   * Filters an entire batch with zero initial condition without mutating streaming state.
   */
  public filterBatch(samples: Float32Array): Float32Array {
    const freshFilter = new FirFilter(this.coefficients);
    return freshFilter.processBlock(samples);
  }

  /**
   * Factory: Creates a Moving Average FIR filter of M taps:
   *   b[k] = 1 / M
   */
  public static createMovingAverage(taps: number): FirFilter {
    if (taps <= 0 || !Number.isInteger(taps)) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, `Taps must be positive integer, got ${taps}`);
    }

    const coeffs = new Float64Array(taps);
    coeffs.fill(1.0 / taps);
    return new FirFilter(coeffs);
  }

  /**
   * Factory: Creates a Windowed-Sinc Low-Pass FIR filter.
   *
   * @param sampleRate - Sampling frequency in Hz (fs)
   * @param cutoffFreq - Cutoff frequency in Hz (fc < fs / 2)
   * @param taps - Number of filter taps (preferably odd for Type I linear phase)
   * @param window - Window function type ('HANN' | 'HAMMING' | 'RECT', default 'HANN')
   */
  public static createLowPass(
    sampleRate: number,
    cutoffFreq: number,
    taps: number = 31,
    window: 'HANN' | 'HAMMING' | 'RECT' = 'HANN'
  ): FirFilter {
    if (sampleRate <= 0 || cutoffFreq <= 0) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, 'Sample rate and cutoff must be positive');
    }
    if (cutoffFreq >= sampleRate / 2) {
      throw new DspError(
        DspErrorCode.INVALID_PARAMETER,
        `Cutoff frequency (${cutoffFreq}) must be below Nyquist (${sampleRate / 2})`
      );
    }
    if (taps < 3) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, 'FIR low-pass filter requires at least 3 taps');
    }

    const coeffs = new Float64Array(taps);
    const fNorm = cutoffFreq / sampleRate;
    const mid = (taps - 1) / 2.0;

    let sum = 0.0;
    for (let i = 0; i < taps; i++) {
      const n = i - mid;
      let h: number;
      if (Math.abs(n) < 1e-7) {
        h = 2.0 * Math.PI * fNorm;
      } else {
        h = Math.sin(2.0 * Math.PI * fNorm * n) / n;
      }

      // Apply window function
      let w = 1.0;
      if (window === 'HANN') {
        w = 0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / (taps - 1));
      } else if (window === 'HAMMING') {
        w = 0.54 - 0.46 * Math.cos((2.0 * Math.PI * i) / (taps - 1));
      }

      coeffs[i] = h * w;
      sum += coeffs[i];
    }

    // Normalize for unity DC gain (H(0) = 1.0)
    if (sum !== 0) {
      for (let i = 0; i < taps; i++) {
        coeffs[i] /= sum;
      }
    }

    return new FirFilter(coeffs);
  }
}
