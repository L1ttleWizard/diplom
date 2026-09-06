import {
  PROTOCOL_VERSION,
  WorkerState,
  WorkerCommandMessage,
  WorkerEventMessage,
  WorkerInitPayload,
  WorkerConfigurePayload,
  WorkerStartPayload,
  validateWorkerCommand
} from './protocol';
import { SimulationClock } from '../../domain/simulation/SimulationClock';
import { SignalGenerator } from '../../domain/simulation/SignalGenerator';
import { AnalogFrontEnd } from '../../domain/acquisition/AnalogFrontEnd';
import { ADCModel } from '../../domain/acquisition/ADCModel';
import { SharedRingBufferProducer } from '../../data/shared/SharedRingBufferProducer';

export type PostMessageFn = (message: WorkerEventMessage, transfer?: Transferable[]) => void;

/**
 * Headless Core of the Acquisition Worker.
 *
 * Implements the continuous acquisition loop, versioned protocol handlers,
 * and transferable buffer transfers or zero-copy SharedArrayBuffer writes.
 * Decoupled from browser DOM/Worker APIs so it can be verified in Vitest.
 */
export class AcquisitionWorkerCore {
  private _state: WorkerState = 'UNINITIALIZED';
  private _clock: SimulationClock;
  private _batchSize: number = 20_000;
  private _intervalMs: number = 20; // 50 Hz default tick rate
  private _batchIndex: number = 0;
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _producer: SharedRingBufferProducer | null = null;

  // Signal generators for CH1 & CH2
  public readonly genCh1: SignalGenerator;
  public readonly genCh2: SignalGenerator;

  // Analog Front Ends
  public readonly afeCh1: AnalogFrontEnd;
  public readonly afeCh2: AnalogFrontEnd;

  // ADCs
  public readonly adcCh1: ADCModel;
  public readonly adcCh2: ADCModel;

  // Reusable scratch buffers for AFE evaluation and shared memory writes
  private _scratchRaw: Float32Array;
  private _scratchAfe: Float32Array;
  private _scratchCh1Out: Float32Array;
  private _scratchCh2Out: Float32Array;

  constructor() {
    this._clock = new SimulationClock(1_000_000);
    this.genCh1 = new SignalGenerator({ waveform: 'SINE', frequency: 1000, amplitude: 2.0 });
    this.genCh2 = new SignalGenerator({ waveform: 'SQUARE', frequency: 10_000, amplitude: 4.0 });

    this.afeCh1 = new AnalogFrontEnd({ voltsPerDiv: 1.0 });
    this.afeCh2 = new AnalogFrontEnd({ voltsPerDiv: 2.0 });

    this.adcCh1 = new ADCModel({ sampleRate: 1_000_000 });
    this.adcCh2 = new ADCModel({ sampleRate: 1_000_000 });

    this._scratchRaw = new Float32Array(this._batchSize);
    this._scratchAfe = new Float32Array(this._batchSize);
    this._scratchCh1Out = new Float32Array(this._batchSize);
    this._scratchCh2Out = new Float32Array(this._batchSize);
  }

  public get state(): WorkerState {
    return this._state;
  }

  public get clock(): SimulationClock {
    return this._clock;
  }

  public get batchSize(): number {
    return this._batchSize;
  }

  public get batchIndex(): number {
    return this._batchIndex;
  }

