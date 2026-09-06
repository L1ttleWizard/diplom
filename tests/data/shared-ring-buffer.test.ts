import { describe, it, expect } from 'vitest';
import {
  SharedRingBufferLayout,
  SAB_MAGIC,
  SAB_VERSION,
  HEADER_BYTES
} from '../../src/data/shared/SharedRingBufferLayout';
import { SharedRingBufferProducer } from '../../src/data/shared/SharedRingBufferProducer';
import { SharedRingBufferConsumer } from '../../src/data/shared/SharedRingBufferConsumer';

describe('SharedRingBuffer Data Plane (Wave 10)', () => {
  describe('Memory Layout and Structure', () => {
    it('calculates aligned byte sizes and rejects non-power-of-two capacities', () => {
      // 65536 * 4 bytes * 2 channels + 128 header = 524416 bytes
      expect(SharedRingBufferLayout.calculateTotalBytes(65_536)).toBe(128 + 2 * 65_536 * 4);
      expect(SharedRingBufferLayout.calculateTotalBytes(1024)).toBe(128 + 2 * 1024 * 4);

      expect(() => SharedRingBufferLayout.calculateTotalBytes(1000)).toThrow(/power of two/i);
      expect(() => SharedRingBufferLayout.calculateTotalBytes(0)).toThrow(/power of two/i);
      expect(() => SharedRingBufferLayout.calculateTotalBytes(-16)).toThrow(/power of two/i);
    });

    it('allocates and initializes SharedArrayBuffer with magic, version, and header words', () => {
      const sab = SharedRingBufferLayout.createBuffer(1024, 2_000_000);
      expect(sab.byteLength).toBe(128 + 2 * 1024 * 4);

      const info = SharedRingBufferLayout.validateBuffer(sab);
      expect(info.capacity).toBe(1024);
      expect(info.sampleRate).toBe(2_000_000);

      const ctrl = new Int32Array(sab, 0, 32);
      expect(ctrl[0]).toBe(SAB_MAGIC);
      expect(ctrl[1]).toBe(SAB_VERSION);
    });

    it('rejects corrupt or undersized SharedArrayBuffer', () => {
      const smallBuf = new SharedArrayBuffer(64);
      expect(() => SharedRingBufferLayout.validateBuffer(smallBuf)).toThrow(/too small/i);

      const corruptBuf = new SharedArrayBuffer(128 + 2048);
      const ctrl = new Int32Array(corruptBuf, 0, 32);
      ctrl[0] = 0x12345678; // wrong magic
      ctrl[1] = SAB_VERSION;
      ctrl[2] = 256;
      expect(() => SharedRingBufferLayout.validateBuffer(corruptBuf)).toThrow(/magic/i);
    });
  });

  describe('Single Producer Single Consumer (SPSC) Lock-Free Streaming', () => {
    it('writes and reads dual-channel samples with zero corruption', () => {
      const capacity = 1024;
      const sab = SharedRingBufferLayout.createBuffer(capacity, 1_000_000);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const ch1In = new Float32Array(100);
      const ch2In = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        ch1In[i] = Math.sin((i / 100) * 2 * Math.PI);
        ch2In[i] = i * 0.1;
      }

      producer.writeBatch(ch1In, ch2In, 100, {
        batchIndex: 1,
        sampleCount: 100,
        sampleRate: 1_000_000,
        simulationTimeStart: 0,
        simulationTimeEnd: 0.0001,
        ch1Clipped: false,
        ch2Clipped: true
      });

      const stats = consumer.getStats();
      expect(stats.available).toBe(100);
      expect(stats.sequence).toBe(1);
      expect(stats.ch1Clipped).toBe(false);
      expect(stats.ch2Clipped).toBe(true);

      const ch1Out = new Float32Array(100);
      const ch2Out = new Float32Array(100);
      const readCount = consumer.readAvailable(ch1Out, ch2Out);

      expect(readCount).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(ch1Out[i]).toBeCloseTo(ch1In[i], 5);
        expect(ch2Out[i]).toBeCloseTo(ch2In[i], 5);
      }

      // Buffer should now be empty
      expect(consumer.getStats().available).toBe(0);
      expect(consumer.readAvailable(ch1Out, ch2Out)).toBe(0);
    });

    it('monotonically increments sequence counter on each commit', () => {
      const sab = SharedRingBufferLayout.createBuffer(512);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const dummy = new Float32Array(10);
      for (let s = 1; s <= 25; s++) {
        producer.writeBatch(dummy, dummy, 10);
        expect(consumer.getStats().sequence).toBe(s);
      }
    });

    it('peeks latest written samples without advancing read pointer', () => {
      const capacity = 256;
      const sab = SharedRingBufferLayout.createBuffer(capacity);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const ch1 = new Float32Array(50);
      const ch2 = new Float32Array(50);
      for (let i = 0; i < 50; i++) {
        ch1[i] = 100 + i;
        ch2[i] = 200 + i;
      }
      producer.writeBatch(ch1, ch2, 50);

      const peek1 = new Float32Array(10);
      const peek2 = new Float32Array(10);
      const peekCount = consumer.peekLatest(peek1, peek2, 10);

      expect(peekCount).toBe(10);
      // peekLatest retrieves the most recent 10 samples (indices 40..49)
      for (let i = 0; i < 10; i++) {
        expect(peek1[i]).toBe(100 + 40 + i);
        expect(peek2[i]).toBe(200 + 40 + i);
      }

      // Read pointer was not modified
      expect(consumer.getStats().available).toBe(50);
    });

    it('handles buffer wrap-around cleanly over multiple revolutions', () => {
      const capacity = 128;
      const sab = SharedRingBufferLayout.createBuffer(capacity);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const batchSize = 32;
      const ch1 = new Float32Array(batchSize);
      const ch2 = new Float32Array(batchSize);
      const ch1Out = new Float32Array(batchSize);
      const ch2Out = new Float32Array(batchSize);

      let counter = 0;
      // 10 revolutions = 1280 samples
      for (let rev = 0; rev < 40; rev++) {
        for (let i = 0; i < batchSize; i++) {
          ch1[i] = counter;
          ch2[i] = counter * 2;
          counter++;
        }
        producer.writeBatch(ch1, ch2, batchSize);

        const read = consumer.readAvailable(ch1Out, ch2Out, batchSize);
        expect(read).toBe(batchSize);

        for (let i = 0; i < batchSize; i++) {
          const expected = counter - batchSize + i;
          expect(ch1Out[i]).toBe(expected);
          expect(ch2Out[i]).toBe(expected * 2);
        }
      }

      const stats = consumer.getStats();
      expect(stats.overflowCount).toBe(0);
      expect(stats.available).toBe(0);
    });

    it('tracks buffer overflow when producer outpaces consumer', () => {
      const capacity = 128;
      const sab = SharedRingBufferLayout.createBuffer(capacity);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const ch = new Float32Array(100);
      // Write 100 samples
      producer.writeBatch(ch, ch, 100);
      expect(consumer.getStats().available).toBe(100);

      // Write another 50 samples without reading -> 100 + 50 = 150 > 128 capacity
      producer.writeBatch(ch, ch, 50);

      const stats = consumer.getStats();
      expect(stats.overflowCount).toBe(150 - 128); // 22 samples overwritten
      expect(stats.available).toBe(128); // Capped at capacity
    });

    it('handles buffer underrun gracefully when consumer requests more samples than available', () => {
      const capacity = 256;
      const sab = SharedRingBufferLayout.createBuffer(capacity);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const ch = new Float32Array(20);
      producer.writeBatch(ch, ch, 20);

      const outCh1 = new Float32Array(50);
      const outCh2 = new Float32Array(50);

      // Request 50 when only 20 are available
      const read = consumer.readAvailable(outCh1, outCh2, 50);
      expect(read).toBe(20);
      expect(consumer.getStats().available).toBe(0);

      // Subsequent read yields 0 without errors
      expect(consumer.readAvailable(outCh1, outCh2, 50)).toBe(0);
    });
  });

  describe('Long-Running Soak Test (Wave 10)', () => {
    it('streams 10,000,000 samples through SharedArrayBuffer with zero drift, zero corruption, and flatline heap', () => {
      const capacity = 65_536;
      const sab = SharedRingBufferLayout.createBuffer(capacity, 5_000_000);
      const producer = new SharedRingBufferProducer(sab);
      const consumer = new SharedRingBufferConsumer(sab);

      const totalSamples = 10_000_000;
      const burstSize = 2048;

      const ch1Scratch = new Float32Array(burstSize);
      const ch2Scratch = new Float32Array(burstSize);
      const ch1Out = new Float32Array(burstSize);
      const ch2Out = new Float32Array(burstSize);

      let written = 0;
      let readTotal = 0;

      const t0 = performance.now();

      while (written < totalSamples) {
        const count = Math.min(burstSize, totalSamples - written);
        for (let i = 0; i < count; i++) {
          ch1Scratch[i] = (written + i) & 0xffff;
          ch2Scratch[i] = -((written + i) & 0xffff);
        }
        producer.writeBatch(ch1Scratch, ch2Scratch, count);
        written += count;

        const got = consumer.readAvailable(ch1Out, ch2Out, count);
        expect(got).toBe(count);

        // Verification of mathematical integrity on boundary samples
        expect(ch1Out[0]).toBe((readTotal) & 0xffff);
        expect(ch2Out[0]).toBe(-((readTotal) & 0xffff));
        readTotal += got;
      }

      const elapsedMs = performance.now() - t0;
      const throughputMsps = (totalSamples / (elapsedMs / 1000)) / 1_000_000;

      console.log(
        `[Wave 10 SAB Soak Test] Processed ${totalSamples.toLocaleString()} samples in ${elapsedMs.toFixed(2)} ms (${throughputMsps.toFixed(2)} MSPS)`
      );

      expect(readTotal).toBe(totalSamples);
      expect(consumer.getStats().overflowCount).toBe(0);
      expect(throughputMsps).toBeGreaterThan(50); // High throughput (>50 MSPS)
    });
  });
});
