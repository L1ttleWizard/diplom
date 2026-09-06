import {
  PROTOCOL_VERSION,
  WorkerState,
  WorkerCommandMessage,
  WorkerEventMessage,
  WorkerInitPayload,
  WorkerConfigurePayload,
  WorkerBatchPayload,
  WorkerErrorPayload,
  WorkerInitializedPayload
} from './protocol';
import { AcquisitionWorkerCore } from './AcquisitionWorkerCore';
import { SharedMemoryCapability } from '../../data/shared/SharedMemoryCapability';
import { SharedRingBufferLayout } from '../../data/shared/SharedRingBufferLayout';
import { SharedRingBufferConsumer } from '../../data/shared/SharedRingBufferConsumer';

export interface IWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  terminate(): void;
}

/**
 * In-process mock port for running tests in pure Node environments without DOM Worker.
 */
export class InProcessWorkerPort implements IWorkerPort {
  private readonly _core: AcquisitionWorkerCore;
  public onmessage: ((ev: { data: unknown }) => void) | null = null;
  public onerror: ((ev: unknown) => void) | null = null;

  constructor() {
    this._core = new AcquisitionWorkerCore();
  }

  public postMessage(message: unknown, _transfer?: Transferable[]): void {
    // Asynchronous dispatch simulating web worker postMessage
    queueMicrotask(() => {
      this._core.handleMessage(message, (eventMsg, _eventTransfer) => {
        if (this.onmessage) {
          this.onmessage({ data: eventMsg });
        }
      });
    });
  }

  public terminate(): void {
    this._core.dispose();
    this.onmessage = null;
    this.onerror = null;
  }
}

export type BatchCallback = (batch: WorkerBatchPayload) => void;
export type StateCallback = (state: WorkerState) => void;
export type ErrorCallback = (error: WorkerErrorPayload) => void;

export interface WorkerStartupOptions {
  enableSharedMemory?: boolean;
  sharedCapacity?: number;
  timeoutMs?: number;
}

/**
 * Acquisition Worker Client (Main Thread Facade).
 *
 * Manages Web Worker lifecycle: startup, continuous streaming, configuration,
 * clean shutdown, error handling, and state resynchronization on restart.
 * Supports zero-copy SharedArrayBuffer data plane with transparent message-passing fallback.
 */
export class AcquisitionWorkerClient {
  private _port: IWorkerPort | null = null;
  private _portFactory: () => IWorkerPort;
  private _state: WorkerState = 'UNINITIALIZED';
  private _cachedConfig: WorkerInitPayload = {};
  private _wasRunningBeforeRestart: boolean = false;
  private _dataPlaneMode: 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING' = 'MESSAGE_PASSING';
  private _sharedBuffer: SharedArrayBuffer | null = null;
  private _sharedConsumer: SharedRingBufferConsumer | null = null;

  // Listeners
  private _batchListeners: Set<BatchCallback> = new Set();
  private _stateListeners: Set<StateCallback> = new Set();
  private _errorListeners: Set<ErrorCallback> = new Set();

  // Metrics
  private _totalBatches: number = 0;
  private _totalSamples: number = 0;
  private _lastBatchTime: number = 0;
  private _latestLatencyMs: number = 0;
  private _avgLatencyMs: number = 0;
  private _rollingThroughputMsps: number = 0;

  constructor(portFactory?: () => IWorkerPort) {
    this._portFactory =
      portFactory ??
      (() => {
        if (typeof Worker !== 'undefined') {
          return new Worker(new URL('./acquisition.worker.ts', import.meta.url), {
            type: 'module'
          }) as unknown as IWorkerPort;
        }
        return new InProcessWorkerPort();
      });
  }

  public get state(): WorkerState {
    return this._state;
  }

