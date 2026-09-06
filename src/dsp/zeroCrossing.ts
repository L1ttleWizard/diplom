/**
 * Zero Crossing Detection Reference Implementation (Wave 12)
 *
 * Implements sub-sample linear interpolation for precise zero-crossing timestamps
 * and Schmitt-trigger hysteresis noise rejection.
 *
 * Linear Interpolation Formula:
 *   t_{cross} = (i - 1) + \frac{V_{th} - x[i-1]}{x[i] - x[i-1]}
 */

import { ZeroCrossing, ZeroCrossingDirection, ZeroCrossingOptions } from './types';

/**
 * Detects zero (or arbitrary threshold) crossings with sub-sample linear interpolation.
 *
 * @param samples - Float32Array or number array of signal samples
 * @param options - Configurable threshold, hysteresis band, and direction filter
 * @returns Array of detected crossings with fractional sub-sample indices and slopes
 */
export function findZeroCrossings(
  samples: Float32Array | number[],
  options?: ZeroCrossingOptions
): ZeroCrossing[] {
  const len = samples.length;
  if (len < 2) {
    return [];
  }

  const threshold = options?.threshold ?? 0.0;
  const hysteresis = Math.max(0.0, options?.hysteresis ?? 0.0);
  const filterDir: ZeroCrossingDirection = options?.direction ?? 'BOTH';

  const crossings: ZeroCrossing[] = [];

  const halfHyst = hysteresis / 2.0;
  const vHigh = threshold + halfHyst;
  const vLow = threshold - halfHyst;

  // Track Schmitt-trigger state: -1 = was low (armed for rising), +1 = was high (armed for falling), 0 = unknown
  let armState = 0;
  const firstVal = samples[0];
  if (firstVal >= vHigh) {
    armState = 1;
  } else if (firstVal <= vLow) {
    armState = -1;
  }

  for (let i = 1; i < len; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];

    // If hysteresis is active, check arming conditions
    if (hysteresis > 0) {
      if (curr >= vHigh && armState <= 0) {
        // Confirmed rising transition
        if (filterDir === 'RISING' || filterDir === 'BOTH') {
          const denom = curr - prev;
          const frac = denom !== 0 ? (threshold - prev) / denom : 0.5;
          const clampedFrac = Math.max(0.0, Math.min(1.0, frac));
          const index = i - 1 + clampedFrac;
          crossings.push({
            index,
            direction: 'RISING',
            slope: denom,
          });
        }
        armState = 1;
      } else if (curr <= vLow && armState >= 0) {
        // Confirmed falling transition
        if (filterDir === 'FALLING' || filterDir === 'BOTH') {
          const denom = curr - prev;
          const frac = denom !== 0 ? (threshold - prev) / denom : 0.5;
          const clampedFrac = Math.max(0.0, Math.min(1.0, frac));
          const index = i - 1 + clampedFrac;
          crossings.push({
            index,
            direction: 'FALLING',
            slope: denom,
          });
        }
        armState = -1;
      }
    } else {
      // Direct crossing without hysteresis
      if (prev < threshold && curr > threshold) {
        if (filterDir === 'RISING' || filterDir === 'BOTH') {
          const denom = curr - prev;
          const frac = (threshold - prev) / denom;
          crossings.push({
            index: i - 1 + frac,
            direction: 'RISING',
            slope: denom,
          });
        }
      } else if (prev > threshold && curr < threshold) {
        if (filterDir === 'FALLING' || filterDir === 'BOTH') {
          const denom = curr - prev;
          const frac = (threshold - prev) / denom;
          crossings.push({
            index: i - 1 + frac,
            direction: 'FALLING',
            slope: denom,
          });
        }
      } else if (prev === threshold) {
        // Look at previous sample before threshold
        const before = i >= 2 ? samples[i - 2] : threshold - (curr - threshold);
        if (before < threshold && curr > threshold) {
          if (filterDir === 'RISING' || filterDir === 'BOTH') {
            crossings.push({
              index: i - 1,
              direction: 'RISING',
              slope: curr - before,
            });
          }
        } else if (before > threshold && curr < threshold) {
          if (filterDir === 'FALLING' || filterDir === 'BOTH') {
            crossings.push({
              index: i - 1,
              direction: 'FALLING',
              slope: curr - before,
            });
          }
        }
      }
    }
  }

  return crossings;
}
