import { WaveformType, SignalGeneratorOptions } from './types';
import { SimulationClock } from './SimulationClock';
import { DeterministicRandom } from './DeterministicRandom';
import { DomainValidationError } from '../types';

export class SignalGenerator {
  private _waveform: WaveformType;
  private _frequency: number;
  private _amplitude: number; // Peak-to-peak amplitude Vpp
  private _offset: number;
  private _phase: number;     // In degrees
  private _dutyCycle: number; // In percent [0, 100]
  private _random: DeterministicRandom;

  constructor(options: SignalGeneratorOptions = {}) {
    this._waveform = options.waveform ?? 'SINE';
    this._frequency = options.frequency ?? 1000; // 1 kHz default
    this._amplitude = options.amplitude ?? 2.0;  // 2.0 Vpp default
    this._offset = options.offset ?? 0.0;
    this._phase = options.phase ?? 0.0;
    this._dutyCycle = options.dutyCycle ?? 50.0;
    this._random = new DeterministicRandom(options.noiseSeed ?? 1337);

    this.validate();
  }

  public get waveform(): WaveformType {
    return this._waveform;
  }

  public get frequency(): number {
    return this._frequency;
  }

  public get amplitude(): number {
    return this._amplitude;
  }

  public get offset(): number {
    return this._offset;
  }

  public get phase(): number {
    return this._phase;
  }

  public get dutyCycle(): number {
    return this._dutyCycle;
  }

  public setWaveform(waveform: WaveformType): void {
    this._waveform = waveform;
  }

  public setFrequency(freq: number): void {
    if (!Number.isFinite(freq) || freq < 0) {
      throw new DomainValidationError('frequency', 'Frequency must be a non-negative finite number');
    }
    this._frequency = freq;
  }

  public setAmplitude(amp: number): void {
    if (!Number.isFinite(amp) || amp < 0) {
      throw new DomainValidationError('amplitude', 'Amplitude (Vpp) must be a non-negative finite number');
    }
    this._amplitude = amp;
  }

  public setOffset(offset: number): void {
    if (!Number.isFinite(offset)) {
      throw new DomainValidationError('offset', 'Offset must be a finite number');
    }
    this._offset = offset;
  }

  public setPhase(phase: number): void {
    if (!Number.isFinite(phase)) {
      throw new DomainValidationError('phase', 'Phase must be a finite number');
    }
    this._phase = phase;
  }

  public setDutyCycle(duty: number): void {
    if (!Number.isFinite(duty) || duty < 0 || duty > 100) {
      throw new DomainValidationError('dutyCycle', 'Duty cycle must be between 0 and 100%');
    }
    this._dutyCycle = duty;
  }

  public setNoiseSeed(seed: number): void {
    this._random.reset(seed);
  }

  private validate(): void {
    this.setFrequency(this._frequency);
    this.setAmplitude(this._amplitude);
    this.setOffset(this._offset);
    this.setPhase(this._phase);
    this.setDutyCycle(this._dutyCycle);
  }

  /**
   * Evaluates instantaneous voltage at simulation time t (in seconds).
   * Pure mathematical evaluation.
   */
  public sampleAt(t: number): number {
    const halfAmp = this._amplitude / 2;

    if (this._waveform === 'DC') {
      return this._offset;
    }

    if (this._waveform === 'NOISE') {
      return this._offset + this._random.nextUniform(-halfAmp, halfAmp);
    }

    // Boundary case: f = 0 (static waveform held at initial phase)
    if (this._frequency === 0) {
      const p0 = ((this._phase / 360) % 1 + 1) % 1;
      return this._offset + this.evaluateNormalizedWaveform(p0) * halfAmp;
    }

    const period = 1.0 / this._frequency;
    const phaseShift = this._phase / 360; // Fraction of cycle

    // Normalized cycle position in [0, 1)
    let p = ((t / period + phaseShift) % 1 + 1) % 1;
    p = Math.round(p * 1e12) / 1e12;

    // Numerical guard against 1.0 boundary
    if (p >= 1.0) p = 0.0;

    const raw = this.evaluateNormalizedWaveform(p);
    return this._offset + raw * halfAmp;
  }

  /**
   * Normalized waveform generator over p ∈ [0, 1), outputting values in [-1, +1].
   */
  private evaluateNormalizedWaveform(p: number): number {
    switch (this._waveform) {
      case 'SINE':
        return Math.sin(2 * Math.PI * p);

      case 'SQUARE': {
        const threshold = 0.5;
        return p < threshold ? 1.0 : -1.0;
      }

      case 'PULSE': {
        const threshold = this._dutyCycle / 100.0;
        return p < threshold ? 1.0 : -1.0;
      }

      case 'TRIANGLE': {
        // Aligned with Sine: starts at 0, ramps to +1 at 0.25, -1 at 0.75, 0 at 1.0
        if (p < 0.25) {
          return p * 4.0;
        } else if (p < 0.75) {
          return 1.0 - (p - 0.25) * 4.0;
        } else {
          return -1.0 + (p - 0.75) * 4.0;
        }
      }

      case 'SAW': {
        // Ramp up from -1 to +1 over [0, 1)
        return 2.0 * p - 1.0;
      }

      default:
        return 0.0;
    }
  }

  /**
   * Generates a contiguous batch of discrete samples driven by a SimulationClock.
   * Advances the clock by `count` samples.
   *
   * Zero per-call memory allocations when outputBuffer is provided.
   *
   * @param clock The deterministic simulation clock
   * @param count Number of samples to generate
   * @param outputBuffer Optional pre-allocated Float32Array buffer
   * @returns The populated Float32Array
   */
  public generateBatch(
    clock: SimulationClock,
    count: number,
    outputBuffer?: Float32Array
  ): Float32Array {
    if (count <= 0) {
      return outputBuffer ?? new Float32Array(0);
    }

    const buffer = outputBuffer ?? new Float32Array(count);
    const startSample = clock.sampleIndex;
    const sampleRate = clock.sampleRate;

    for (let i = 0; i < count; i++) {
      const t = (startSample + i) / sampleRate;
      buffer[i] = this.sampleAt(t);
    }

    // Advance clock by batch sample count
    clock.advance(count);

    return buffer;
  }
}
