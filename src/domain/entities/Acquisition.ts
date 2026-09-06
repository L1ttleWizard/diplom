import { AcquisitionMode, DomainValidationError } from '../types';

export interface AcquisitionConfig {
  sampleRate?: number;
  recordLength?: number;
  memoryDepth?: number;
  mode?: AcquisitionMode;
  averagesCount?: number;
}

export class Acquisition {
  public static readonly MAX_LOGICAL_SAMPLE_RATE = 5_000_000; // 5 MSPS logical
  public static readonly MIN_LOGICAL_SAMPLE_RATE = 100;       // 100 SPS minimum

  private _sampleRate: number;
  private _recordLength: number;
  private _memoryDepth: number;
  private _mode: AcquisitionMode;
  private _averagesCount: number;

  constructor(config: AcquisitionConfig = {}) {
    this._memoryDepth = config.memoryDepth ?? 1_000_000; // 1M points max depth
    this._sampleRate = config.sampleRate ?? 2_000_000;    // 2 MSPS default
    this._recordLength = config.recordLength ?? 10_000;  // 10k points default
    this._mode = config.mode ?? 'SAMPLE';
    this._averagesCount = config.averagesCount ?? 4;

    this.validate();
  }

  public get sampleRate(): number {
    return this._sampleRate;
  }

  public get recordLength(): number {
    return this._recordLength;
  }

  public get memoryDepth(): number {
    return this._memoryDepth;
  }

  public get mode(): AcquisitionMode {
    return this._mode;
  }

  public get averagesCount(): number {
    return this._averagesCount;
  }

  public setSampleRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < Acquisition.MIN_LOGICAL_SAMPLE_RATE || rate > Acquisition.MAX_LOGICAL_SAMPLE_RATE) {
      throw new DomainValidationError(
        'sampleRate',
        `Sample rate ${rate} is out of bounds [${Acquisition.MIN_LOGICAL_SAMPLE_RATE}, ${Acquisition.MAX_LOGICAL_SAMPLE_RATE}] SPS`
      );
    }
    this._sampleRate = rate;
  }

  public setRecordLength(length: number): void {
    if (!Number.isInteger(length) || length <= 0) {
      throw new DomainValidationError('recordLength', 'Record length must be a positive integer');
    }
    if (length > this._memoryDepth) {
      throw new DomainValidationError(
        'recordLength',
        `Record length (${length}) cannot exceed memory depth (${this._memoryDepth})`
      );
    }
    this._recordLength = length;
  }

  public setMemoryDepth(depth: number): void {
    if (!Number.isInteger(depth) || depth <= 0) {
      throw new DomainValidationError('memoryDepth', 'Memory depth must be a positive integer');
    }
    this._memoryDepth = depth;
    if (this._recordLength > this._memoryDepth) {
      this._recordLength = this._memoryDepth;
    }
  }

  public setMode(mode: AcquisitionMode): void {
    this._mode = mode;
  }

  public setAveragesCount(count: number): void {
    if (!Number.isInteger(count) || count < 2 || (count & (count - 1)) !== 0) {
      throw new DomainValidationError('averagesCount', 'Averages count must be a power of 2 >= 2');
    }
    this._averagesCount = count;
  }

  private validate(): void {
    this.setSampleRate(this._sampleRate);
    this.setMemoryDepth(this._memoryDepth);
    this.setRecordLength(this._recordLength);
    if (this._mode === 'AVERAGE') {
      this.setAveragesCount(this._averagesCount);
    }
  }

  public clone(): Acquisition {
    return new Acquisition({
      sampleRate: this._sampleRate,
      recordLength: this._recordLength,
      memoryDepth: this._memoryDepth,
      mode: this._mode,
      averagesCount: this._averagesCount
    });
  }
}
