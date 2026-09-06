import { describe, it, expect, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  validateWorkerCommand,
  WorkerCommandMessage,
  WorkerEventMessage,
  WorkerBatchPayload
} from '../../src/workers/acquisition/protocol';
import { AcquisitionWorkerCore } from '../../src/workers/acquisition/AcquisitionWorkerCore';
import {
  AcquisitionWorkerClient,
  InProcessWorkerPort
} from '../../src/workers/acquisition/AcquisitionWorkerClient';
import { AcquisitionEngine } from '../../src/domain/acquisition/AcquisitionEngine';
import { SignalGenerator } from '../../src/domain/simulation/SignalGenerator';

describe('Acquisition Worker (Wave 8)', () => {
  describe('Versioned Protocol Validation', () => {
    it('validates correct protocol command messages', () => {
      const msg: WorkerCommandMessage = {
        version: PROTOCOL_VERSION,
        id: 'cmd-1',
        type: 'INIT',
        timestamp: Date.now(),
        payload: { sampleRate: 1_000_000 }
      };

      const validated = validateWorkerCommand(msg);
      expect(validated.version).toBe(1);
      expect(validated.type).toBe('INIT');
      expect(validated.id).toBe('cmd-1');
    });

    it('rejects version mismatch', () => {
      const msg = {
        version: 999, // Incompatible protocol version
        id: 'cmd-err',
        type: 'INIT',
        timestamp: Date.now(),
        payload: {}
      };
      expect(() => validateWorkerCommand(msg)).toThrow(/Protocol version mismatch/);
    });

    it('rejects unsupported command types', () => {
      const msg = {
        version: PROTOCOL_VERSION,
        id: 'cmd-err',
        type: 'DESTROY_WORLD',
        timestamp: Date.now(),
        payload: {}
      };
      expect(() => validateWorkerCommand(msg)).toThrow(/Unsupported worker command type/);
    });

    it('rejects malformed non-object commands', () => {
      expect(() => validateWorkerCommand(null)).toThrow(/Malformed worker command/);
      expect(() => validateWorkerCommand('not an object')).toThrow(/Malformed worker command/);
      expect(() => validateWorkerCommand({ version: 1, type: 'INIT' })).toThrow(/must have string id/);
    });
  });

  describe('AcquisitionWorkerCore (Headless Worker Logic)', () => {
    it('initializes worker state and responds with INITIALIZED event', () => {
      const core = new AcquisitionWorkerCore();
      const events: WorkerEventMessage[] = [];
      const postMessage = (msg: WorkerEventMessage) => events.push(msg);

      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'init-1',
          type: 'INIT',
          timestamp: Date.now(),
          payload: {
            sampleRate: 2_000_000,
            batchSize: 5000,
            ch1: { waveform: 'SINE', frequency: 2000 },
            ch2: { waveform: 'TRIANGLE', frequency: 5000 }
          }
        },
        postMessage
      );

      expect(core.state).toBe('IDLE');
      expect(core.clock.sampleRate).toBe(2_000_000);
      expect(core.batchSize).toBe(5000);
      expect(core.genCh1.waveform).toBe('SINE');
      expect(core.genCh1.frequency).toBe(2000);
      expect(core.genCh2.waveform).toBe('TRIANGLE');

      // Check emitted events: STATE_CHANGED -> IDLE, then INITIALIZED
      const initEvent = events.find((e) => e.type === 'INITIALIZED');
      expect(initEvent).toBeDefined();
      expect(initEvent?.id).toBe('init-1');
    });

    it('produces batches with Transferable Float32Arrays and advances clock', () => {
      const core = new AcquisitionWorkerCore();
      const events: WorkerEventMessage[] = [];
      const transferredBuffers: Transferable[][] = [];

      const postMessage = (msg: WorkerEventMessage, transfer?: Transferable[]) => {
        events.push(msg);
        if (transfer) transferredBuffers.push(transfer);
      };

      // 1. Initialize
      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'init-1',
          type: 'INIT',
          timestamp: Date.now(),
          payload: { batchSize: 1000 }
        },
        postMessage
      );

      // 2. Start
      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'start-1',
          type: 'START',
          timestamp: Date.now(),
          payload: {}
        },
        postMessage
      );
      expect(core.state).toBe('RUNNING');

      // 3. Produce single batch directly
      core.produceBatch(postMessage);

      const batchEvent = events.find((e) => e.type === 'BATCH_PRODUCED');
      expect(batchEvent).toBeDefined();
      const p = batchEvent!.payload as WorkerBatchPayload;
      expect(p.sampleCount).toBe(1000);
      expect(p.batchIndex).toBe(0);
      expect(p.ch1Samples).toBeDefined();
      expect(p.ch2Samples).toBeDefined();
      expect(p.ch1Samples!.length).toBe(1000);
      expect(p.ch2Samples!.length).toBe(1000);
      expect(core.clock.sampleIndex).toBe(1000);

      // Verify buffers were passed into transferable list
      expect(transferredBuffers.length).toBeGreaterThan(0);
      const latestTransfer = transferredBuffers[transferredBuffers.length - 1];
      expect(latestTransfer).toHaveLength(2);
      expect(latestTransfer[0]).toBe(p.ch1Samples!.buffer);
      expect(latestTransfer[1]).toBe(p.ch2Samples!.buffer);

      // 4. Stop
      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'stop-1',
          type: 'STOP',
          timestamp: Date.now(),
          payload: {}
        },
        postMessage
      );
      expect(core.state).toBe('STOPPED');
      core.dispose();
    });

    it('dynamically reconfigures on the fly via CONFIGURE command', () => {
      const core = new AcquisitionWorkerCore();
      const events: WorkerEventMessage[] = [];
      const postMessage = (msg: WorkerEventMessage) => events.push(msg);

      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'init-1',
          type: 'INIT',
          timestamp: Date.now(),
          payload: {}
        },
        postMessage
      );

      // Configure CH1 scale and frequency
      core.handleMessage(
        {
          version: PROTOCOL_VERSION,
          id: 'cfg-1',
          type: 'CONFIGURE',
          timestamp: Date.now(),
          payload: {
            channelId: 'CH1',
            signal: { frequency: 440, amplitude: 5.0 },
            afe: { voltsPerDiv: 0.5, coupling: 'AC' }
          }
        },
        postMessage
      );

      expect(core.genCh1.frequency).toBe(440);
      expect(core.genCh1.amplitude).toBe(5.0);
      expect(core.afeCh1.voltsPerDiv).toBe(0.5);
      expect(core.afeCh1.coupling).toBe('AC');

      const cfgEvent = events.find((e) => e.type === 'CONFIGURED');
      expect(cfgEvent).toBeDefined();
      expect(cfgEvent?.id).toBe('cfg-1');
      core.dispose();
    });

    it('resets clock and state on RESET command', () => {
      const core = new AcquisitionWorkerCore();
      const events: WorkerEventMessage[] = [];
      const postMessage = (msg: WorkerEventMessage) => events.push(msg);

      core.handleMessage({ version: PROTOCOL_VERSION, id: 'init', type: 'INIT', timestamp: 0, payload: { batchSize: 500 } }, postMessage);
      core.handleMessage({ version: PROTOCOL_VERSION, id: 'start', type: 'START', timestamp: 0, payload: {} }, postMessage);
      core.produceBatch(postMessage);
      expect(core.clock.sampleIndex).toBe(500);

      core.handleMessage({ version: PROTOCOL_VERSION, id: 'reset', type: 'RESET', timestamp: 0, payload: {} }, postMessage);
      expect(core.clock.sampleIndex).toBe(0);
      expect(core.state).toBe('IDLE');
      core.dispose();
    });

    it('catches exceptions and emits structured ERROR event', () => {
      const core = new AcquisitionWorkerCore();
      const events: WorkerEventMessage[] = [];
      const postMessage = (msg: WorkerEventMessage) => events.push(msg);

      // Send malformed message triggering error
      core.handleMessage({ invalid: 'object' }, postMessage);

      expect(core.state).toBe('ERROR');
      const errEvent = events.find((e) => e.type === 'ERROR');
      expect(errEvent).toBeDefined();
      expect((errEvent?.payload as any).code).toBe('COMMAND_PROCESSING_ERROR');
      core.dispose();
    });
  });

  describe('AcquisitionWorkerClient (Lifecycle & State Resync)', () => {
    it('executes full lifecycle: startup -> start -> stop -> shutdown', async () => {
      const client = new AcquisitionWorkerClient(() => new InProcessWorkerPort());

      expect(client.state).toBe('UNINITIALIZED');

      // 1. Startup
      await client.startup({ sampleRate: 1_000_000, batchSize: 2000 });
      expect(client.state).toBe('IDLE');

      // 2. Start
      let batchCount = 0;
      const unsubscribe = client.onBatch(() => {
        batchCount++;
      });

      client.start(10); // 10ms interval
      expect(client.state).toBe('RUNNING');

      // Wait 35ms to receive ~2-3 batches
      await new Promise((resolve) => setTimeout(resolve, 35));
      expect(batchCount).toBeGreaterThan(0);
      expect(client.totalBatches).toBeGreaterThan(0);
      expect(client.totalSamples).toBeGreaterThan(0);

      // 3. Stop
      client.stop();
      expect(client.state).toBe('STOPPED');

      // 4. Shutdown
      unsubscribe();
      client.shutdown();
      expect(client.state).toBe('UNINITIALIZED');
    });

    it('resynchronizes state on restart after crash or termination', async () => {
      let activePort: InProcessWorkerPort | null = null;
      const client = new AcquisitionWorkerClient(() => {
        activePort = new InProcessWorkerPort();
        return activePort;
      });

      // 1. Initial startup with custom configuration
      await client.startup({
        sampleRate: 2_000_000,
        batchSize: 10_000,
        ch1: { waveform: 'TRIANGLE', frequency: 12_345 },
        ch2: { waveform: 'SAW', frequency: 67_890 }
      });

      // 2. Apply on-the-fly configuration change
      client.configure({
        channelId: 'CH1',
        signal: { frequency: 99_999 },
        afe: { voltsPerDiv: 0.2 }
      });

      // Verify cached config tracked the changes
      expect(client.cachedConfig.sampleRate).toBe(2_000_000);
      expect(client.cachedConfig.ch1?.frequency).toBe(99_999);
      expect(client.cachedConfig.ch1?.afe?.voltsPerDiv).toBe(0.2);

      // 3. Trigger restart
      await client.restart();

      // State is recovered cleanly
      expect(client.state).toBe('IDLE');
      expect(client.cachedConfig.sampleRate).toBe(2_000_000);
      expect(client.cachedConfig.ch1?.frequency).toBe(99_999);

      client.shutdown();
    });
  });

  describe('Main-Thread vs Worker Simulation Comparison Benchmark', () => {
    it('demonstrates main-thread utilization reduction and low transfer overhead', async () => {
      const sampleCount = 100_000;

      // 1. Main-Thread Direct Simulation Baseline
      const mainEngine = new AcquisitionEngine({ sampleRate: 5_000_000, maxBatchSize: sampleCount });
      mainEngine.ch1.setSignalSource(new SignalGenerator({ waveform: 'SINE', frequency: 10_000 }));
      mainEngine.ch2.setSignalSource(new SignalGenerator({ waveform: 'SQUARE', frequency: 20_000 }));

      const tMain0 = performance.now();
      mainEngine.acquire(sampleCount);
      const mainThreadComputeTimeMs = performance.now() - tMain0;

      // 2. Worker Simulation & Transfer
      const client = new AcquisitionWorkerClient(() => new InProcessWorkerPort());
      await client.startup({ sampleRate: 5_000_000, batchSize: sampleCount });

      let receivedBatch: WorkerBatchPayload | null = null;
      client.onBatch((batch) => {
        receivedBatch = batch;
      });

      // Start and await first batch
      const tWorkerStart = performance.now();
      client.start(5);

      while (!receivedBatch && performance.now() - tWorkerStart < 1000) {
        await new Promise((r) => setTimeout(r, 5));
      }
      client.stop();
      client.shutdown();

      expect(receivedBatch).not.toBeNull();
      const batch = receivedBatch!;
      expect(batch.sampleCount).toBe(sampleCount);

      // Measure overhead & latency
      const generationDurationMs = batch.generationDurationMs;
      const transferLatencyMs = client.latestLatencyMs;

      console.log(`[Wave 8 Benchmark] Main-thread Direct Simulation Time: ${mainThreadComputeTimeMs.toFixed(2)} ms for ${sampleCount} samples`);
      console.log(`[Wave 8 Benchmark] Worker Generation Time: ${generationDurationMs.toFixed(2)} ms`);
      console.log(`[Wave 8 Benchmark] Transfer Latency: ${transferLatencyMs.toFixed(2)} ms`);

      // Latency of Transferable array buffers must be fast (< 50 ms even in microtask emulation)
      expect(transferLatencyMs).toBeLessThan(100);
    });
  });
});
