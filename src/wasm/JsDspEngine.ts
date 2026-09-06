/**
 * Pure JavaScript Reference DSP Engine (Wave 11 & Wave 13)
 *
 * Provides a reference JavaScript implementation of the DSP routines
 * for baseline benchmarking, cross-validation, and fallback execution.
 */

import { IWasmDspEngine, SignalStats } from './types';

export class JsDspEngine implements IWasmDspEngine {
  public get isInitialized(): boolean {
    return true;
  }

  public get memoryByteSize(): number {
    return 0;
  }

  public async init(): Promise<void> {
    // No-op for pure JS
  }

  public callNoop(): number {
    return 0;
  }

  public computeStats(samples: Float32Array): SignalStats {
    const count = samples.length;
    if (count === 0) {
      throw new Error('Sample count must be greater than zero');
    }

    let min = samples[0];
    let max = samples[0];
    let sum = 0.0;
    let sumSq = 0.0;

    for (let i = 0; i < count; i++) {
      const val = samples[i];
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      sumSq += val * val;
    }

    const vpp = max - min;
    const mean = sum / count;
    const rms = Math.sqrt(sumSq / count);

    return {
      min,
      max,
      vpp,
      rms,
      mean,
      sampleCount: count,
    };
  }

  public computeRms(samples: Float32Array): number {
    const count = samples.length;
    if (count === 0) {
      throw new Error('Sample count must be greater than zero');
    }

    let sumSq = 0.0;
    for (let i = 0; i < count; i++) {
      const val = samples[i];
      sumSq += val * val;
    }

    return Math.sqrt(sumSq / count);
  }

  public peakDetectDecimate(
    samples: Float32Array,
    bucketCount: number,
    outMin?: Float32Array,
    outMax?: Float32Array
  ): { min: Float32Array; max: Float32Array } {
    const inCount = samples.length;
    if (inCount === 0) {
      throw new Error('Sample count must be greater than zero');
    }
    if (bucketCount <= 0 || bucketCount > inCount) {
      throw new Error(`Bucket count (${bucketCount}) must be > 0 and <= sample count (${inCount})`);
    }

    const minArr = outMin && outMin.length >= bucketCount ? outMin : new Float32Array(bucketCount);
    const maxArr = outMax && outMax.length >= bucketCount ? outMax : new Float32Array(bucketCount);

    const step = inCount / bucketCount;

    for (let b = 0; b < bucketCount; b++) {
      const startIdx = Math.floor(b * step);
      let endIdx = Math.floor((b + 1) * step);
      if (endIdx > inCount) endIdx = inCount;
      if (endIdx <= startIdx) endIdx = startIdx + 1;

      let bMin = samples[startIdx];
      let bMax = bMin;

      for (let i = startIdx + 1; i < endIdx; i++) {
        const val = samples[i];
        if (val < bMin) bMin = val;
        if (val > bMax) bMax = val;
      }

      minArr[b] = bMin;
      maxArr[b] = bMax;
    }

    return { min: minArr, max: maxArr };
  }

  public filterFir(
    samples: Float32Array,
    coefficients: Float32Array,
    outBuffer?: Float32Array
  ): Float32Array {
    const count = samples.length;
    const taps = coefficients.length;
    const out = outBuffer && outBuffer.length >= count ? outBuffer : new Float32Array(count);

    for (let n = 0; n < count; n++) {
      let acc = 0.0;
      for (let k = 0; k < taps; k++) {
        const idx = n - k;
        if (idx >= 0) {
          acc += coefficients[k] * samples[idx];
        }
      }
      out[n] = acc;
    }

    return out;
  }

  public filterIirBiquad(
    samples: Float32Array,
    coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
    outBuffer?: Float32Array
  ): Float32Array {
    const count = samples.length;
    const out = outBuffer && outBuffer.length >= count ? outBuffer : new Float32Array(count);

    let d1 = 0.0;
    let d2 = 0.0;
    const { b0, b1, b2, a1, a2 } = coeffs;

    for (let n = 0; n < count; n++) {
      const x = samples[n];
      const y = b0 * x + d1;
      d1 = b1 * x - a1 * y + d2;
      d2 = b2 * x - a2 * y;
      out[n] = y;
    }

    return out;
  }
}
