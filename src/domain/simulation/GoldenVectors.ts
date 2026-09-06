import { SignalGenerator } from './SignalGenerator';
import { SimulationClock } from './SimulationClock';
import { SignalGeneratorOptions } from './types';

export interface GoldenScenario {
  name: string;
  options: SignalGeneratorOptions;
  sampleRate: number;
  sampleCount: number;
  expectedPeriodSeconds: number;
  expectedPeriodSamples: number;
  expectedVpp: number;
  expectedOffset: number;
  expectedMax: number;
  expectedMin: number;
  expectedKeypoints?: Array<{ sampleIndex: number; expectedValue: number; tolerance?: number }>;
}

export class GoldenVectors {
  /**
   * Reference test scenario 1: 1 kHz Sine, 2.0 Vpp, 0V offset, 0 deg phase @ 1 MSPS
   */
  public static readonly SINE_1KHZ_2VPP: GoldenScenario = {
    name: 'SINE_1KHZ_2VPP',
    options: {
      waveform: 'SINE',
      frequency: 1000,
      amplitude: 2.0,
      offset: 0.0,
      phase: 0.0
    },
    sampleRate: 1_000_000,
    sampleCount: 2000, // 2 full cycles
    expectedPeriodSeconds: 0.001,
    expectedPeriodSamples: 1000,
    expectedVpp: 2.0,
    expectedOffset: 0.0,
    expectedMax: 1.0,
    expectedMin: -1.0,
    expectedKeypoints: [
      { sampleIndex: 0, expectedValue: 0.0, tolerance: 1e-4 },
      { sampleIndex: 250, expectedValue: 1.0, tolerance: 1e-4 },
      { sampleIndex: 500, expectedValue: 0.0, tolerance: 1e-4 },
      { sampleIndex: 750, expectedValue: -1.0, tolerance: 1e-4 },
      { sampleIndex: 1000, expectedValue: 0.0, tolerance: 1e-4 }
    ]
  };

  /**
   * Reference test scenario 2: 10 kHz Square, 5.0 Vpp, 1.0V offset, 50% duty @ 2 MSPS
   */
  public static readonly SQUARE_10KHZ_5VPP: GoldenScenario = {
    name: 'SQUARE_10KHZ_5VPP',
    options: {
      waveform: 'SQUARE',
      frequency: 10_000,
      amplitude: 5.0,
      offset: 1.0,
      dutyCycle: 50.0
    },
    sampleRate: 2_000_000,
    sampleCount: 600, // 3 full cycles (200 samples/cycle)
    expectedPeriodSeconds: 0.0001,
    expectedPeriodSamples: 200,
    expectedVpp: 5.0,
    expectedOffset: 1.0,
    expectedMax: 3.5,
    expectedMin: -1.5,
    expectedKeypoints: [
      { sampleIndex: 50, expectedValue: 3.5 },
      { sampleIndex: 150, expectedValue: -1.5 },
      { sampleIndex: 250, expectedValue: 3.5 }
    ]
  };

  /**
   * Reference test scenario 3: 20 kHz Pulse, 25% duty cycle, 4.0 Vpp, 0V offset @ 2 MSPS
   */
  public static readonly PULSE_20KHZ_25DUTY: GoldenScenario = {
    name: 'PULSE_20KHZ_25DUTY',
    options: {
      waveform: 'PULSE',
      frequency: 20_000,
      amplitude: 4.0,
      offset: 0.0,
      dutyCycle: 25.0
    },
    sampleRate: 2_000_000,
    sampleCount: 300, // 3 cycles (100 samples/cycle)
    expectedPeriodSeconds: 0.00005,
    expectedPeriodSamples: 100,
    expectedVpp: 4.0,
    expectedOffset: -1.0, // (2.0 * 0.25 + -2.0 * 0.75) average = -1.0V
    expectedMax: 2.0,
    expectedMin: -2.0,
    expectedKeypoints: [
      { sampleIndex: 10, expectedValue: 2.0 },  // In high zone [0..24]
      { sampleIndex: 24, expectedValue: 2.0 },
      { sampleIndex: 25, expectedValue: -2.0 }, // In low zone [25..99]
      { sampleIndex: 90, expectedValue: -2.0 }
    ]
  };

  /**
   * Reference test scenario 4: 5 kHz Triangle, 4.0 Vpp, 0V offset @ 1 MSPS
   */
  public static readonly TRIANGLE_5KHZ_4VPP: GoldenScenario = {
    name: 'TRIANGLE_5KHZ_4VPP',
    options: {
      waveform: 'TRIANGLE',
      frequency: 5000,
      amplitude: 4.0,
      offset: 0.0
    },
    sampleRate: 1_000_000,
    sampleCount: 400, // 2 cycles (200 samples/cycle)
    expectedPeriodSeconds: 0.0002,
    expectedPeriodSamples: 200,
    expectedVpp: 4.0,
    expectedOffset: 0.0,
    expectedMax: 2.0,
    expectedMin: -2.0,
    expectedKeypoints: [
      { sampleIndex: 0, expectedValue: 0.0, tolerance: 1e-3 },
      { sampleIndex: 50, expectedValue: 2.0, tolerance: 1e-3 },   // Positive peak
      { sampleIndex: 100, expectedValue: 0.0, tolerance: 1e-3 },  // Zero crossing
      { sampleIndex: 150, expectedValue: -2.0, tolerance: 1e-3 }, // Negative peak
      { sampleIndex: 200, expectedValue: 0.0, tolerance: 1e-3 }
    ]
  };

