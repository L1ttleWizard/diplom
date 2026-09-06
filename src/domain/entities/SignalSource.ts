import { SignalWaveform, DomainValidationError } from '../types';

export interface SignalSourceConfig {
  id: string;
  name?: string;
  waveform?: SignalWaveform;
  frequency?: number;
  amplitude?: number;
  offset?: number;
  dutyCycle?: number;
  phase?: number;
  enabled?: boolean;
}

export class SignalSource {
  public readonly id: string;
  public readonly name: string;
  private _waveform: SignalWaveform;
  private _frequency: number;
  private _amplitude: number;
  private _offset: number;
  private _dutyCycle: number;
  private _phase: number;
  private _enabled: boolean;

  constructor(config: SignalSourceConfig) {
    this.id = config.id;
    this.name = config.name ?? `Source_${config.id}`;
    this._waveform = config.waveform ?? 'SINE';
    this._frequency = config.frequency ?? 1000; // 1 kHz default
    this._amplitude = config.amplitude ?? 2.0;  // 2 Vpp default
    this._offset = config.offset ?? 0.0;
    this._dutyCycle = config.dutyCycle ?? 50;   // 50% default
    this._phase = config.phase ?? 0;
    this._enabled = config.enabled ?? true;

    this.validate();
  }

  public get waveform(): SignalWaveform {
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

  public get dutyCycle(): number {
    return this._dutyCycle;
  }

  public get phase(): number {
    return this._phase;
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public enable(): void {
    this._enabled = true;
  }

  public disable(): void {
    this._enabled = false;
  }

  public setWaveform(waveform: SignalWaveform): void {
    this._waveform = waveform;
  }

  public setFrequency(freq: number): void {
    if (!Number.isFinite(freq) || freq <= 0) {
      throw new DomainValidationError('frequency', 'Frequency must be a positive finite number');
    }
    this._frequency = freq;
  }

  public setAmplitude(amp: number): void {
    if (!Number.isFinite(amp) || amp < 0) {
      throw new DomainValidationError('amplitude', 'Amplitude must be a non-negative finite number');
    }
    this._amplitude = amp;
  }

  public setOffset(offset: number): void {
    if (!Number.isFinite(offset)) {
      throw new DomainValidationError('offset', 'Offset must be a finite number');
    }
    this._offset = offset;
  }

  public setDutyCycle(duty: number): void {
    if (!Number.isFinite(duty) || duty < 0 || duty > 100) {
      throw new DomainValidationError('dutyCycle', 'Duty cycle must be between 0 and 100%');
    }
    this._dutyCycle = duty;
  }

  public setPhase(phase: number): void {
    if (!Number.isFinite(phase)) {
      throw new DomainValidationError('phase', 'Phase must be a finite number');
    }
    this._phase = phase;
  }

  private validate(): void {
    this.setFrequency(this._frequency);
    this.setAmplitude(this._amplitude);
    this.setOffset(this._offset);
    this.setDutyCycle(this._dutyCycle);
    this.setPhase(this._phase);
  }

  /**
   * Pure mathematical evaluation of instantaneous voltage at time t (seconds)
   */
  public sampleAt(t: number): number {
    if (!this._enabled) return 0;

    const phaseRad = (this._phase * Math.PI) / 180;
    const period = 1 / this._frequency;
    const normalizedTime = ((t % period) + period) % period; // [0, period)
    const phaseFraction = normalizedTime / period;           // [0, 1)
    const shiftedFraction = (phaseFraction + this._phase / 360) % 1;

    let rawVal = 0;
    switch (this._waveform) {
      case 'SINE':
        rawVal = Math.sin(2 * Math.PI * this._frequency * t + phaseRad);
        break;
      case 'SQUARE':
      case 'PWM': {
        const threshold = this._dutyCycle / 100;
        rawVal = shiftedFraction < threshold ? 1 : -1;
        break;
      }
      case 'TRIANGLE': {
        rawVal = 2 * Math.abs(2 * (shiftedFraction - Math.floor(shiftedFraction + 0.5))) - 1;
        break;
      }
      case 'SAWTOOTH':
        rawVal = 2 * (shiftedFraction - Math.floor(shiftedFraction + 0.5));
        break;
      case 'NOISE':
        rawVal = (Math.random() * 2 - 1);
        break;
    }

    return this._offset + (rawVal * this._amplitude) / 2;
  }
}
