import { TriggerMode, TriggerSource, TriggerSlope, DomainValidationError } from '../types';

export interface TriggerConfig {
  mode?: TriggerMode;
  source?: TriggerSource;
  level?: number;
  slope?: TriggerSlope;
  holdoff?: number;
}

export class Trigger {
  private _mode: TriggerMode;
  private _source: TriggerSource;
  private _level: number;
  private _slope: TriggerSlope;
  private _holdoff: number;

  constructor(config: TriggerConfig = {}) {
    this._mode = config.mode ?? 'AUTO';
    this._source = config.source ?? 'CH1';
    this._level = config.level ?? 0.0;
    this._slope = config.slope ?? 'RISING';
    this._holdoff = config.holdoff ?? 100e-9; // 100ns default

    this.validate();
  }

  public get mode(): TriggerMode {
    return this._mode;
  }

  public get source(): TriggerSource {
    return this._source;
  }

  public get level(): number {
    return this._level;
  }

  public get slope(): TriggerSlope {
    return this._slope;
  }

  public get holdoff(): number {
    return this._holdoff;
  }

  public setMode(mode: TriggerMode): void {
    this._mode = mode;
  }

  public setSource(source: TriggerSource): void {
    this._source = source;
  }

  public setLevel(level: number): void {
    if (!Number.isFinite(level)) {
      throw new DomainValidationError('level', 'Trigger level must be a finite number');
    }
    this._level = level;
  }

  public setSlope(slope: TriggerSlope): void {
    this._slope = slope;
  }

  public setHoldoff(holdoff: number): void {
    if (!Number.isFinite(holdoff) || holdoff < 0) {
      throw new DomainValidationError('holdoff', 'Holdoff must be a non-negative finite number');
    }
    this._holdoff = holdoff;
  }

  private validate(): void {
    if (!Number.isFinite(this._level)) {
      throw new DomainValidationError('level', 'Trigger level must be a finite number');
    }
    if (!Number.isFinite(this._holdoff) || this._holdoff < 0) {
      throw new DomainValidationError('holdoff', 'Holdoff must be a non-negative finite number');
    }
  }

  public clone(): Trigger {
    return new Trigger({
      mode: this._mode,
      source: this._source,
      level: this._level,
      slope: this._slope,
      holdoff: this._holdoff
    });
  }
}
