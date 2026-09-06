import { ChannelId } from '../types';
import { AnalogFrontEnd } from './AnalogFrontEnd';
import { ADCModel } from './ADCModel';
import { SimulationClock } from '../simulation/SimulationClock';
import { SignalGenerator } from '../simulation/SignalGenerator';
import { ADCConversionResult, AFEConfig, ADCConfig } from './types';

export type SignalSourceFn = (t: number) => number;

export interface AcquisitionChannelConfig {
  id: ChannelId;
  enabled?: boolean;
  afe?: AFEConfig;
  adc?: ADCConfig;
  signalSource?: SignalGenerator | SignalSourceFn;
}

/**
 * Independent Acquisition Channel (CH1 or CH2).
 *
 * Couples a signal source (or external circuit probe) to an Analog Front End
 * and an Analog-to-Digital Converter.
 */
export class AcquisitionChannel {
  public readonly id: ChannelId;
  private _enabled: boolean;
  public readonly afe: AnalogFrontEnd;
  public readonly adc: ADCModel;
  private _signalSource: SignalGenerator | SignalSourceFn | null = null;

  constructor(config: AcquisitionChannelConfig) {
    this.id = config.id;
    this._enabled = config.enabled ?? true;
    this.afe = new AnalogFrontEnd(config.afe);
    this.adc = new ADCModel(config.adc);

    if (config.signalSource) {
      this.setSignalSource(config.signalSource);
    }
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  public setSignalSource(source: SignalGenerator | SignalSourceFn | null): void {
    this._signalSource = source;
  }

  public get hasSignalSource(): boolean {
    return this._signalSource !== null;
  }

  /**
   * Samples instantaneous source voltage at simulation time t (in seconds).
   */
  public sampleSourceAt(t: number): number {
    if (!this._signalSource) {
      return 0.0; // Open circuit input (0V)
    }
    if (typeof this._signalSource === 'function') {
      return this._signalSource(t);
    }
    return this._signalSource.sampleAt(t);
  }

  /**
   * Executes batch acquisition:
   * 1. Samples signal source across clock interval
   * 2. Feeds raw voltage into Analog Front End (AFE)
   * 3. Feeds AFE output into ADC quantizer
   *
   * Zero heap allocations when destination buffers are provided.
   */
  public acquireBatch(
    clock: SimulationClock,
    count: number,
    scratchRawBuffer: Float32Array,
    scratchAfeBuffer: Float32Array,
    outQuantizedVolts: Float32Array,
    outDigitalCodes?: Uint16Array | Uint32Array
  ): ADCConversionResult {
    const dt = clock.timeStep;
    const startIdx = clock.sampleIndex;
    const sampleRate = clock.sampleRate;

    // 1. Synthesize / Sample source voltages
    if (this._signalSource instanceof SignalGenerator) {
      // Direct high-throughput batch generation from SignalGenerator
      // Note: we don't advance the clock here because clock is shared across channels
      for (let i = 0; i < count; i++) {
        scratchRawBuffer[i] = this._signalSource.sampleAt((startIdx + i) / sampleRate);
      }
    } else if (typeof this._signalSource === 'function') {
      for (let i = 0; i < count; i++) {
        scratchRawBuffer[i] = this._signalSource((startIdx + i) / sampleRate);
      }
    } else {
      // 0V flatline
      scratchRawBuffer.fill(0, 0, count);
    }

    // 2. Analog Front End stage
    this.afe.processBatch(scratchRawBuffer, scratchAfeBuffer, dt, count);

    // 3. ADC Quantization stage
    return this.adc.convertBatch(scratchAfeBuffer, outDigitalCodes, outQuantizedVolts, count);
  }
}
