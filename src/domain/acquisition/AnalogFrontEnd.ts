import { Coupling, ProbeAttenuation, DomainValidationError } from '../types';
import { DeterministicRandom } from '../simulation/DeterministicRandom';
import { AFEConfig } from './types';

/**
 * Analog Front End (AFE) Model.
 *
 * Implements the physical analog signal chain of an oscilloscope channel:
 * 1. Coupling (DC, AC single-pole high-pass, GND)
 * 2. Probe Attenuation (1X, 10X)
 * 3. Offset and Vertical Gain Scaling (Volts/div -> deflection)
 * 4. Bandwidth Limiting (Single-pole RC low-pass filter)
 * 5. Input Thermal/Preamplifier Noise (Gaussian noise)
 * 6. Analog Rail Saturation (Clipping)
 */
export class AnalogFrontEnd {
  private _coupling: Coupling;
  private _probeAttenuation: ProbeAttenuation;
  private _voltsPerDiv: number;
  private _offset: number;
  private _bandwidthLimit: boolean;
  private _cutoffFrequency: number;
  private _noiseRms: number;
  private _minRailVoltage: number;
  private _maxRailVoltage: number;
  private _random: DeterministicRandom;

  // Filter state variables
  private _acPrevIn: number = 0.0;
  private _acPrevOut: number = 0.0;
  private _lpPrevOut: number = 0.0;

  // Fixed AC high-pass cutoff (standard DSO is ~10 Hz)
  private static readonly AC_COUPLING_CUTOFF_HZ = 10.0;

  constructor(config: AFEConfig = {}) {
    this._coupling = config.coupling ?? 'DC';
    this._probeAttenuation = config.probeAttenuation ?? '1X';
    this._voltsPerDiv = config.voltsPerDiv ?? 1.0;
    this._offset = config.offset ?? 0.0;
    this._bandwidthLimit = config.bandwidthLimit ?? false;
    this._cutoffFrequency = config.cutoffFrequency ?? 20_000_000; // 20 MHz default
    this._noiseRms = config.noiseRms ?? 0.0;
    this._minRailVoltage = config.minRailVoltage ?? -5.0;
    this._maxRailVoltage = config.maxRailVoltage ?? +5.0;
    this._random = new DeterministicRandom(config.noiseSeed ?? 42);

    this.validate();
  }

  public get coupling(): Coupling {
    return this._coupling;
  }

  public get probeAttenuation(): ProbeAttenuation {
    return this._probeAttenuation;
  }

  public get voltsPerDiv(): number {
    return this._voltsPerDiv;
  }

  public get offset(): number {
    return this._offset;
  }

  public get bandwidthLimit(): boolean {
    return this._bandwidthLimit;
  }

  public get cutoffFrequency(): number {
    return this._cutoffFrequency;
  }

  public get noiseRms(): number {
    return this._noiseRms;
  }

  public get minRailVoltage(): number {
    return this._minRailVoltage;
  }

  public get maxRailVoltage(): number {
    return this._maxRailVoltage;
  }

  public setCoupling(coupling: Coupling): void {
    this._coupling = coupling;
    this.resetFilters();
  }

  public setProbeAttenuation(attenuation: ProbeAttenuation): void {
    this._probeAttenuation = attenuation;
  }

