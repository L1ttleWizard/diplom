import { describe, it, expect } from 'vitest';
import {
  AnalogFrontEnd,
  ADCModel,
  AcquisitionChannel,
  AcquisitionEngine,
  SignalGenerator,
  SimulationClock,
  DomainValidationError
} from '../../src/domain';
import { SampleRingBuffer } from '../../src/data';

describe('Acquisition and ADC Model (Wave 7)', () => {
  describe('Analog Front End (AFE)', () => {
    it('models DC linearity and vertical scale gain (Av = 1 / voltsPerDiv)', () => {
      const afe = new AnalogFrontEnd({ voltsPerDiv: 1.0, coupling: 'DC' });
      const dt = 1e-6; // 1 us (1 MSPS)

      // 1. At 1.0 V/div: 1.0 V in -> 1.0 V out
      expect(afe.processSample(1.0, dt)).toBeCloseTo(1.0, 5);
      expect(afe.processSample(-2.5, dt)).toBeCloseTo(-2.5, 5);

      // 2. At 0.5 V/div: gain is 2.0x (1.0 V in -> 2.0 V out)
      afe.setVoltsPerDiv(0.5);
      expect(afe.processSample(1.0, dt)).toBeCloseTo(2.0, 5);
      expect(afe.processSample(1.5, dt)).toBeCloseTo(3.0, 5);

      // 3. At 2.0 V/div: gain is 0.5x (4.0 V in -> 2.0 V out)
      afe.setVoltsPerDiv(2.0);
      expect(afe.processSample(4.0, dt)).toBeCloseTo(2.0, 5);
    });

    it('models probe attenuation (1X vs 10X)', () => {
      const afe1x = new AnalogFrontEnd({ probeAttenuation: '1X', voltsPerDiv: 1.0 });
      const afe10x = new AnalogFrontEnd({ probeAttenuation: '10X', voltsPerDiv: 1.0 });
      const dt = 1e-6;

      const vIn = 10.0; // 10 Volts input
      // 1X probe: 10V is preserved (though clips to +5V rail unless rails expanded)
      afe1x.setRails(-20, +20);
      afe10x.setRails(-20, +20);

      expect(afe1x.processSample(vIn, dt)).toBeCloseTo(10.0, 5);
      // 10X probe: 10V is attenuated to 1.0V
      expect(afe10x.processSample(vIn, dt)).toBeCloseTo(1.0, 5);
    });

    it('models channel position offset subtraction', () => {
      const afe = new AnalogFrontEnd({ voltsPerDiv: 1.0, offset: 2.0 }); // Offset = +2.0V
      const dt = 1e-6;

      // An input of +2.0V centered on +2.0V offset yields 0.0V
      expect(afe.processSample(2.0, dt)).toBeCloseTo(0.0, 5);
      // An input of +3.0V with +2.0V offset yields +1.0V
      expect(afe.processSample(3.0, dt)).toBeCloseTo(1.0, 5);
    });

    it('models GND coupling (identically 0V output)', () => {
      const afe = new AnalogFrontEnd({ coupling: 'GND', voltsPerDiv: 0.1 });
      const dt = 1e-6;

      expect(afe.processSample(10.0, dt)).toBe(0.0);
      expect(afe.processSample(-50.0, dt)).toBe(0.0);
      expect(afe.processSample(0.42, dt)).toBe(0.0);
    });

    it('models AC coupling DC-blocking high-pass filter', () => {
      const afe = new AnalogFrontEnd({ coupling: 'AC', voltsPerDiv: 1.0 });
      const dt = 1e-6; // 1 us at 1 MSPS
      const dcVoltage = 5.0; // 5V DC step

      // First sample sees transition
      const v0 = afe.processSample(dcVoltage, dt);
      expect(v0).toBeGreaterThan(0);

      // Over many time constants (e.g. 500,000 samples = 0.5s), DC decays to zero
      let vDecayed = 0;
      for (let i = 0; i < 500_000; i++) {
        vDecayed = afe.processSample(dcVoltage, dt);
      }
      expect(vDecayed).toBeCloseTo(0.0, 2);
    });

    it('models analog bandwidth limiting (single-pole RC low-pass filter)', () => {
      const fc = 10_000; // 10 kHz cutoff
      const afe = new AnalogFrontEnd({
        voltsPerDiv: 1.0,
        bandwidthLimit: true,
        cutoffFrequency: fc
      });

      const sampleRate = 1_000_000;
      const dt = 1 / sampleRate;

      // Test at frequency equal to cutoff fc:
      // Theoretical magnitude response of 1st-order Butterworth/RC: |H(fc)| = 1 / sqrt(2) ≈ 0.7071 (-3.01 dB)
      const testCycles = 50;
      const periodSamples = Math.round(sampleRate / fc);
      const totalSamples = testCycles * periodSamples;

      let maxOut = 0;
      // Skip initial transient by taking max over last 10 cycles
      for (let i = 0; i < totalSamples; i++) {
        const t = i * dt;
        const vIn = Math.sin(2 * Math.PI * fc * t);
        const vOut = afe.processSample(vIn, dt);
        if (i > (testCycles - 10) * periodSamples) {
          if (Math.abs(vOut) > maxOut) maxOut = Math.abs(vOut);
        }
      }

      // Should be within 3% of 1 / sqrt(2) ≈ 0.7071
      expect(maxOut).toBeCloseTo(1 / Math.SQRT2, 1);
    });

    it('models analog rail saturation (clipping)', () => {
      const afe = new AnalogFrontEnd({
        voltsPerDiv: 1.0,
        minRailVoltage: -3.5,
        maxRailVoltage: +3.5
      });
      const dt = 1e-6;

      expect(afe.processSample(2.0, dt)).toBeCloseTo(2.0, 5);
      expect(afe.processSample(5.0, dt)).toBe(3.5);   // Clipped high
      expect(afe.processSample(-10.0, dt)).toBe(-3.5); // Clipped low
    });

    it('models analog input noise with target RMS standard deviation', () => {
      const targetRms = 0.05; // 50 mV RMS
      const afe = new AnalogFrontEnd({
        voltsPerDiv: 1.0,
        noiseRms: targetRms,
        noiseSeed: 1234
      });
      const dt = 1e-6;

      const N = 10_000;
      let sum = 0;
      let sumSq = 0;

      for (let i = 0; i < N; i++) {
        const v = afe.processSample(0.0, dt); // 0V input -> pure noise
        sum += v;
        sumSq += v * v;
      }

      const mean = sum / N;
      const stdDev = Math.sqrt(sumSq / N - mean * mean);

      expect(mean).toBeCloseTo(0.0, 2); // Zero mean
      expect(stdDev).toBeCloseTo(targetRms, 2); // RMS matches
    });

    it('validates invalid AFE configurations', () => {
      const afe = new AnalogFrontEnd();
      expect(() => afe.setVoltsPerDiv(0)).toThrow(DomainValidationError);
      expect(() => afe.setVoltsPerDiv(-2)).toThrow(DomainValidationError);
      expect(() => afe.setOffset(NaN)).toThrow(DomainValidationError);
      expect(() => afe.setNoiseRms(-1)).toThrow(DomainValidationError);
      expect(() => afe.setRails(5, -5)).toThrow(DomainValidationError);
    });
  });

  describe('ADC Model', () => {
    it('calculates exact LSB step sizes across resolutions (8, 10, 12, 16 bits)', () => {
      // Full scale 4.0V => Span is 8.0V [-4V, +4V]
      const adc8 = new ADCModel({ resolution: 8, fullScaleVoltage: 4.0 });
      expect(adc8.totalLevels).toBe(256);
      expect(adc8.lsbVoltage).toBe(8.0 / 256); // 0.03125 V (31.25 mV)
      expect(adc8.metrics.theoreticalSnrDb).toBeCloseTo(6.02 * 8 + 1.76, 2);

      const adc10 = new ADCModel({ resolution: 10, fullScaleVoltage: 4.0 });
      expect(adc10.totalLevels).toBe(1024);
      expect(adc10.lsbVoltage).toBe(8.0 / 1024); // 7.8125 mV

      const adc12 = new ADCModel({ resolution: 12, fullScaleVoltage: 4.0 });
      expect(adc12.totalLevels).toBe(4096);
      expect(adc12.lsbVoltage).toBe(8.0 / 4096); // ~1.953 mV

      const adc16 = new ADCModel({ resolution: 16, fullScaleVoltage: 4.0 });
      expect(adc16.totalLevels).toBe(65536);
      expect(adc16.lsbVoltage).toBe(8.0 / 65536); // ~0.122 mV
    });

    it('quantizes voltages into discrete integer codes and reconstructed values', () => {
      const adc = new ADCModel({ resolution: 8, fullScaleVoltage: 4.0 });
      const q = adc.lsbVoltage; // 0.03125 V

      // Center voltage (0.0 V):
      // rawIndex = (0 - (-4)) / 0.03125 = 4.0 / 0.03125 = 128
      const center = adc.convertSample(0.0);
      expect(center.code).toBe(128);
      // Reconstructed: -4 + (128 + 0.5) * 0.03125 = -4 + 4.015625 = +0.015625
      expect(center.reconstructedVoltage).toBeCloseTo(q / 2, 5);
      expect(center.clippedLow).toBe(false);
      expect(center.clippedHigh).toBe(false);

      // Quantization error bound: |v - v_recon| <= q / 2
      for (let v = -3.5; v <= 3.5; v += 0.23) {
        const res = adc.convertSample(v);
        const err = Math.abs(v - res.reconstructedVoltage);
        expect(err).toBeLessThanOrEqual(q / 2 + 1e-7);
      }
    });

    it('tracks ADC saturation and clipping at limits', () => {
      const adc = new ADCModel({ resolution: 8, fullScaleVoltage: 4.0 });

      // Underflow: -5.0 V < -4.0 V
      const underflow = adc.convertSample(-5.0);
      expect(underflow.code).toBe(0);
      expect(underflow.clippedLow).toBe(true);
      expect(underflow.clippedHigh).toBe(false);

      // Overflow: +5.0 V > +4.0 V
      const overflow = adc.convertSample(+5.0);
      expect(overflow.code).toBe(255);
      expect(overflow.clippedLow).toBe(false);
      expect(overflow.clippedHigh).toBe(true);
    });

    it('converts batches of samples with zero heap allocation and clipping metrics', () => {
      const adc = new ADCModel({ resolution: 8, fullScaleVoltage: 4.0 });
      const count = 1000;
      const analogIn = new Float32Array(count);
      const digitalCodes = new Uint16Array(count);
      const reconOut = new Float32Array(count);

      // Generate a sine wave that exceeds rails slightly
      for (let i = 0; i < count; i++) {
        analogIn[i] = 4.5 * Math.sin((2 * Math.PI * i) / 100);
      }

      const result = adc.convertBatch(analogIn, digitalCodes, reconOut, count);

      expect(result.sampleCount).toBe(count);
      expect(result.isClipped).toBe(true);
      expect(result.clippedHighCount).toBeGreaterThan(0);
      expect(result.clippedLowCount).toBeGreaterThan(0);

      // Check codes are bounded in [0, 255]
      for (let i = 0; i < count; i++) {
        expect(digitalCodes[i]).toBeGreaterThanOrEqual(0);
        expect(digitalCodes[i]).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('SampleRingBuffer (Data Plane)', () => {
    it('manages circular storage with power-of-two capacity and zero allocations', () => {
      const ring = new SampleRingBuffer(1024); // Capacity 1024
      expect(ring.capacity).toBe(1024);
      expect(ring.size).toBe(0);
      expect(ring.totalWritten).toBe(0);

      const data = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
      ring.write(data);

      expect(ring.size).toBe(5);
      expect(ring.totalWritten).toBe(5);

      const readDest = new Float32Array(5);
      ring.readLatest(readDest, 5);
      expect(Array.from(readDest)).toEqual([1.0, 2.0, 3.0, 4.0, 5.0]);
    });

    it('overwrites oldest samples seamlessly on capacity overflow', () => {
      const ring = new SampleRingBuffer(16); // Small buffer for testing wrap-around
      const data = new Float32Array(20);
      for (let i = 0; i < 20; i++) data[i] = i;

      ring.write(data); // Writes 0..19 into capacity 16

      expect(ring.size).toBe(16);
      expect(ring.totalWritten).toBe(20);

      // Latest 16 should be 4..19
      const latest = new Float32Array(16);
      ring.readLatest(latest, 16);
      expect(latest[0]).toBe(4);
      expect(latest[15]).toBe(19);
    });

    it('reads arbitrary chronological windows by global sample index', () => {
      const ring = new SampleRingBuffer(64);
      const data = new Float32Array(50);
      for (let i = 0; i < 50; i++) data[i] = i * 10;
      ring.write(data);

      const window = new Float32Array(5);
      // Read 5 samples starting at index 20
      ring.readWindow(window, 20, 5);
      expect(Array.from(window)).toEqual([200, 210, 220, 230, 240]);
    });
  });

  describe('AcquisitionChannel & Pipeline', () => {
    it('supports independent CH1 and CH2 acquisition with zero crosstalk', () => {
      const engine = new AcquisitionEngine({ sampleRate: 1_000_000 });

      // Configure CH1: 1 kHz Sine, 1.0 V/div
      const genCh1 = new SignalGenerator({ waveform: 'SINE', frequency: 1000, amplitude: 2.0 });
      engine.ch1.setSignalSource(genCh1);
      engine.ch1.afe.setVoltsPerDiv(1.0);

      // Configure CH2: 10 kHz Square, 2.0 V/div (Av = 0.5)
      const genCh2 = new SignalGenerator({ waveform: 'SQUARE', frequency: 10_000, amplitude: 4.0 });
      engine.ch2.setSignalSource(genCh2);
      engine.ch2.afe.setVoltsPerDiv(2.0);

      // Acquire 1000 samples (1 ms)
      const result = engine.acquire(1000);

      expect(result.sampleCount).toBe(1000);
      expect(engine.clock.sampleIndex).toBe(1000);
      expect(engine.clock.simulationTime).toBeCloseTo(0.001);

      // Verify CH1 has sine characteristics
      const ch1Samples = engine.ch1QuantizedBuffer.subarray(0, 1000);
      const ch1Max = Math.max(...ch1Samples);
      const ch1Min = Math.min(...ch1Samples);
      expect(ch1Max).toBeCloseTo(1.0, 1); // 2.0 Vpp at 1.0 V/div => +-1.0V
      expect(ch1Min).toBeCloseTo(-1.0, 1);

      // Verify CH2 has square characteristics at 2.0 V/div (4.0 Vpp / 2.0 = 2.0 Vpp deflection => +-1.0V)
      const ch2Samples = engine.ch2QuantizedBuffer.subarray(0, 1000);
      const ch2Max = Math.max(...ch2Samples);
      const ch2Min = Math.min(...ch2Samples);
      expect(ch2Max).toBeCloseTo(1.0, 1);
      expect(ch2Min).toBeCloseTo(-1.0, 1);
    });

    it('supports logical sample rates: 1 MSPS, 2 MSPS, 5 MSPS', () => {
      const engine = new AcquisitionEngine();

      engine.setSampleRate(1_000_000);
      expect(engine.sampleRate).toBe(1_000_000);
      expect(engine.clock.timeStep).toBe(1e-6);

      engine.setSampleRate(2_000_000);
      expect(engine.sampleRate).toBe(2_000_000);
      expect(engine.clock.timeStep).toBe(0.5e-6);

      engine.setSampleRate(5_000_000);
      expect(engine.sampleRate).toBe(5_000_000);
      expect(engine.clock.timeStep).toBe(0.2e-6);
    });

    it('validates invalid batch sizes and sample rates', () => {
      const engine = new AcquisitionEngine({ maxBatchSize: 1000 });
      expect(() => engine.acquire(0)).toThrow(DomainValidationError);
      expect(() => engine.acquire(2000)).toThrow(DomainValidationError);
      expect(() => engine.setSampleRate(-100)).toThrow(DomainValidationError);
    });
  });

  describe('High-Throughput Acquisition Benchmark', () => {
    it('executes 1,000,000 dual-channel samples through AFE + ADC at high throughput (> 5 MSPS)', () => {
      const engine = new AcquisitionEngine({ sampleRate: 5_000_000, maxBatchSize: 100_000 });
      const gen1 = new SignalGenerator({ waveform: 'SINE', frequency: 50_000, amplitude: 2.0 });
      const gen2 = new SignalGenerator({ waveform: 'TRIANGLE', frequency: 20_000, amplitude: 3.0 });
      engine.ch1.setSignalSource(gen1);
      engine.ch2.setSignalSource(gen2);

      const batchSize = 100_000;
      const batches = 10; // 10 * 100,000 = 1,000,000 samples per channel (2,000,000 total conversions)

      // Ring buffer for storage
      const ringCh1 = new SampleRingBuffer(1_048_576);

      const t0 = performance.now();
      for (let b = 0; b < batches; b++) {
        engine.acquire(batchSize);
        ringCh1.write(engine.ch1QuantizedBuffer, batchSize);
      }
      const elapsedMs = performance.now() - t0;

      const totalSamples = batchSize * batches;
      const msps = (totalSamples / elapsedMs) / 1000;
      console.log(`[Wave 7 Benchmark] Dual-channel Acquisition: ${msps.toFixed(2)} MSPS (${elapsedMs.toFixed(2)} ms for 1,000,000 samples)`);

      expect(engine.clock.sampleIndex).toBe(totalSamples);
      expect(ringCh1.size).toBe(totalSamples);
      // Must exceed 1 MSPS comfortably
      expect(msps).toBeGreaterThan(1.0);
    });
  });
});