  /**
   * Reference test scenario 5: 2 kHz Sawtooth, 3.0 Vpp, -0.5V offset @ 1 MSPS
   */
  public static readonly SAW_2KHZ_3VPP: GoldenScenario = {
    name: 'SAW_2KHZ_3VPP',
    options: {
      waveform: 'SAW',
      frequency: 2000,
      amplitude: 3.0,
      offset: -0.5
    },
    sampleRate: 1_000_000,
    sampleCount: 1000, // 2 cycles (500 samples/cycle)
    expectedPeriodSeconds: 0.0005,
    expectedPeriodSamples: 500,
    expectedVpp: 3.0,
    expectedOffset: -0.5,
    expectedMax: 1.0,
    expectedMin: -2.0,
    expectedKeypoints: [
      { sampleIndex: 0, expectedValue: -2.0, tolerance: 1e-2 },   // Start of ramp: -0.5 - 1.5 = -2.0V
      { sampleIndex: 250, expectedValue: -0.5, tolerance: 1e-2 }, // Midpoint: -0.5V
      { sampleIndex: 499, expectedValue: 1.0, tolerance: 2e-2 }   // Pre-flyback: ~1.0V
    ]
  };

  /**
   * Reference test scenario 6: Constant DC, 3.3V
   */
  public static readonly DC_3V3: GoldenScenario = {
    name: 'DC_3V3',
    options: {
      waveform: 'DC',
      offset: 3.3,
      amplitude: 0.0
    },
    sampleRate: 1_000_000,
    sampleCount: 500,
    expectedPeriodSeconds: 0.0,
    expectedPeriodSamples: 0,
    expectedVpp: 0.0,
    expectedOffset: 3.3,
    expectedMax: 3.3,
    expectedMin: 3.3,
    expectedKeypoints: [
      { sampleIndex: 0, expectedValue: 3.3 },
      { sampleIndex: 250, expectedValue: 3.3 },
      { sampleIndex: 499, expectedValue: 3.3 }
    ]
  };

  /**
   * Generates samples for a golden scenario using SimulationClock
   */
  public static generateScenarioSamples(scenario: GoldenScenario): Float32Array {
    const clock = new SimulationClock(scenario.sampleRate);
    const generator = new SignalGenerator(scenario.options);
    return generator.generateBatch(clock, scenario.sampleCount);
  }

  // --- Analytical Measurement Utilities ---

  public static measureVpp(samples: ArrayLike<number>): number {
    if (samples.length === 0) return 0;
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      if (v > max) max = v;
      if (v < min) min = v;
    }
    return max - min;
  }

  public static measureMax(samples: ArrayLike<number>): number {
    let max = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] > max) max = samples[i];
    }
    return max;
  }

  public static measureMin(samples: ArrayLike<number>): number {
    let min = Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] < min) min = samples[i];
    }
    return min;
  }

  public static measureMean(samples: ArrayLike<number>): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i];
    }
    return sum / samples.length;
  }

  /**
   * Locates zero-crossing transition sample indices (with sub-sample linear interpolation)
   * @param direction 'rising' (cross from - to +), 'falling' (cross from + to -), or 'both'
   */
  public static findZeroCrossings(
    samples: ArrayLike<number>,
    threshold: number = 0.0,
    direction: 'rising' | 'falling' | 'both' = 'rising'
  ): number[] {
    const crossings: number[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const v0 = samples[i] - threshold;
      const v1 = samples[i + 1] - threshold;

      const isRising = v0 <= 0 && v1 > 0;
      const isFalling = v0 >= 0 && v1 < 0;

      if ((direction === 'rising' && isRising) ||
          (direction === 'falling' && isFalling) ||
          (direction === 'both' && (isRising || isFalling))) {
        // Linear fractional interpolation
        const fraction = -v0 / (v1 - v0);
        crossings.push(i + fraction);
      }
    }
    return crossings;
  }

  /**
   * Estimates signal period in seconds based on consecutive rising zero-crossings
   */
  public static measurePeriod(
    samples: ArrayLike<number>,
    sampleRate: number,
    threshold: number = 0.0
  ): number {
    const risingCrossings = this.findZeroCrossings(samples, threshold, 'rising');
    if (risingCrossings.length < 2) return 0;

    let totalDiff = 0;
    for (let i = 0; i < risingCrossings.length - 1; i++) {
      totalDiff += risingCrossings[i + 1] - risingCrossings[i];
    }
    const avgSamplesPerPeriod = totalDiff / (risingCrossings.length - 1);
    return avgSamplesPerPeriod / sampleRate;
  }

  /**
   * Measures duty cycle percentage (0..100%) for a two-level signal
   */
  public static measureDutyCycle(
    samples: ArrayLike<number>,
    threshold: number = 0.0
  ): number {
    if (samples.length === 0) return 0;
    let highCount = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] >= threshold) {
        highCount++;
      }
    }
    return (highCount / samples.length) * 100.0;
  }
}
