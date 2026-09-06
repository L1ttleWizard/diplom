/**
 * IIR (Infinite Impulse Response) Filter Reference Implementation (Wave 12)
 *
 * Implements Direct Form II Transposed Biquad (Second-Order Section):
 *   y[n] = b0 * x[n] + d1
 *   d1   = b1 * x[n] - a1 * y[n] + d2
 *   d2   = b2 * x[n] - a2 * y[n]
 *
 * Includes:
 * - Jury stability criterion validation
 * - Butterworth 2nd-Order Low-Pass design via Bilinear Transform
 * - 1st-Order RC Equivalent Low-Pass design
 */

import { BiquadCoefficients, DspError, DspErrorCode, IIirFilter } from './types';

export class IirBiquadFilter implements IIirFilter {
  public readonly coeffs: BiquadCoefficients;
  public readonly isStable: boolean;

  // Direct Form II Transposed state variables
  private _d1: number = 0.0;
  private _d2: number = 0.0;

  constructor(coeffs: BiquadCoefficients, validateStability: boolean = true) {
    // Normalize coefficients by a0
    const a0 = coeffs.a0;
    if (a0 === 0 || !Number.isFinite(a0)) {
      throw new DspError(DspErrorCode.INVALID_COEFFICIENTS, 'Leading denominator coefficient a0 cannot be zero');
    }

    const b0 = coeffs.b0 / a0;
    const b1 = coeffs.b1 / a0;
    const b2 = coeffs.b2 / a0;
    const a1 = coeffs.a1 / a0;
    const a2 = coeffs.a2 / a0;

    this.coeffs = { b0, b1, b2, a0: 1.0, a1, a2 };
    this.isStable = IirBiquadFilter.checkStability(a1, a2);

    if (validateStability && !this.isStable) {
      throw new DspError(
        DspErrorCode.UNSTABLE_FILTER,
        `IIR filter is unstable: poles outside unit circle (a1=${a1}, a2=${a2})`
      );
    }
  }

  /**
   * Resets internal delay states to zero.
   */
  public reset(): void {
    this._d1 = 0.0;
    this._d2 = 0.0;
  }

  /**
   * Processes a single input sample through Direct Form II Transposed:
   *   y[n] = b0 * x[n] + d1
   *   d1   = b1 * x[n] - a1 * y[n] + d2
   *   d2   = b2 * x[n] - a2 * y[n]
   */
  public processSample(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.coeffs;

    const y = b0 * x + this._d1;
    this._d1 = b1 * x - a1 * y + this._d2;
    this._d2 = b2 * x - a2 * y;

    return y;
  }

  /**
   * Processes a contiguous block of samples.
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
   * Filters an entire batch with zero initial condition.
   */
  public filterBatch(samples: Float32Array): Float32Array {
    const fresh = new IirBiquadFilter(this.coeffs, false);
    return fresh.processBlock(samples);
  }

  /**
   * Validates filter stability via Jury criterion for 2nd order:
   * 1. |a2| < 1
   * 2. 1 + a1 + a2 > 0
   * 3. 1 - a1 + a2 > 0
   */
  public static checkStability(a1: number, a2: number): boolean {
    if (Math.abs(a2) >= 1.0) return false;
    if (1.0 + a1 + a2 <= 0.0) return false;
    if (1.0 - a1 + a2 <= 0.0) return false;
    return true;
  }

  /**
   * Factory: 2nd-Order Butterworth Low-Pass filter via Bilinear Transform.
   * Maximally flat passband with exactly -3.01 dB attenuation at cutoff.
   *
   * @param sampleRate - Sampling frequency in Hz (fs)
   * @param cutoffFreq - 3 dB Cutoff frequency in Hz (fc < fs / 2)
   * @param Q - Quality factor (default: 1 / sqrt(2) approx 0.70710678 for Butterworth)
   */
  public static createButterworthLowPass(
    sampleRate: number,
    cutoffFreq: number,
    Q: number = Math.SQRT1_2
  ): IirBiquadFilter {
    if (sampleRate <= 0 || cutoffFreq <= 0) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, 'Sample rate and cutoff must be positive');
    }
    if (cutoffFreq >= sampleRate / 2) {
      throw new DspError(
        DspErrorCode.INVALID_PARAMETER,
        `Cutoff frequency (${cutoffFreq}) must be below Nyquist (${sampleRate / 2})`
      );
    }
    if (Q <= 0) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, `Q factor must be positive, got ${Q}`);
    }

    // Pre-warped angular frequency
    const K = Math.tan((Math.PI * cutoffFreq) / sampleRate);
    const K2 = K * K;
    const norm = 1.0 + K / Q + K2;

    const b0 = K2 / norm;
    const b1 = (2.0 * K2) / norm;
    const b2 = K2 / norm;
    const a0 = 1.0;
    const a1 = (2.0 * (K2 - 1.0)) / norm;
    const a2 = (1.0 - K / Q + K2) / norm;

    return new IirBiquadFilter({ b0, b1, b2, a0, a1, a2 });
  }

  /**
   * Factory: 1st-Order Low-Pass filter (RC single-pole equivalent via bilinear transform).
   */
  public static createFirstOrderLowPass(sampleRate: number, cutoffFreq: number): IirBiquadFilter {
    if (sampleRate <= 0 || cutoffFreq <= 0) {
      throw new DspError(DspErrorCode.INVALID_PARAMETER, 'Sample rate and cutoff must be positive');
    }
    if (cutoffFreq >= sampleRate / 2) {
      throw new DspError(
        DspErrorCode.INVALID_PARAMETER,
        `Cutoff frequency (${cutoffFreq}) must be below Nyquist (${sampleRate / 2})`
      );
    }

    const K = Math.tan((Math.PI * cutoffFreq) / sampleRate);
    const norm = 1.0 + K;

    const b0 = K / norm;
    const b1 = K / norm;
    const b2 = 0.0;
    const a0 = 1.0;
    const a1 = (K - 1.0) / norm;
    const a2 = 0.0;

    return new IirBiquadFilter({ b0, b1, b2, a0, a1, a2 });
  }
}