  public get dataPlaneMode(): 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING' {
    return this._dataPlaneMode;
  }

  public get sharedBuffer(): SharedArrayBuffer | null {
    return this._sharedBuffer;
  }

  public get sharedConsumer(): SharedRingBufferConsumer | null {
    return this._sharedConsumer;
  }

  public get totalBatches(): number {
    return this._totalBatches;
  }

  public get totalSamples(): number {
    return this._totalSamples;
  }

  public get latestLatencyMs(): number {
    return this._latestLatencyMs;
  }

  public get avgLatencyMs(): number {
    return this._avgLatencyMs;
  }

  public get rollingThroughputMsps(): number {
    return this._rollingThroughputMsps;
  }

  public get cachedConfig(): Readonly<WorkerInitPayload> {
    return this._cachedConfig;
  }

  /**
   * Initializes the worker and waits for the INITIALIZED handshake.
   * Dynamically negotiates SharedArrayBuffer or fallback mode based on capability detection.
   */
  public async startup(
    config: WorkerInitPayload = {},
    options?: WorkerStartupOptions | number
  ): Promise<void> {
    if (this._port) {
      this.shutdown();
    }

    const opts: WorkerStartupOptions =
      typeof options === 'number' ? { timeoutMs: options } : (options ?? {});
    const timeout = opts.timeoutMs ?? 3000;

    this._cachedConfig = { ...config };

    // Capability check: allocate SharedArrayBuffer if supported and requested
    const useSharedMemory =
      opts.enableSharedMemory !== false && SharedMemoryCapability.isSupported();

    if (useSharedMemory && !this._cachedConfig.sharedBuffer) {
      const cap = opts.sharedCapacity ?? 65_536;
      const sRate = typeof config.sampleRate === 'number' ? config.sampleRate : 1_000_000;
      this._sharedBuffer = SharedRingBufferLayout.createBuffer(cap, sRate);
      this._sharedConsumer = new SharedRingBufferConsumer(this._sharedBuffer);
      this._cachedConfig.sharedBuffer = this._sharedBuffer;
    } else if (this._cachedConfig.sharedBuffer) {
      this._sharedBuffer = this._cachedConfig.sharedBuffer;
      this._sharedConsumer = new SharedRingBufferConsumer(this._sharedBuffer);
    } else {
      this._sharedBuffer = null;
      this._sharedConsumer = null;
    }

    this._port = this._portFactory();
    this.setupPortListeners(this._port);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Worker startup timed out after ${timeout}ms`));
      }, timeout);

      const initId = `init-${Date.now()}`;

      const tempHandler = (ev: { data: unknown }) => {
        const msg = ev.data as WorkerEventMessage;
        if (msg && msg.type === 'INITIALIZED' && msg.id === initId) {
          clearTimeout(timer);
          this._state = 'IDLE';
          const p = msg.payload as WorkerInitializedPayload;
          this._dataPlaneMode =
            p.dataPlaneMode ?? (this._sharedBuffer ? 'SHARED_ARRAY_BUFFER' : 'MESSAGE_PASSING');
          resolve();
        } else if (msg && msg.type === 'ERROR') {
          clearTimeout(timer);
          reject(new Error((msg.payload as WorkerErrorPayload).message));
        }
      };

      const originalHandler = this._port!.onmessage;
      this._port!.onmessage = (ev) => {
        tempHandler(ev);
        originalHandler?.(ev);
      };

      this.sendCommand('INIT', this._cachedConfig, initId);
    });
  }

  /**
   * Starts continuous acquisition in the worker.
   */
  public start(intervalMs?: number): void {
    if (!this._port) throw new Error('Worker not started. Call startup() first.');
    this.sendCommand('START', { intervalMs });
    this._wasRunningBeforeRestart = true;
    this._state = 'RUNNING';
  }

  /**
   * Stops continuous acquisition in the worker.
   */
  public stop(): void {
    if (!this._port) return;
    this.sendCommand('STOP', {});
    this._wasRunningBeforeRestart = false;
    this._state = 'STOPPED';
  }

  /**
   * Updates configuration dynamically and caches the update for state resynchronization.
   */
  public configure(update: WorkerConfigurePayload): void {
    if (!this._port) throw new Error('Worker not started');

    // Update cached configuration for resync
    if (update.sampleRate) this._cachedConfig.sampleRate = update.sampleRate;
    if (update.batchSize) this._cachedConfig.batchSize = update.batchSize;
    if (update.intervalMs) this._cachedConfig.intervalMs = update.intervalMs;

    if (update.channelId === 'CH1' || (!update.channelId && update.signal)) {
      this._cachedConfig.ch1 = {
        ...this._cachedConfig.ch1,
        ...update.signal,
        afe: { ...this._cachedConfig.ch1?.afe, ...update.afe },
        adc: { ...this._cachedConfig.ch1?.adc, ...update.adc }
      };
    }
    if (update.channelId === 'CH2') {
      this._cachedConfig.ch2 = {
        ...this._cachedConfig.ch2,
        ...update.signal,
        afe: { ...this._cachedConfig.ch2?.afe, ...update.afe },
        adc: { ...this._cachedConfig.ch2?.adc, ...update.adc }
      };
    }

    this.sendCommand('CONFIGURE', update);
  }

  /**
   * Resets worker simulation clock, filters, and state.
   */
  public reset(): void {
    if (!this._port) return;
    this.sendCommand('RESET', {});
  }

  /**
   * Shuts down the worker cleanly and terminates resources.
   */
  public shutdown(): void {
    if (!this._port) return;
    try {
      this.sendCommand('STOP', {});
      this._port.terminate();
    } catch {
      // Ignore termination errors
    } finally {
      this._port = null;
      this._sharedBuffer = null;
      this._sharedConsumer = null;
      this._dataPlaneMode = 'MESSAGE_PASSING';
      this._state = 'UNINITIALIZED';
    }
  }

  /**
   * Recovers from failure by terminating the crashed worker, re-spawning a new one,
   * re-sending the cached configuration (state resynchronization), and resuming streaming if active.
   */
  public async restart(): Promise<void> {
    const resumeRunning = this._wasRunningBeforeRestart;
    this.shutdown();
    await this.startup(this._cachedConfig);
    if (resumeRunning) {
      this.start();
    }
  }

  public onBatch(callback: BatchCallback): () => void {
    this._batchListeners.add(callback);
    return () => this._batchListeners.delete(callback);
  }

  public onStateChange(callback: StateCallback): () => void {
    this._stateListeners.add(callback);
    return () => this._stateListeners.delete(callback);
  }

  public onError(callback: ErrorCallback): () => void {
    this._errorListeners.add(callback);
    return () => this._errorListeners.delete(callback);
  }

  private sendCommand<T>(type: WorkerCommandMessage['type'], payload: T, id?: string): void {
    if (!this._port) return;
    const msg: WorkerCommandMessage<T> = {
      version: PROTOCOL_VERSION,
      id: id ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: Date.now(),
      payload
    };
    this._port.postMessage(msg);
  }

  private setupPortListeners(port: IWorkerPort): void {
    port.onmessage = (ev) => {
      const msg = ev.data as WorkerEventMessage;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'BATCH_PRODUCED': {
          const batch = msg.payload as WorkerBatchPayload;
          const now = performance.now();
          this._latestLatencyMs = Math.max(0, Date.now() - msg.timestamp);
          this._avgLatencyMs =
            this._totalBatches === 0
              ? this._latestLatencyMs
              : this._avgLatencyMs * 0.9 + this._latestLatencyMs * 0.1;

          this._totalBatches++;
          this._totalSamples += batch.sampleCount;

          if (this._lastBatchTime > 0) {
            const dtSec = (now - this._lastBatchTime) / 1000;
            if (dtSec > 0) {
              const currentMsps = (batch.sampleCount / dtSec) / 1_000_000;
              this._rollingThroughputMsps =
                this._rollingThroughputMsps === 0
                  ? currentMsps
                  : this._rollingThroughputMsps * 0.8 + currentMsps * 0.2;
            }
          }
          this._lastBatchTime = now;

          for (const listener of this._batchListeners) {
            listener(batch);
          }
          break;
        }

        case 'STATE_CHANGED': {
          const payload = msg.payload as { current: WorkerState };
          this._state = payload.current;
          for (const listener of this._stateListeners) {
            listener(payload.current);
          }
          break;
        }

        case 'ERROR': {
          const err = msg.payload as WorkerErrorPayload;
          this._state = 'ERROR';
          for (const listener of this._errorListeners) {
            listener(err);
          }
          break;
        }

        default:
          break;
      }
    };

    port.onerror = (err) => {
      this._state = 'ERROR';
      const errorPayload: WorkerErrorPayload = {
        code: 'WORKER_RUNTIME_EXCEPTION',
        message: err instanceof Error ? err.message : 'Unknown worker runtime error',
        recoverable: true,
        timestamp: Date.now()
      };
      for (const listener of this._errorListeners) {
        listener(errorPayload);
      }
    };
  }
}
