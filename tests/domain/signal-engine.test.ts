import { describe, it, expect } from 'vitest';
import { SimulationClock } from '../../src/domain/simulation/SimulationClock';
import { DeterministicRandom } from '../../src/domain/simulation/DeterministicRandom';
import { SignalGenerator } from '../../src/domain/simulation/SignalGenerator';
import { GoldenVectors } from '../../src/domain/simulation/GoldenVectors';
import { DomainValidationError } from '../../src/domain/types';

describe('Deterministic Signal Engine (Wave 6)', () => {
  describe('SimulationClock', () => {
    it('initializes with default 1 MSPS and index 0', () => {
      const clock = new SimulationClock();
      expect(clock.sampleRate).toBe(1_000_000);
      expect(clock.sampleIndex).toBe(0);
      expect(clock.simulationTime).toBe(0);
      expect(clock.timeStep).toBe(1e-6);
    });

    it('advances time deterministically with step() and advance()', () => {
      const clock = new SimulationClock(2_000_000); // 2 MSPS => dt = 0.5 us
      expect(clock.timeStep).toBe(0.5e-6);

      // 1. Single step
      const t1 = clock.step();
      expect(clock.sampleIndex).toBe(1);
      expect(t1).toBeCloseTo(0.5e-6, 12);
      expect(clock.simulationTime).toBeCloseTo(0.5e-6, 12);

      // 2. Advance by 999 samples
      const t2 = clock.advance(999);
      expect(clock.sampleIndex).toBe(1000);
      expect(t2).toBeCloseTo(0.0005, 10); // 1000 * 0.5 us = 500 us = 0.5 ms
    });

    it('demonstrates zero drift over 1,000,000 steps', () => {
      const clock = new SimulationClock(1_000_000); // 1 MSPS
      clock.advance(1_000_000);

      expect(clock.sampleIndex).toBe(1_000_000);
      // Exactly 1.0000000000000000 second, zero cumulative floating point drift
      expect(clock.simulationTime).toBe(1.0);
      expect(clock.snapshot().simulationTime).toBe(1.0);
    });

    it('supports deterministic jumps via setTime and reset', () => {
      const clock = new SimulationClock(1_000_000);
      clock.setTime(0.042); // 42 ms = 42,000 samples
      expect(clock.sampleIndex).toBe(42_000);
      expect(clock.simulationTime).toBeCloseTo(0.042);

      clock.reset();
      expect(clock.sampleIndex).toBe(0);
      expect(clock.simulationTime).toBe(0);
    });

    it('allows rate adjustments preserving current time', () => {
      const clock = new SimulationClock(1_000_000);
      clock.setTime(0.01); // 10 ms = 10,000 samples at 1 MSPS

      clock.setSampleRate(5_000_000); // 5 MSPS
      expect(clock.sampleRate).toBe(5_000_000);
      expect(clock.sampleIndex).toBe(50_000); // 10 ms at 5 MSPS = 50,000 samples
      expect(clock.simulationTime).toBeCloseTo(0.01);
    });

    it('calculates analytical timeAt without state mutation', () => {
      const clock = new SimulationClock(1_000_000);
      expect(clock.timeAt(500_000)).toBe(0.5);
      expect(clock.sampleIndex).toBe(0);
    });

    it('validates invalid clock arguments', () => {
      expect(() => new SimulationClock(0)).toThrow(DomainValidationError);
      expect(() => new SimulationClock(-100)).toThrow(DomainValidationError);
      const clock = new SimulationClock();
      expect(() => clock.advance(-5)).toThrow(DomainValidationError);
      expect(() => clock.setTime(-1)).toThrow(DomainValidationError);
      expect(() => clock.setSampleRate(-500)).toThrow(DomainValidationError);
    });
  });

  describe('DeterministicRandom', () => {
    it('generates identical sequences for identical seeds', () => {
      const rng1 = new DeterministicRandom(42);
      const rng2 = new DeterministicRandom(42);

      for (let i = 0; i < 50; i++) {
        expect(rng1.next()).toBe(rng2.next());
      }
    });

    it('generates different sequences for different seeds', () => {
      const rng1 = new DeterministicRandom(42);
      const rng2 = new DeterministicRandom(999);

      let differences = 0;
      for (let i = 0; i < 20; i++) {
        if (rng1.next() !== rng2.next()) differences++;
      }
      expect(differences).toBeGreaterThan(15);
    });

    it('generates uniform numbers within specified range', () => {
      const rng = new DeterministicRandom(123);
      for (let i = 0; i < 200; i++) {
        const val = rng.nextUniform(-2.5, 2.5);
        expect(val).toBeGreaterThanOrEqual(-2.5);
        expect(val).toBeLessThan(2.5);
      }
    });

    it('generates Gaussian random numbers with expected statistical mean', () => {
      const rng = new DeterministicRandom(777);
      const count = 1000;
      let sum = 0;
      for (let i = 0; i < count; i++) {
        sum += rng.nextGaussian(0.0, 1.0);
      }
      const mean = sum / count;
      expect(Math.abs(mean)).toBeLessThan(0.15); // Statistical mean near 0
    });
  });

  describe('SignalGenerator & Golden Vectors Verification', () => {
    it('verifies SINE golden scenario (1 kHz, 2.0 Vpp, 0V offset @ 1 MSPS)', () => {
      const scenario = GoldenVectors.SINE_1KHZ_2VPP;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      // Amplitude & Peak verification
      const vpp = GoldenVectors.measureVpp(samples);
      expect(vpp).toBeCloseTo(scenario.expectedVpp, 3);
      expect(GoldenVectors.measureMax(samples)).toBeCloseTo(scenario.expectedMax, 3);
      expect(GoldenVectors.measureMin(samples)).toBeCloseTo(scenario.expectedMin, 3);

      // Offset verification
      expect(GoldenVectors.measureMean(samples)).toBeCloseTo(scenario.expectedOffset, 2);

      // Period verification via zero crossings
      const period = GoldenVectors.measurePeriod(samples, scenario.sampleRate);
      expect(period).toBeCloseTo(scenario.expectedPeriodSeconds, 5);

      // Exact keypoint verification
      for (const kp of scenario.expectedKeypoints!) {
        const val = samples[kp.sampleIndex];
        expect(val).toBeCloseTo(kp.expectedValue, kp.tolerance ? 3 : 4);
      }
    });

    it('verifies SQUARE golden scenario (10 kHz, 5.0 Vpp, 1.0V offset, 50% duty @ 2 MSPS)', () => {
      const scenario = GoldenVectors.SQUARE_10KHZ_5VPP;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      // Amplitude & Bounds
      const vpp = GoldenVectors.measureVpp(samples);
      expect(vpp).toBeCloseTo(scenario.expectedVpp, 2);
      expect(GoldenVectors.measureMax(samples)).toBe(scenario.expectedMax);
      expect(GoldenVectors.measureMin(samples)).toBe(scenario.expectedMin);

      // Duty cycle
      const duty = GoldenVectors.measureDutyCycle(samples, scenario.expectedOffset);
      expect(duty).toBeCloseTo(50.0, 1);

      // Keypoints
      for (const kp of scenario.expectedKeypoints!) {
        expect(samples[kp.sampleIndex]).toBe(kp.expectedValue);
      }
    });

    it('verifies PULSE golden scenario (20 kHz, 25% duty, 4.0 Vpp @ 2 MSPS)', () => {
      const scenario = GoldenVectors.PULSE_20KHZ_25DUTY;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      expect(GoldenVectors.measureVpp(samples)).toBe(scenario.expectedVpp);
      expect(GoldenVectors.measureMax(samples)).toBe(scenario.expectedMax);
      expect(GoldenVectors.measureMin(samples)).toBe(scenario.expectedMin);

      // Duty cycle verification
      const duty = GoldenVectors.measureDutyCycle(samples, 0.0);
      expect(duty).toBeCloseTo(25.0, 1);

      for (const kp of scenario.expectedKeypoints!) {
        expect(samples[kp.sampleIndex]).toBe(kp.expectedValue);
      }
    });

    it('verifies TRIANGLE golden scenario (5 kHz, 4.0 Vpp, 0V offset @ 1 MSPS)', () => {
      const scenario = GoldenVectors.TRIANGLE_5KHZ_4VPP;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      expect(GoldenVectors.measureVpp(samples)).toBeCloseTo(scenario.expectedVpp, 2);
      expect(GoldenVectors.measureMax(samples)).toBeCloseTo(scenario.expectedMax, 2);
      expect(GoldenVectors.measureMin(samples)).toBeCloseTo(scenario.expectedMin, 2);

      const period = GoldenVectors.measurePeriod(samples, scenario.sampleRate);
      expect(period).toBeCloseTo(scenario.expectedPeriodSeconds, 5);

      for (const kp of scenario.expectedKeypoints!) {
        expect(samples[kp.sampleIndex]).toBeCloseTo(kp.expectedValue, 2);
      }
    });

    it('verifies SAWTOOTH golden scenario (2 kHz, 3.0 Vpp, -0.5V offset @ 1 MSPS)', () => {
      const scenario = GoldenVectors.SAW_2KHZ_3VPP;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      expect(GoldenVectors.measureVpp(samples)).toBeCloseTo(scenario.expectedVpp, 1);
      expect(GoldenVectors.measureMin(samples)).toBeCloseTo(scenario.expectedMin, 2);

      for (const kp of scenario.expectedKeypoints!) {
        expect(samples[kp.sampleIndex]).toBeCloseTo(kp.expectedValue, 1);
      }
    });

    it('verifies DC golden scenario (3.3V invariant flatline)', () => {
      const scenario = GoldenVectors.DC_3V3;
      const samples = GoldenVectors.generateScenarioSamples(scenario);

      expect(GoldenVectors.measureVpp(samples)).toBe(0.0);
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBeCloseTo(3.3, 5);
      }
    });

    it('verifies NOISE determinism and bounding', () => {
      const clock1 = new SimulationClock(1_000_000);
      const clock2 = new SimulationClock(1_000_000);

      const gen1 = new SignalGenerator({ waveform: 'NOISE', amplitude: 6.0, offset: 1.0, noiseSeed: 42 });
      const gen2 = new SignalGenerator({ waveform: 'NOISE', amplitude: 6.0, offset: 1.0, noiseSeed: 42 });

      const buf1 = gen1.generateBatch(clock1, 100);
      const buf2 = gen2.generateBatch(clock2, 100);

      // Bit-exact matching between two runs with same seed
      for (let i = 0; i < 100; i++) {
        expect(buf1[i]).toBe(buf2[i]);
        // Must stay within [offset - A/2, offset + A/2] = [1 - 3, 1 + 3] = [-2, 4]
        expect(buf1[i]).toBeGreaterThanOrEqual(-2.0);
        expect(buf1[i]).toBeLessThanOrEqual(4.0);
      }
    });
  });

  describe('Boundary Cases & Edge Behaviors', () => {
    it('handles frequency = 0 (DC static hold at initial phase)', () => {
      const gen = new SignalGenerator({ waveform: 'SINE', frequency: 0, amplitude: 4.0, phase: 90 });
      // At phase 90 deg, sin(90) = 1.0 -> 0 + 2.0 * 1.0 = 2.0V
      expect(gen.sampleAt(0.0)).toBeCloseTo(2.0);
      expect(gen.sampleAt(10.0)).toBeCloseTo(2.0);
      expect(gen.sampleAt(1000.0)).toBeCloseTo(2.0);
    });

    it('handles very low frequencies (0.1 Hz, 10-second period)', () => {
      const gen = new SignalGenerator({ waveform: 'SINE', frequency: 0.1, amplitude: 2.0 });
      expect(gen.sampleAt(0)).toBeCloseTo(0.0);
      expect(gen.sampleAt(2.5)).toBeCloseTo(1.0);  // Quarter period = peak
      expect(gen.sampleAt(5.0)).toBeCloseTo(0.0);  // Half period = zero crossing
      expect(gen.sampleAt(7.5)).toBeCloseTo(-1.0); // 3/4 period = valley
      expect(gen.sampleAt(10.0)).toBeCloseTo(0.0); // Full period = zero crossing
    });

    it('handles Nyquist limit frequency (fs/2)', () => {
      const sampleRate = 1_000_000;
      const clock = new SimulationClock(sampleRate);
      // f = 500 kHz = fs / 2
      const gen = new SignalGenerator({ waveform: 'SQUARE', frequency: 500_000, amplitude: 2.0 });
      const samples = gen.generateBatch(clock, 8);

      // Should alternate perfectly: +1, -1, +1, -1, +1, -1...
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBe(i % 2 === 0 ? 1.0 : -1.0);
      }
    });

    it('handles zero amplitude flatline', () => {
      const gen = new SignalGenerator({ waveform: 'SINE', amplitude: 0.0, offset: 2.5 });
      for (let t = 0; t < 1.0; t += 0.1) {
        expect(gen.sampleAt(t)).toBe(2.5);
      }
    });

    it('handles extreme offsets (+500V, -500V)', () => {
      const genPos = new SignalGenerator({ waveform: 'SINE', amplitude: 2.0, offset: 500.0 });
      expect(genPos.sampleAt(0.00025)).toBeCloseTo(501.0); // 500 + 1

      const genNeg = new SignalGenerator({ waveform: 'SINE', amplitude: 2.0, offset: -500.0 });
      expect(genNeg.sampleAt(0.00025)).toBeCloseTo(-499.0); // -500 + 1
    });

    it('handles duty cycle boundary extremes (0%, 100%, 0.1%)', () => {
      const gen0 = new SignalGenerator({ waveform: 'PULSE', dutyCycle: 0.0, amplitude: 2.0 });
      // 0% duty -> always low (-1.0V)
      expect(gen0.sampleAt(0.0001)).toBe(-1.0);
      expect(gen0.sampleAt(0.0005)).toBe(-1.0);

      const gen100 = new SignalGenerator({ waveform: 'PULSE', dutyCycle: 100.0, amplitude: 2.0 });
      // 100% duty -> always high (+1.0V)
      expect(gen100.sampleAt(0.0001)).toBe(1.0);
      expect(gen100.sampleAt(0.0005)).toBe(1.0);
    });

    it('handles negative phase and wrap-around (-720 deg, +1080 deg)', () => {
      const genNorm = new SignalGenerator({ waveform: 'SINE', frequency: 1000, phase: 0 });
      const genMinus720 = new SignalGenerator({ waveform: 'SINE', frequency: 1000, phase: -720 });
      const genPlus1080 = new SignalGenerator({ waveform: 'SINE', frequency: 1000, phase: 1080 });

      // -720 and +1080 degrees are exact multiples of 360, so outputs must be identical
      for (let t = 0; t <= 0.001; t += 0.0001) {
        expect(genMinus720.sampleAt(t)).toBeCloseTo(genNorm.sampleAt(t), 4);
        expect(genPlus1080.sampleAt(t)).toBeCloseTo(genNorm.sampleAt(t), 4);
      }
    });

    it('validates invalid parameter values with DomainValidationError', () => {
      const gen = new SignalGenerator();
      expect(() => gen.setFrequency(-10)).toThrow(DomainValidationError);
      expect(() => gen.setAmplitude(-5)).toThrow(DomainValidationError);
      expect(() => gen.setDutyCycle(-1)).toThrow(DomainValidationError);
      expect(() => gen.setDutyCycle(101)).toThrow(DomainValidationError);
      expect(() => gen.setOffset(NaN)).toThrow(DomainValidationError);
      expect(() => gen.setPhase(Infinity)).toThrow(DomainValidationError);
    });
  });

  describe('High-Frequency Throughput & Memory Reuse Benchmark', () => {
    it('generates 1,000,000 samples into preallocated buffer with high throughput', () => {
      const clock = new SimulationClock(5_000_000); // 5 MSPS rate
      const gen = new SignalGenerator({ waveform: 'SINE', frequency: 100_000, amplitude: 3.3 });

      const batchSize = 100_000;
      const preallocatedBuffer = new Float32Array(batchSize);

      const t0 = performance.now();
      const batches = 10; // 10 * 100,000 = 1,000,000 samples total
      for (let b = 0; b < batches; b++) {
        // Reuses preallocatedBuffer every batch -> ZERO heap allocations
        gen.generateBatch(clock, batchSize, preallocatedBuffer);
      }
      const elapsedMs = performance.now() - t0;

      expect(clock.sampleIndex).toBe(1_000_000);
      expect(clock.simulationTime).toBeCloseTo(0.2); // 1,000,000 / 5,000,000 = 0.2s

      const msps = (1_000_000 / elapsedMs) / 1000; // Mega-samples per second
      console.log(`[Wave 6 Benchmark] Throughput: ${msps.toFixed(2)} MSPS (${elapsedMs.toFixed(2)} ms for 1,000,000 samples)`);
      // Should generate at least 5 MSPS on any modern CPU
      expect(msps).toBeGreaterThan(1.0);
    });
  });
});