  public setVoltsPerDiv(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new DomainValidationError('voltsPerDiv', 'Volts/div must be a positive finite number');
    }
    this._voltsPerDiv = value;
  }

  public setOffset(offset: number): void {
    if (!Number.isFinite(offset)) {
      throw new DomainValidationError('offset', 'Offset must be a finite number');
    }
    this._offset = offset;
  }

  public setBandwidthLimit(enabled: boolean, cutoffHz?: number): void {
    this._bandwidthLimit = enabled;
    if (cutoffHz !== undefined) {
      if (!Number.isFinite(cutoffHz) || cutoffHz <= 0) {
        throw new DomainValidationError('cutoffFrequency', 'Cutoff frequency must be positive');
      }
      this._cutoffFrequency = cutoffHz;
    }
    this.resetFilters();
  }

  public setNoiseRms(rms: number): void {
    if (!Number.isFinite(rms) || rms < 0) {
      throw new DomainValidationError('noiseRms', 'Noise RMS must be non-negative');
    }
    this._noiseRms = rms;
  }

  public setRails(minRail: number, maxRail: number): void {
    if (minRail >= maxRail) {
      throw new DomainValidationError('rails', 'Negative rail must be strictly less than positive rail');
    }
    this._minRailVoltage = minRail;
    this._maxRailVoltage = maxRail;
  }

  public resetFilters(): void {
    this._acPrevIn = 0.0;
    this._acPrevOut = 0.0;
    this._lpPrevOut = 0.0;
  }

  /**
   * Evaluates single-sample through the Analog Front End.
   *
   * @param vIn Raw signal source voltage in Volts.
   * @param dt  Simulation time step in seconds (1 / sampleRate).
   * @returns Scaled, filtered, clipped analog voltage ready for ADC.
   */
  public processSample(vIn: number, dt: number): number {
    // 1. Coupling stage
    let vCoupled: number;
    if (this._coupling === 'GND') {
      vCoupled = 0.0;
    } else if (this._coupling === 'DC') {
      vCoupled = vIn;
    } else {
      // AC Coupling: Single-pole high-pass filter: y[n] = beta * (y[n-1] + x[n] - x[n-1])
      const omega = 2 * Math.PI * AnalogFrontEnd.AC_COUPLING_CUTOFF_HZ;
      const beta = 1.0 / (1.0 + omega * dt);
      vCoupled = beta * (this._acPrevOut + vIn - this._acPrevIn);
      this._acPrevIn = vIn;
      this._acPrevOut = vCoupled;
    }

    // 2. Probe Attenuation stage
    const probeFactor = this._probeAttenuation === '10X' ? 0.1 : 1.0;
    const vProbe = vCoupled * probeFactor;

    // 3. Offset and Vertical Gain stage
    // Deflection V_scaled = (V_probe - V_offset) / voltsPerDiv
    const gain = 1.0 / this._voltsPerDiv;
    let vScaled = (vProbe - this._offset) * gain;

    // 4. Bandwidth Limiting (Low-Pass Filter) stage
    if (this._bandwidthLimit) {
      // Single-pole RC low-pass: y[n] = y[n-1] + alpha * (x[n] - y[n-1])
      const omegaLp = 2 * Math.PI * this._cutoffFrequency;
      const alpha = (omegaLp * dt) / (1.0 + omegaLp * dt);
      vScaled = this._lpPrevOut + alpha * (vScaled - this._lpPrevOut);
      this._lpPrevOut = vScaled;
    }

    // 5. Analog Noise Injection (Gaussian Box-Muller)
    if (this._noiseRms > 0) {
      const u1 = Math.max(1e-12, this._random.next());
      const u2 = this._random.next();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      vScaled += z0 * this._noiseRms;
    }

    // 6. Analog Rail Saturation (Clipping)
    if (vScaled > this._maxRailVoltage) {
      vScaled = this._maxRailVoltage;
    } else if (vScaled < this._minRailVoltage) {
      vScaled = this._minRailVoltage;
    }

    return vScaled;
  }

  /**
   * High-throughput batch processing of analog samples into a preallocated buffer.
   * Zero heap allocations.
   */
  public processBatch(vIn: Float32Array, vOut: Float32Array, dt: number, count?: number): void {
    const n = count ?? Math.min(vIn.length, vOut.length);
    for (let i = 0; i < n; i++) {
      vOut[i] = this.processSample(vIn[i], dt);
    }
  }

  private validate(): void {
    this.setVoltsPerDiv(this._voltsPerDiv);
    this.setOffset(this._offset);
    this.setRails(this._minRailVoltage, this._maxRailVoltage);
    this.setNoiseRms(this._noiseRms);
    if (this._bandwidthLimit) {
      this.setBandwidthLimit(true, this._cutoffFrequency);
    }
  }
}