  /**
   * Main dispatch entry point for all incoming command messages.
   */
  public handleMessage(rawMessage: unknown, postMessage: PostMessageFn): void {
    try {
      const cmd = validateWorkerCommand(rawMessage);
      switch (cmd.type) {
        case 'INIT':
          this.handleInit(cmd, postMessage);
          break;
        case 'START':
          this.handleStart(cmd, postMessage);
          break;
        case 'STOP':
          this.handleStop(cmd, postMessage);
          break;
        case 'CONFIGURE':
          this.handleConfigure(cmd, postMessage);
          break;
        case 'RESET':
          this.handleReset(cmd, postMessage);
          break;
        default:
          throw new Error(`Unhandled command: ${(cmd as WorkerCommandMessage).type}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.transitionState('ERROR', postMessage);
      postMessage({
        version: PROTOCOL_VERSION,
        id: `err-${Date.now()}`,
        type: 'ERROR',
        timestamp: Date.now(),
        payload: {
          code: 'COMMAND_PROCESSING_ERROR',
          message,
          recoverable: true,
          timestamp: Date.now()
        }
      });
    }
  }

  private handleInit(cmd: WorkerCommandMessage, postMessage: PostMessageFn): void {
    const payload = (cmd.payload ?? {}) as WorkerInitPayload;

    if (payload.sampleRate) {
      this._clock.setSampleRate(payload.sampleRate);
      this.adcCh1.setSampleRate(payload.sampleRate);
      this.adcCh2.setSampleRate(payload.sampleRate);
    }
    if (payload.batchSize && payload.batchSize > 0) {
      this._batchSize = payload.batchSize;
      this._scratchRaw = new Float32Array(this._batchSize);
      this._scratchAfe = new Float32Array(this._batchSize);
      this._scratchCh1Out = new Float32Array(this._batchSize);
      this._scratchCh2Out = new Float32Array(this._batchSize);
    }
    if (payload.intervalMs && payload.intervalMs > 0) {
      this._intervalMs = payload.intervalMs;
    }

    if (payload.sharedBuffer) {
      this._producer = new SharedRingBufferProducer(payload.sharedBuffer);
    } else {
      this._producer = null;
    }

    // Configure CH1
    if (payload.ch1) {
      if (payload.ch1.waveform) this.genCh1.setWaveform(payload.ch1.waveform);
      if (payload.ch1.frequency !== undefined) this.genCh1.setFrequency(payload.ch1.frequency);
      if (payload.ch1.amplitude !== undefined) this.genCh1.setAmplitude(payload.ch1.amplitude);
      if (payload.ch1.offset !== undefined) this.genCh1.setOffset(payload.ch1.offset);
      if (payload.ch1.phase !== undefined) this.genCh1.setPhase(payload.ch1.phase);
      if (payload.ch1.dutyCycle !== undefined) this.genCh1.setDutyCycle(payload.ch1.dutyCycle);
      if (payload.ch1.afe?.voltsPerDiv) this.afeCh1.setVoltsPerDiv(payload.ch1.afe.voltsPerDiv);
      if (payload.ch1.afe?.coupling) this.afeCh1.setCoupling(payload.ch1.afe.coupling);
    }

    // Configure CH2
    if (payload.ch2) {
      if (payload.ch2.waveform) this.genCh2.setWaveform(payload.ch2.waveform);
      if (payload.ch2.frequency !== undefined) this.genCh2.setFrequency(payload.ch2.frequency);
      if (payload.ch2.amplitude !== undefined) this.genCh2.setAmplitude(payload.ch2.amplitude);
      if (payload.ch2.offset !== undefined) this.genCh2.setOffset(payload.ch2.offset);
      if (payload.ch2.phase !== undefined) this.genCh2.setPhase(payload.ch2.phase);
      if (payload.ch2.dutyCycle !== undefined) this.genCh2.setDutyCycle(payload.ch2.dutyCycle);
      if (payload.ch2.afe?.voltsPerDiv) this.afeCh2.setVoltsPerDiv(payload.ch2.afe.voltsPerDiv);
      if (payload.ch2.afe?.coupling) this.afeCh2.setCoupling(payload.ch2.afe.coupling);
    }

    this.transitionState('IDLE', postMessage);

    postMessage({
      version: PROTOCOL_VERSION,
      id: cmd.id,
      type: 'INITIALIZED',
      timestamp: Date.now(),
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        sampleRate: this._clock.sampleRate,
        batchSize: this._batchSize,
        workerTimestamp: performance.now(),
        dataPlaneMode: this._producer ? 'SHARED_ARRAY_BUFFER' : 'MESSAGE_PASSING'
      }
    });
  }

  private handleStart(cmd: WorkerCommandMessage, postMessage: PostMessageFn): void {
    const payload = (cmd.payload ?? {}) as WorkerStartPayload;
    if (payload.intervalMs && payload.intervalMs > 0) {
      this._intervalMs = payload.intervalMs;
    }

    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }

    this.transitionState('RUNNING', postMessage);
    if (this._producer) {
      this._producer.setState('RUNNING');
    }

    // Begin background interval loop
    this._timerId = setInterval(() => {
      this.produceBatch(postMessage);
    }, this._intervalMs);
  }

  private handleStop(cmd: WorkerCommandMessage, postMessage: PostMessageFn): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }

    this.transitionState('STOPPED', postMessage);
    if (this._producer) {
      this._producer.setState('STOPPED');
    }
  }

  private handleConfigure(cmd: WorkerCommandMessage, postMessage: PostMessageFn): void {
    const p = (cmd.payload ?? {}) as WorkerConfigurePayload;

    if (p.sampleRate) {
      this._clock.setSampleRate(p.sampleRate);
      this.adcCh1.setSampleRate(p.sampleRate);
      this.adcCh2.setSampleRate(p.sampleRate);
    }
    if (p.batchSize && p.batchSize > 0) {
      this._batchSize = p.batchSize;
      this._scratchRaw = new Float32Array(this._batchSize);
      this._scratchAfe = new Float32Array(this._batchSize);
    }

    const channelId = p.channelId ?? 'CH1';
    const gen = channelId === 'CH1' ? this.genCh1 : this.genCh2;
    const afe = channelId === 'CH1' ? this.afeCh1 : this.afeCh2;
    const adc = channelId === 'CH1' ? this.adcCh1 : this.adcCh2;

    if (p.signal) {
      if (p.signal.waveform) gen.setWaveform(p.signal.waveform);
      if (p.signal.frequency !== undefined) gen.setFrequency(p.signal.frequency);
      if (p.signal.amplitude !== undefined) gen.setAmplitude(p.signal.amplitude);
      if (p.signal.offset !== undefined) gen.setOffset(p.signal.offset);
      if (p.signal.phase !== undefined) gen.setPhase(p.signal.phase);
      if (p.signal.dutyCycle !== undefined) gen.setDutyCycle(p.signal.dutyCycle);
    }

    if (p.afe) {
      if (p.afe.voltsPerDiv !== undefined) afe.setVoltsPerDiv(p.afe.voltsPerDiv);
      if (p.afe.offset !== undefined) afe.setOffset(p.afe.offset);
      if (p.afe.coupling !== undefined) afe.setCoupling(p.afe.coupling);
      if (p.afe.probeAttenuation !== undefined) afe.setProbeAttenuation(p.afe.probeAttenuation);
      if (p.afe.bandwidthLimit !== undefined) {
        afe.setBandwidthLimit(p.afe.bandwidthLimit, p.afe.cutoffFrequency);
      }
      if (p.afe.noiseRms !== undefined) afe.setNoiseRms(p.afe.noiseRms);
    }

    if (p.adc) {
      if (p.adc.resolution !== undefined) adc.setResolution(p.adc.resolution);
      if (p.adc.fullScaleVoltage !== undefined) adc.setFullScaleVoltage(p.adc.fullScaleVoltage);
    }

    postMessage({
      version: PROTOCOL_VERSION,
      id: cmd.id,
      type: 'CONFIGURED',
      timestamp: Date.now(),
      payload: {
        appliedConfig: p as Record<string, unknown>
      }
    });
  }

  private handleReset(cmd: WorkerCommandMessage, postMessage: PostMessageFn): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this._clock.reset();
    this.afeCh1.resetFilters();
    this.afeCh2.resetFilters();
    this._batchIndex = 0;

    if (this._producer) {
      this._producer.reset();
      this._producer.setState('IDLE');
    }

    this.transitionState('IDLE', postMessage);
  }

  public get producer(): SharedRingBufferProducer | null {
    return this._producer;
  }

  /**
   * Generates a single batch of CH1 and CH2 samples.
   * If a SharedArrayBuffer was supplied, writes directly into shared memory with zero allocations.
   * Otherwise falls back to Transferable ArrayBuffer transfer.
   */
  public produceBatch(postMessage: PostMessageFn): void {
    if (this._state !== 'RUNNING') return;

    const t0 = performance.now();
    const count = this._batchSize;
    const dt = this._clock.timeStep;
    const sampleRate = this._clock.sampleRate;
    const startIdx = this._clock.sampleIndex;
    const simStart = this._clock.simulationTime;

    // Use pre-allocated scratch arrays when writing to shared memory to eliminate GC
    const ch1Out = this._producer ? this._scratchCh1Out : new Float32Array(count);
    const ch2Out = this._producer ? this._scratchCh2Out : new Float32Array(count);

    // 1. CH1 synthesis & processing
    for (let i = 0; i < count; i++) {
      this._scratchRaw[i] = this.genCh1.sampleAt((startIdx + i) / sampleRate);
    }
    this.afeCh1.processBatch(this._scratchRaw, this._scratchAfe, dt, count);
    const resCh1 = this.adcCh1.convertBatch(this._scratchAfe, undefined, ch1Out, count);

    // 2. CH2 synthesis & processing
    for (let i = 0; i < count; i++) {
      this._scratchRaw[i] = this.genCh2.sampleAt((startIdx + i) / sampleRate);
    }
    this.afeCh2.processBatch(this._scratchRaw, this._scratchAfe, dt, count);
    const resCh2 = this.adcCh2.convertBatch(this._scratchAfe, undefined, ch2Out, count);

    // 3. Advance clock after both channels have sampled the identical time slice
    this._clock.advance(count);
    const simEnd = this._clock.simulationTime;
    const durationMs = performance.now() - t0;
    const batchIdx = this._batchIndex++;

    if (this._producer) {
      // Direct write into shared memory ring buffer with Store-Release Atomics
      this._producer.writeBatch(ch1Out, ch2Out, count, {
        batchIndex: batchIdx,
        sampleCount: count,
        sampleRate,
        simulationTimeStart: simStart,
        simulationTimeEnd: simEnd,
        ch1Clipped: resCh1.isClipped,
        ch2Clipped: resCh2.isClipped,
        producedTimestamp: performance.now()
      });

      // Zero-copy notification (no buffers transferred over postMessage)
      postMessage({
        version: PROTOCOL_VERSION,
        id: `batch-${batchIdx}`,
        type: 'BATCH_PRODUCED',
        timestamp: Date.now(),
        payload: {
          batchIndex: batchIdx,
          sampleCount: count,
          sampleRate,
          simulationTimeStart: simStart,
          simulationTimeEnd: simEnd,
          ch1Clipped: resCh1.isClipped,
          ch2Clipped: resCh2.isClipped,
          producedAt: performance.now(),
          generationDurationMs: durationMs,
          mode: 'SHARED_ARRAY_BUFFER'
        }
      });
    } else {
      // Fallback: Transferable ArrayBuffer pointer transfer
      const event: WorkerEventMessage = {
        version: PROTOCOL_VERSION,
        id: `batch-${batchIdx}`,
        type: 'BATCH_PRODUCED',
        timestamp: Date.now(),
        payload: {
          batchIndex: batchIdx,
          sampleCount: count,
          sampleRate,
          simulationTimeStart: simStart,
          simulationTimeEnd: simEnd,
          ch1Clipped: resCh1.isClipped,
          ch2Clipped: resCh2.isClipped,
          ch1Samples: ch1Out,
          ch2Samples: ch2Out,
          producedAt: performance.now(),
          generationDurationMs: durationMs,
          mode: 'MESSAGE_PASSING'
        }
      };

      postMessage(event, [ch1Out.buffer, ch2Out.buffer]);
    }
  }

  private transitionState(newState: WorkerState, postMessage: PostMessageFn): void {
    if (this._state === newState) return;
    const prev = this._state;
    this._state = newState;

    postMessage({
      version: PROTOCOL_VERSION,
      id: `state-${Date.now()}`,
      type: 'STATE_CHANGED',
      timestamp: Date.now(),
      payload: {
        previous: prev,
        current: newState
      }
    });
  }

  public dispose(): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this._state = 'UNINITIALIZED';
  }
}
