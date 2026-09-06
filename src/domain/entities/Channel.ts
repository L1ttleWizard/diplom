import { ChannelId, Coupling, ProbeAttenuation, DomainValidationError } from '../types';
import { VoltDiv } from '../value-objects/VoltDiv';

export interface ChannelConfig {
  id: ChannelId;
  enabled?: boolean;
  voltsPerDiv?: VoltDiv | number;
  offset?: number;
  coupling?: Coupling;
  probeAttenuation?: ProbeAttenuation;
  bandwidthLimit?: boolean;
  invert?: boolean;
}

export class Channel {
  public readonly id: ChannelId;
  private _enabled: boolean;
  private _voltsPerDiv: VoltDiv;
  private _offset: number;
  private _coupling: Coupling;
  private _probeAttenuation: ProbeAttenuation;
  private _bandwidthLimit: boolean;
  private _invert: boolean;

  constructor(config: ChannelConfig) {
    this.id = config.id;
    this._enabled = config.enabled ?? true;
    this._voltsPerDiv =
      config.voltsPerDiv instanceof VoltDiv
        ? config.voltsPerDiv
        : new VoltDiv(config.voltsPerDiv ?? 1.0);
    this._offset = config.offset ?? 0.0;
    this._coupling = config.coupling ?? 'DC';
    this._probeAttenuation = config.probeAttenuation ?? '1X';
    this._bandwidthLimit = config.bandwidthLimit ?? false;
    this._invert = config.invert ?? false;

    this.validateOffset(this._offset);
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public get voltsPerDiv(): VoltDiv {
    return this._voltsPerDiv;
  }

  public get offset(): number {
    return this._offset;
  }

  public get coupling(): Coupling {
    return this._coupling;
  }

  public get probeAttenuation(): ProbeAttenuation {
    return this._probeAttenuation;
  }

  public get bandwidthLimit(): boolean {
    return this._bandwidthLimit;
  }

  public get invert(): boolean {
    return this._invert;
  }

  public enable(): void {
    this._enabled = true;
  }

  public disable(): void {
    this._enabled = false;
  }

  public setVoltsPerDiv(value: VoltDiv | number): void {
    const newVoltDiv = value instanceof VoltDiv ? value : new VoltDiv(value);
    this._voltsPerDiv = newVoltDiv;
    // Re-check offset invariant for new scale
    this.validateOffset(this._offset);
  }

  public setOffset(offset: number): void {
    if (!Number.isFinite(offset)) {
      throw new DomainValidationError('offset', 'Offset must be a finite number');
    }
    this.validateOffset(offset);
    this._offset = offset;
  }

  public setCoupling(coupling: Coupling): void {
    this._coupling = coupling;
  }

  public setProbeAttenuation(attenuation: ProbeAttenuation): void {
    this._probeAttenuation = attenuation;
  }

  public setBandwidthLimit(limit: boolean): void {
    this._bandwidthLimit = limit;
  }

  public setInvert(invert: boolean): void {
    this._invert = invert;
  }

  private validateOffset(offset: number): void {
    // Invariant: offset must be within +/- 10 divisions of current scale
    const maxOffset = this._voltsPerDiv.value * 10;
    if (Math.abs(offset) > maxOffset + 1e-9) {
      throw new DomainValidationError(
        'offset',
        `Offset ${offset}V exceeds allowable range (±${maxOffset}V) for ${this._voltsPerDiv.toString()}/div`
      );
    }
  }

  public clone(): Channel {
    return new Channel({
      id: this.id,
      enabled: this._enabled,
      voltsPerDiv: this._voltsPerDiv,
      offset: this._offset,
      coupling: this._coupling,
      probeAttenuation: this._probeAttenuation,
      bandwidthLimit: this._bandwidthLimit,
      invert: this._invert
    });
  }
}
