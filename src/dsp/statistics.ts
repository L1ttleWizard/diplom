/**
 * DSP Statistics Reference Implementation (Wave 12)
 *
 * Provides analytical ground-truth reference calculations:
 * - Mean (DC offset)
 * - Min / Max
 * - Peak-to-Peak (Vpp)
 * - True RMS
 * - Consolidated Single-Pass SignalStats
 *
 * Uses Float64 double-precision accumulators to prevent numerical roundoff
 * errors during long summations.
 */

import { DspError, DspErrorCode, SignalStats } from './types';

/**
 * Computes arithmetic mean (DC offset) of a sample buffer:
 *   \mu = (1 / N) * \sum_{i=0}^{N-1} x[i]
 *
 * @throws {DspError} if buffer is empty
 */
export function computeMean(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute mean of empty sample buffer');
  }

  let sum = 0.0;
  for (let i = 0; i < len; i++) {
    sum += samples[i];
  }
  return sum / len;
}

/**
 * Computes minimum sample value:
 *   min = \min_{i} x[i]
 *
 * @throws {DspError} if buffer is empty
 */
export function computeMin(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute min of empty sample buffer');
  }

  let minVal = samples[0];
  for (let i = 1; i < len; i++) {
    const v = samples[i];
    if (v < minVal) minVal = v;
  }
  return minVal;
}

/**
 * Computes maximum sample value:
 *   max = \max_{i} x[i]
 *
 * @throws {DspError} if buffer is empty
 */
export function computeMax(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute max of empty sample buffer');
  }

  let maxVal = samples[0];
  for (let i = 1; i < len; i++) {
    const v = samples[i];
    if (v > maxVal) maxVal = v;
  }
  return maxVal;
}

/**
 * Computes peak-to-peak voltage:
 *   V_{pp} = \max x[i] - \min x[i]
 *
 * @throws {DspError} if buffer is empty
 */
export function computePeakToPeak(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute peak-to-peak of empty sample buffer');
  }

  let minVal = samples[0];
  let maxVal = samples[0];

  for (let i = 1; i < len; i++) {
    const v = samples[i];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  return maxVal - minVal;
}

/**
 * Computes True RMS (Root Mean Square) voltage:
 *   V_{rms} = \sqrt{ (1 / N) * \sum_{i=0}^{N-1} x[i]^2 }
 *
 * @throws {DspError} if buffer is empty
 */
export function computeRms(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute RMS of empty sample buffer');
  }

  let sumSq = 0.0;
  for (let i = 0; i < len; i++) {
    const v = samples[i];
    sumSq += v * v;
  }

  return Math.sqrt(sumSq / len);
}

/**
 * Computes consolidated signal statistics in a single pass:
 * - min, max, vpp, rms, mean, sampleCount
 *
 * @throws {DspError} if buffer is empty
 */
export function computeSignalStats(samples: Float32Array | number[]): SignalStats {
  const len = samples.length;
  if (len === 0) {
    throw new DspError(DspErrorCode.EMPTY_BUFFER, 'Cannot compute stats of empty sample buffer');
  }

  let minVal = samples[0];
  let maxVal = samples[0];
  let sum = 0.0;
  let sumSq = 0.0;

  for (let i = 0; i < len; i++) {
    const v = samples[i];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
    sum += v;
    sumSq += v * v;
  }

  const vpp = maxVal - minVal;
  const mean = sum / len;
  const rms = Math.sqrt(sumSq / len);

  return {
    min: minVal,
    max: maxVal,
    vpp,
    rms,
    mean,
    sampleCount: len,
  };
}
