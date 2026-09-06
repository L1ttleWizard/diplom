import { TriggerMode, TriggerSource, TriggerSlope, DomainValidationError } from '../types';

export interface TriggerConfig {
  mode?: TriggerMode;
  source?: TriggerSource;
  level?: number;
  slope?: TriggerSlope;
  holdoff?: number;
  position?: number;
  hysteresis?: number;
  autoTimeout?: number;
}

export class Trigger {
  private _mode: TriggerMode;
  private _source: TriggerSource;
  private _level: number;
  private _slope: TriggerSlope;
  private _holdoff: number;
  private _position: number;
  private _hysteresis: number;
  private _autoTimeout: number;

  constructor(config: TriggerConfig = {}) {
    this._mode = config.mode ?? 'AUTO';
    this._source = config.source ?? 'CH1';
    this._level = config.level ?? 0.0;
    this._slope = config.slope ?? 'RISING';
    this._holdoff = config.holdoff ?? 100e-9; // 100ns default
    this._position = config.position ?? 0.5; // 50% = Center graticule default
    this._hysteresis = config.hysteresis ?? 0.02; // 20mV default noise band
    this._autoTimeout = config.autoTimeout ?? 0.04; // 40ms default auto-sweep timeout

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

  public get position(): number {
    return this._position;
  }

  public get hysteresis(): number {
    return this._hysteresis;
  }

  public get autoTimeout(): number {
    return this._autoTimeout;
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

  public setPosition(position: number): void {
    if (!Number.isFinite(position) || position < 0.0 || position > 1.0) {
      throw new DomainValidationError('position', 'Trigger position must be a number between 0.0 and 1.0');
    }
    this._position = position;
  }

  public setHysteresis(hysteresis: number): void {
    if (!Number.isFinite(hysteresis) || hysteresis < 0) {
      throw new DomainValidationError('hysteresis', 'Hysteresis must be a non-negative finite number');
    }
    this._hysteresis = hysteresis;
  }

  public setAutoTimeout(autoTimeout: number): void {
    if (!Number.isFinite(autoTimeout) || autoTimeout <= 0) {
      throw new DomainValidationError('autoTimeout', 'Auto-timeout must be a positive finite number');
    }
    this._autoTimeout = autoTimeout;
  }

  private validate(): void {
    if (!Number.isFinite(this._level)) {
      throw new DomainValidationError('level', 'Trigger level must be a finite number');
    }
    if (!Number.isFinite(this._holdoff) || this._holdoff < 0) {
      throw new DomainValidationError('holdoff', 'Holdoff must be a non-negative finite number');
    }
    if (!Number.isFinite(this._position) || this._position < 0.0 || this._position > 1.0) {
      throw new DomainValidationError('position', 'Trigger position must be between 0.0 and 1.0');
    }
    if (!Number.isFinite(this._hysteresis) || this._hysteresis < 0) {
      throw new DomainValidationError('hysteresis', 'Hysteresis must be non-negative');
    }
    if (!Number.isFinite(this._autoTimeout) || this._autoTimeout <= 0) {
      throw new DomainValidationError('autoTimeout', 'Auto-timeout must be positive');
    }
  }

  public clone(): Trigger {
    return new Trigger({
      mode: this._mode,
      source: this._source,
      level: this._level,
      slope: this._slope,
      holdoff: this._holdoff,
      position: this._position,
      hysteresis: this._hysteresis,
      autoTimeout: this._autoTimeout
    });
  }
}

