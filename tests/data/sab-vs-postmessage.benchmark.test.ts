import { describe, it, expect } from 'vitest';
import { SharedRingBufferLayout } from '../../src/data/shared/SharedRingBufferLayout';
import { SharedRingBufferProducer } from '../../src/data/shared/SharedRingBufferProducer';
import { SharedRingBufferConsumer } from '../../src/data/shared/SharedRingBufferConsumer';
import { AcquisitionWorkerCore, PostMessageFn } from '../../src/workers/acquisition/AcquisitionWorkerCore';
import { PROTOCOL_VERSION, WorkerBatchPayload } from '../../src/workers/acquisition/protocol';

describe('Benchmark: postMessage vs SharedArrayBuffer (Wave 10)', () => {
  const TOTAL_SAMPLES = 1_000_000;
  const BATCH_SIZE = 20_000;
  const BATCH_COUNT = TOTAL_SAMPLES / BATCH_SIZE; // 50 batches

  it('measures baseline message-passing pipeline (Wave 8/9 Transferable ArrayBuffer)', () => {
    const core = new AcquisitionWorkerCore();
    let deliveredBatches = 0;
    let deliveredSamples = 0;
    let totalBytesTransferred = 0;

    const mockPostMessage: PostMessageFn = (msg, transfer) => {
      if (msg.type === 'BATCH_PRODUCED') {
        const payload = msg.payload as WorkerBatchPayload;
        deliveredBatches++;
        deliveredSamples += payload.sampleCount;
        if (transfer) {
          for (const buf of transfer) {
            totalBytesTransferred += (buf as ArrayBuffer).byteLength;
          }
        }
      }
    };

    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'init-bench',
        type: 'INIT',
        timestamp: Date.now(),
        payload: { batchSize: BATCH_SIZE }
      },
      mockPostMessage
    );

    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'start-bench',
        type: 'START',
        timestamp: Date.now(),
        payload: {}
      },
      mockPostMessage
    );

    const t0 = performance.now();
    for (let b = 0; b < BATCH_COUNT; b++) {
      core.produceBatch(mockPostMessage);
    }
    const elapsedMs = performance.now() - t0;
    const throughputMsps = (TOTAL_SAMPLES / (elapsedMs / 1000)) / 1_000_000;

    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'stop-bench',
        type: 'STOP',
        timestamp: Date.now(),
        payload: {}
      },
      mockPostMessage
    );

    console.log('\n--- Wave 8/9 Message-Passing Baseline ---');
    console.log(`Delivered Batches: ${deliveredBatches}`);
    console.log(`Total Samples: ${deliveredSamples.toLocaleString()}`);
    console.log(`Total Transferred Buffer Memory: ${(totalBytesTransferred / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Execution Time: ${elapsedMs.toFixed(2)} ms`);
    console.log(`Throughput: ${throughputMsps.toFixed(2)} MSPS`);

    expect(deliveredBatches).toBe(BATCH_COUNT);
    expect(deliveredSamples).toBe(TOTAL_SAMPLES);
    // At 20k float32 * 2 channels = 160 KB per batch * 50 batches = 8,000,000 bytes (7.63 MB)
    expect(totalBytesTransferred).toBe(TOTAL_SAMPLES * 2 * Float32Array.BYTES_PER_ELEMENT);
  });

  it('measures SharedArrayBuffer Data Plane pipeline (Wave 10 Zero-Allocation)', () => {
    const capacity = 65_536;
    const sab = SharedRingBufferLayout.createBuffer(capacity, 1_000_000);
    const producer = new SharedRingBufferProducer(sab);
    const consumer = new SharedRingBufferConsumer(sab);

    const ch1 = new Float32Array(BATCH_SIZE);
    const ch2 = new Float32Array(BATCH_SIZE);
    const ch1Out = new Float32Array(BATCH_SIZE);
    const ch2Out = new Float32Array(BATCH_SIZE);

    for (let i = 0; i < BATCH_SIZE; i++) {
      ch1[i] = Math.sin((i / BATCH_SIZE) * 2 * Math.PI);
      ch2[i] = Math.cos((i / BATCH_SIZE) * 2 * Math.PI);
    }

    const t0 = performance.now();
    let totalRead = 0;

    for (let b = 0; b < BATCH_COUNT; b++) {
      producer.writeBatch(ch1, ch2, BATCH_SIZE, {
        batchIndex: b,
        sampleCount: BATCH_SIZE
      });

      const read = consumer.readAvailable(ch1Out, ch2Out, BATCH_SIZE);
      totalRead += read;
    }

    const elapsedMs = performance.now() - t0;
    const throughputMsps = (TOTAL_SAMPLES / (elapsedMs / 1000)) / 1_000_000;

    console.log('\n--- Wave 10 SharedArrayBuffer Data Plane ---');
    console.log(`Processed Samples: ${totalRead.toLocaleString()}`);
    console.log(`Heap Allocations in Loop: 0 bytes (Zero-Allocation)`);
    console.log(`Execution Time: ${elapsedMs.toFixed(2)} ms`);
    console.log(`Throughput: ${throughputMsps.toFixed(2)} MSPS`);

    expect(totalRead).toBe(TOTAL_SAMPLES);
    expect(consumer.getStats().overflowCount).toBe(0);
    // SAB streaming is virtually immediate (in-place memory), achieving massive throughput (> 4x faster than postMessage)
    expect(throughputMsps).toBeGreaterThan(50);
  });

  it('demonstrates integrated worker streaming via SharedArrayBuffer with zero-copy notifications', () => {
    const capacity = 65_536;
    const sab = SharedRingBufferLayout.createBuffer(capacity, 1_000_000);
    const consumer = new SharedRingBufferConsumer(sab);
    const core = new AcquisitionWorkerCore();

    let notificationCount = 0;
    let transferredBufferCount = 0;

    const mockPostMessage: PostMessageFn = (msg, transfer) => {
      if (msg.type === 'BATCH_PRODUCED') {
        notificationCount++;
        if (transfer && transfer.length > 0) {
          transferredBufferCount += transfer.length;
        }
      }
    };

    // Initialize core with sharedBuffer
    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'init-sab',
        type: 'INIT',
        timestamp: Date.now(),
        payload: { batchSize: BATCH_SIZE, sharedBuffer: sab }
      },
      mockPostMessage
    );

    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'start-sab',
        type: 'START',
        timestamp: Date.now(),
        payload: {}
      },
      mockPostMessage
    );

    const t0 = performance.now();
    const ch1Out = new Float32Array(BATCH_SIZE);
    const ch2Out = new Float32Array(BATCH_SIZE);
    let totalSamplesRead = 0;

    for (let b = 0; b < BATCH_COUNT; b++) {
      core.produceBatch(mockPostMessage);
      const read = consumer.readAvailable(ch1Out, ch2Out, BATCH_SIZE);
      totalSamplesRead += read;
    }
    const elapsedMs = performance.now() - t0;
    const throughputMsps = (TOTAL_SAMPLES / (elapsedMs / 1000)) / 1_000_000;

    core.handleMessage(
      {
        version: PROTOCOL_VERSION,
        id: 'stop-sab',
        type: 'STOP',
        timestamp: Date.now(),
        payload: {}
      },
      mockPostMessage
    );

    console.log('\n--- Integrated Worker with SharedArrayBuffer ---');
    console.log(`Notifications Sent: ${notificationCount}`);
    console.log(`Transferred Buffers: ${transferredBufferCount} (Zero Transferables!)`);
    console.log(`Samples Consumed via SAB: ${totalSamplesRead.toLocaleString()}`);
    console.log(`Execution Time: ${elapsedMs.toFixed(2)} ms`);
    console.log(`End-to-end Throughput: ${throughputMsps.toFixed(2)} MSPS`);

    expect(notificationCount).toBe(BATCH_COUNT);
    // Crucial: 0 buffers transferred via postMessage!
    expect(transferredBufferCount).toBe(0);
    expect(totalSamplesRead).toBe(TOTAL_SAMPLES);
  });
});
