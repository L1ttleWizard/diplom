/**
 * Frequency & Period Estimation Reference Implementation (Wave 12)
 *
 * Estimates fundamental signal frequency using sub-sample interpolated zero crossings
 * across multiple complete cycles for high precision and noise immunity.
 *
 * Mathematical formula:
 *   T_{avg} = \frac{t_{M-1} - t_0}{K \cdot f_s}
 *   f = \frac{1}{T_{avg}} = \frac{K \cdot f_s}{t_{M-1} - t_0}
 */

import { DspError, DspErrorCode, FrequencyEstimationResult, FrequencyOptions } from './types';
import { findZeroCrossings } from './zeroCrossing';

/**
 * Estimates frequency, period, and duty cycle from a sample buffer.
 *
 * @param samples - Raw sample buffer
 * @param sampleRate - Sampling frequency in Hz (e.g. 1_000_000)
 * @param options - Configurable threshold, hysteresis, and cycle requirements
 * @returns FrequencyEstimationResult containing frequency, period, duty cycle, and confidence
 * @throws {DspError} if sampleRate <= 0
 */
export function estimateFrequency(
  samples: Float32Array | number[],
  sampleRate: number,
  options?: FrequencyOptions
): FrequencyEstimationResult {
  if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
    throw new DspError(DspErrorCode.INVALID_SAMPLE_RATE, `Sample rate must be positive, got ${sampleRate}`);
  }

  const defaultResult: FrequencyEstimationResult = {
    frequency: 0,
    period: 0,
    cycleCount: 0,
    dutyCycle: 0,
    confidence: 0,
    valid: false,
  };

  const len = samples.length;
  if (len < 3) {
    return defaultResult;
  }

  const threshold = options?.threshold ?? 0.0;
  const hysteresis = options?.hysteresis ?? 0.0;
  const minCycles = options?.minCycles ?? 1;

  // 1. Detect rising zero crossings
  const risingCrossings = findZeroCrossings(samples, {
    threshold,
    hysteresis,
    direction: 'RISING',
  });

  const crossingCount = risingCrossings.length;
  const cycleCount = crossingCount - 1;

  if (cycleCount < minCycles || cycleCount <= 0) {
    return defaultResult;
  }

  // 2. Compute total elapsed samples over full integer cycles
  const firstIndex = risingCrossings[0].index;
  const lastIndex = risingCrossings[crossingCount - 1].index;
  const totalSampleSpan = lastIndex - firstIndex;

  if (totalSampleSpan <= 0) {
    return defaultResult;
  }

  // 3. Compute period and frequency
  const avgPeriodSamples = totalSampleSpan / cycleCount;
  const period = avgPeriodSamples / sampleRate;
  const frequency = 1.0 / period;

  // 4. Calculate period variance for confidence estimation
  let sumDiffSq = 0.0;
  for (let k = 0; k < cycleCount; k++) {
    const cycleSamples = risingCrossings[k + 1].index - risingCrossings[k].index;
    const diff = cycleSamples - avgPeriodSamples;
    sumDiffSq += diff * diff;
  }

  const stdDevSamples = Math.sqrt(sumDiffSq / cycleCount);
  const normalizedJitter = avgPeriodSamples > 0 ? stdDevSamples / avgPeriodSamples : 1.0;
  const confidence = Math.max(0.0, Math.min(1.0, 1.0 - normalizedJitter * 2.0));

  // 5. Estimate Duty Cycle via falling crossings
  let dutyCycle = 0.5; // Default symmetric
  const fallingCrossings = findZeroCrossings(samples, {
    threshold,
    hysteresis,
    direction: 'FALLING',
  });

  if (fallingCrossings.length > 0 && risingCrossings.length > 0) {
    let validHighIntervals = 0;
    let totalHighFraction = 0.0;

    for (let i = 0; i < risingCrossings.length - 1; i++) {
      const rStart = risingCrossings[i].index;
      const rEnd = risingCrossings[i + 1].index;
      const periodLen = rEnd - rStart;

      // Find falling crossing between rStart and rEnd
      const fall = fallingCrossings.find((f) => f.index > rStart && f.index < rEnd);
      if (fall && periodLen > 0) {
        totalHighFraction += (fall.index - rStart) / periodLen;
        validHighIntervals++;
      }
    }

    if (validHighIntervals > 0) {
      dutyCycle = Math.max(0.0, Math.min(1.0, totalHighFraction / validHighIntervals));
    }
  }

  return {
    frequency,
    period,
    cycleCount,
    dutyCycle,
    confidence,
    valid: true,
  };
}
