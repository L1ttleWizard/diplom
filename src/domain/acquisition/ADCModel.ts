import { DomainValidationError } from '../types';
import { ADCConfig, ADCResolution, ADCConversionResult, QuantizationMetrics, LogicalSampleRate } from './types';

/**
 * Analog-to-Digital Converter (ADC) Physical Model.
 *
 * Implements a uniform mid-tread quantizer with configurable bit resolution (8-16 bits),
 * full-scale voltage span [-VFS, +VFS], LSB step calculation, saturation/clipping tracking,
 * and reconstructed quantized voltage output.
 */
export class ADCModel {
  private _resolution: ADCResolution;
  private _fullScaleVoltage: number;
  private _sampleRate: number;

  // Cached quantizer parameters
  private _totalLevels: number;
  private _minVoltage: number;
  private _maxVoltage: number;
  private _lsbVoltage: number;

  public static readonly SUPPORTED_RATES: readonly LogicalSampleRate[] = [
    1_000_000,
    2_000_000,
    5_000_000
  ] as const;

  constructor(config: ADCConfig = {}) {
    this._resolution = config.resolution ?? 8;
    this._fullScaleVoltage = config.fullScaleVoltage ?? 4.0;
    this._sampleRate = config.sampleRate ?? 1_000_000;

    this._totalLevels = Math.pow(2, this._resolution);
    this._minVoltage = -this._fullScaleVoltage;
    this._maxVoltage = +this._fullScaleVoltage;
    this._lsbVoltage = (2.0 * this._fullScaleVoltage) / this._totalLevels;

    this.validate();
  }

  public get resolution(): ADCResolution {
    return this._resolution;
  }

  public get fullScaleVoltage(): number {
    return this._fullScaleVoltage;
  }

  public get sampleRate(): number {
    return this._sampleRate;
  }

  public get lsbVoltage(): number {
    return this._lsbVoltage;
  }

  public get totalLevels(): number {
    return this._totalLevels;
  }

  public get minVoltage(): number {
    return this._minVoltage;
  }

  public get maxVoltage(): number {
    return this._maxVoltage;
  }

  public get metrics(): QuantizationMetrics {
    return {
      lsbVoltage: this._lsbVoltage,
      totalLevels: this._totalLevels,
      minVoltage: this._minVoltage,
      maxVoltage: this._maxVoltage,
      theoreticalSnrDb: 6.02 * this._resolution + 1.76
    };
  }

  public setResolution(res: ADCResolution): void {
    if (![8, 10, 12, 14, 16].includes(res)) {
      throw new DomainValidationError('resolution', `Unsupported ADC resolution: ${res}`);
    }
    this._resolution = res;
    this.updateParameters();
  }

  public setFullScaleVoltage(vfs: number): void {
    if (!Number.isFinite(vfs) || vfs <= 0) {
      throw new DomainValidationError('fullScaleVoltage', 'Full scale voltage must be a positive finite number');
    }
    this._fullScaleVoltage = vfs;
    this.updateParameters();
  }

  public setSampleRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new DomainValidationError('sampleRate', 'Sample rate must be a positive number');
    }
    this._sampleRate = rate;
  }

  /**
   * Quantizes a single analog voltage into a digital code and reconstructed voltage.
   */
  public convertSample(vAnalog: number): { code: number; reconstructedVoltage: number; clippedLow: boolean; clippedHigh: boolean } {
    const rawIndex = Math.floor((vAnalog - this._minVoltage) / this._lsbVoltage);

    let code: number;
    let clippedLow = false;
    let clippedHigh = false;

    if (rawIndex <= 0) {
      code = 0;
      clippedLow = true;
    } else if (rawIndex >= this._totalLevels - 1) {
      code = this._totalLevels - 1;
      clippedHigh = true;
    } else {
      code = rawIndex;
    }

    // Mid-interval reconstructed voltage: min + (code + 0.5) * q
    const reconstructedVoltage = this._minVoltage + (code + 0.5) * this._lsbVoltage;

    return {
      code,
      reconstructedVoltage,
      clippedLow,
      clippedHigh
    };
  }

  /**
   * High-throughput batch conversion from analog input array into digital codes and/or reconstructed voltages.
   * Zero heap allocations when buffers are passed.
   */
  public convertBatch(
    analogIn: Float32Array,
    digitalCodes?: Uint16Array | Uint32Array,
    reconstructedOut?: Float32Array,
    count?: number
  ): ADCConversionResult {
    const n = count ?? analogIn.length;
    let clippedLowCount = 0;
    let clippedHighCount = 0;

    const minV = this._minVoltage;
    const lsb = this._lsbVoltage;
    const maxCode = this._totalLevels - 1;

    for (let i = 0; i < n; i++) {
      const v = analogIn[i];
      const rawIndex = Math.floor((v - minV) / lsb);

      let code: number;
      if (rawIndex <= 0) {
        code = 0;
        clippedLowCount++;
      } else if (rawIndex >= maxCode) {
        code = maxCode;
        clippedHighCount++;
      } else {
        code = rawIndex;
      }

      if (digitalCodes) {
        digitalCodes[i] = code;
      }
      if (reconstructedOut) {
        reconstructedOut[i] = minV + (code + 0.5) * lsb;
      }
    }

    return {
      sampleCount: n,
      clippedLowCount,
      clippedHighCount,
      isClipped: clippedLowCount > 0 || clippedHighCount > 0
    };
  }

  private updateParameters(): void {
    this._totalLevels = Math.pow(2, this._resolution);
    this._minVoltage = -this._fullScaleVoltage;
    this._maxVoltage = +this._fullScaleVoltage;
    this._lsbVoltage = (2.0 * this._fullScaleVoltage) / this._totalLevels;
  }

  private validate(): void {
    this.setResolution(this._resolution);
    this.setFullScaleVoltage(this._fullScaleVoltage);
    this.setSampleRate(this._sampleRate);
  }
}
