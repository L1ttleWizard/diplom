import { MeasurementType, MeasurementStatus, ChannelId } from '../types';

export interface MeasurementConfig {
  id?: string;
  type: MeasurementType;
  channelId: ChannelId;
  value?: number | null;
  status?: MeasurementStatus;
  updatedAt?: number;
}

export class Measurement {
  public readonly id: string;
  public readonly type: MeasurementType;
  public readonly channelId: ChannelId;
  private _value: number | null;
  private _status: MeasurementStatus;
  private _updatedAt: number;

  constructor(config: MeasurementConfig) {
    this.id = config.id ?? `${config.channelId}_${config.type}`;
    this.type = config.type;
    this.channelId = config.channelId;
    this._value = config.value ?? null;
    this._status = config.status ?? (this._value !== null ? 'VALID' : 'COMPUTING');
    this._updatedAt = config.updatedAt ?? Date.now();
  }

  public get value(): number | null {
    return this._value;
  }

  public get status(): MeasurementStatus {
    return this._status;
  }

  public get updatedAt(): number {
    return this._updatedAt;
  }

  public get unit(): string {
    switch (this.type) {
      case 'Vpp':
      case 'Vmax':
      case 'Vmin':
      case 'Vrms':
        return 'V';
      case 'Frequency':
        return 'Hz';
      case 'Period':
      case 'RiseTime':
      case 'FallTime':
        return 's';
      case 'DutyCycle':
        return '%';
    }
  }

  public update(value: number | null, status: MeasurementStatus = 'VALID'): void {
    this._value = value;
    this._status = value === null && status === 'VALID' ? 'NO_SIGNAL' : status;
    this._updatedAt = Date.now();
  }

  public format(): string {
    if (this._status === 'COMPUTING') return '...';
    if (this._status === 'NO_SIGNAL' || this._value === null) return 'No Signal';
    if (this._status === 'CLIPPED') return 'Clipped';

    const val = this._value;
    switch (this.type) {
      case 'Vpp':
      case 'Vmax':
      case 'Vmin':
      case 'Vrms':
        if (Math.abs(val) < 1) return `${(val * 1000).toFixed(2)} mV`;
        return `${val.toFixed(3)} V`;
      case 'Frequency':
        if (val >= 1e6) return `${(val / 1e6).toFixed(3)} MHz`;
        if (val >= 1e3) return `${(val / 1e3).toFixed(3)} kHz`;
        return `${val.toFixed(2)} Hz`;
      case 'Period':
      case 'RiseTime':
      case 'FallTime':
        if (val < 1e-6) return `${(val * 1e9).toFixed(2)} ns`;
        if (val < 1e-3) return `${(val * 1e6).toFixed(2)} µs`;
        if (val < 1) return `${(val * 1e3).toFixed(2)} ms`;
        return `${val.toFixed(3)} s`;
      case 'DutyCycle':
        return `${val.toFixed(1)} %`;
    }
  }
}
