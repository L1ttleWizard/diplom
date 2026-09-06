/**
 * DSP Reference Library Types & Interfaces (Wave 12)
 *
 * Ground truth mathematical reference contracts for digital signal processing,
 * statistical metrics, filtering, and frequency estimation.
 */

export interface SignalStats {
  min: number;
  max: number;
  vpp: number;
  rms: number;
  mean: number;
  sampleCount: number;
}

export type ZeroCrossingDirection = 'RISING' | 'FALLING' | 'BOTH';

export interface ZeroCrossingOptions {
  threshold?: number;           // Default: 0.0 V
  hysteresis?: number;          // Default: 0.0 V (noise rejection band)
  direction?: ZeroCrossingDirection; // Default: 'BOTH'
}

export interface ZeroCrossing {
  index: number;                // Fractional sub-sample index (linear interpolation)
  direction: 'RISING' | 'FALLING';
  slope: number;                // Estimated slope at crossing point (V/sample)
}

export interface FrequencyEstimationResult {
  frequency: number;            // Frequency in Hz (0 if unmeasurable)
  period: number;               // Period in seconds (Infinity or 0 if unmeasurable)
  cycleCount: number;           // Number of full cycles measured
  dutyCycle: number;            // Positive duty cycle (0.0 to 1.0, e.g. 0.5 for symmetric wave)
  confidence: number;           // Estimation confidence metric (0.0 to 1.0)
  valid: boolean;               // True if at least 1 complete cycle was detected
}

export interface FrequencyOptions extends ZeroCrossingOptions {
  minCycles?: number;           // Minimum complete cycles required (default: 1)
  maxHarmonic?: number;         // Optional ceiling on measured frequency (e.g. Nyquist)
}

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a0: number; // Normalized to 1.0 in Direct Form II Transposed
  a1: number;
  a2: number;
}

export interface IFirFilter {
  readonly taps: number;
  readonly coefficients: Float64Array;
  reset(): void;
  processSample(sample: number): number;
  processBlock(samples: Float32Array, output?: Float32Array): Float32Array;
  filterBatch(samples: Float32Array): Float32Array;
}

export interface IIirFilter {
  readonly isStable: boolean;
  reset(): void;
  processSample(sample: number): number;
  processBlock(samples: Float32Array, output?: Float32Array): Float32Array;
  filterBatch(samples: Float32Array): Float32Array;
}

export enum DspErrorCode {
  EMPTY_BUFFER = 'EMPTY_BUFFER',
  INVALID_SAMPLE_RATE = 'INVALID_SAMPLE_RATE',
  INSUFFICIENT_SAMPLES = 'INSUFFICIENT_SAMPLES',
  INSUFFICIENT_CYCLES = 'INSUFFICIENT_CYCLES',
  INVALID_COEFFICIENTS = 'INVALID_COEFFICIENTS',
  UNSTABLE_FILTER = 'UNSTABLE_FILTER',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
}

export class DspError extends Error {
  public readonly code: DspErrorCode;

  constructor(code: DspErrorCode, message: string) {
    super(`[DspError:${code}] ${message}`);
    this.name = 'DspError';
    this.code = code;
  }
}
