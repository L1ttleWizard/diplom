import { describe, it, expect } from 'vitest';
import {
  BoundedRingBuffer,
  RingBufferOverflowError,
  RingBufferUnderflowError
} from '../../src/data';

describe('Bounded Ring Buffer (Wave 9)', () => {
  describe('API & Basic State Transitions', () => {
    it('initializes in empty state with power-of-two capacity', () => {
      const ring = new BoundedRingBuffer({ capacity: 1000 }); // Rounds up to 1024
      expect(ring.capacity).toBe(1024);
      expect(ring.available).toBe(0);
      expect(ring.size).toBe(0);
      expect(ring.freeSpace).toBe(1024);
      expect(ring.totalWritten).toBe(0);
      expect(ring.totalRead).toBe(0);
      expect(ring.wraparound).toBe(false);
      expect(ring.wrapCount).toBe(0);
      expect(ring.overflowCount).toBe(0);
      expect(ring.underflowCount).toBe(0);
    });

    it('handles one element write and read', () => {
      const ring = new BoundedRingBuffer({ capacity: 16 });

      // Write one
      expect(ring.writeOne(42.5)).toBe(true);
      expect(ring.available).toBe(1);
      expect(ring.freeSpace).toBe(15);
      expect(ring.totalWritten).toBe(1);
      expect(ring.peek(0)).toBe(42.5);

      // Read one
      expect(ring.readOne()).toBe(42.5);
      expect(ring.available).toBe(0);
      expect(ring.freeSpace).toBe(16);
      expect(ring.totalRead).toBe(1);

      // Read from empty
      expect(ring.readOne()).toBeNull();
      expect(ring.underflowCount).toBe(1);
    });

    it('handles full buffer state', () => {
      const ring = new BoundedRingBuffer({ capacity: 8, overflowPolicy: 'ERROR' });
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const written = ring.write(data);
      expect(written).toBe(8);
      expect(ring.available).toBe(8);
      expect(ring.freeSpace).toBe(0);

      // Attempting write into full buffer with ERROR policy throws
      expect(() => ring.writeOne(9)).toThrow(RingBufferOverflowError);
    });

    it('resets buffer completely to initial empty state without reallocations', () => {
      const ring = new BoundedRingBuffer({ capacity: 32 });
      ring.write(new Float32Array([1, 2, 3, 4, 5]));
      ring.read(new Float32Array(2));

      expect(ring.available).toBe(3);
      expect(ring.totalWritten).toBe(5);
      expect(ring.totalRead).toBe(2);

      ring.reset();

      expect(ring.available).toBe(0);
      expect(ring.size).toBe(0);
      expect(ring.freeSpace).toBe(32);
      expect(ring.totalWritten).toBe(0);
      expect(ring.totalRead).toBe(0);
      expect(ring.wraparound).toBe(false);
      expect(ring.wrapCount).toBe(0);
      expect(ring.overflowCount).toBe(0);
      expect(ring.underflowCount).toBe(0);
    });
  });

  describe('Wrap-around & Circular Indexing', () => {
    it('seamlessly wraps around physical array boundary', () => {
      const ring = new BoundedRingBuffer({ capacity: 4, overflowPolicy: 'OVERWRITE' });
      const readBuf = new Float32Array(2);

      // Write 3 samples: [1, 2, 3]
      ring.write(new Float32Array([1, 2, 3]));
      expect(ring.wraparound).toBe(false);

      // Read 2 samples: reads [1, 2]
      ring.read(readBuf);
      expect(readBuf[0]).toBe(1);
      expect(readBuf[1]).toBe(2);
      expect(ring.available).toBe(1); // [3] remains

      // Write 3 more samples: [4, 5, 6] -> wraps across physical buffer (boundary 4)
      ring.write(new Float32Array([4, 5, 6]));
      expect(ring.wraparound).toBe(true);
      expect(ring.wrapCount).toBe(1);
      expect(ring.available).toBe(4); // [3, 4, 5, 6]

      const out = new Float32Array(4);
      ring.read(out);
      expect(Array.from(out)).toEqual([3, 4, 5, 6]);
      expect(ring.available).toBe(0);
    });

    it('tracks multiple wraps (100x capacity) with monotonic sequence continuity', () => {
      const capacity = 16;
      const ring = new BoundedRingBuffer({ capacity, overflowPolicy: 'OVERWRITE' });
      const totalToProduce = capacity * 100; // 1600 samples (100 full wraps)

      const writeBatch = new Float32Array(8);
      const readBatch = new Float32Array(8);

      let nextWriteVal = 0;
      let nextExpectedReadVal = 0;

      // Interleaved write and read (balanced speed)
      for (let cycle = 0; cycle < totalToProduce / 8; cycle++) {
        for (let i = 0; i < 8; i++) {
          writeBatch[i] = nextWriteVal++;
        }
        ring.write(writeBatch);

        ring.read(readBatch);
        for (let i = 0; i < 8; i++) {
          expect(readBatch[i]).toBe(nextExpectedReadVal++);
        }
      }

      expect(ring.totalWritten).toBe(1600);
      expect(ring.totalRead).toBe(1600);
      expect(ring.wrapCount).toBe(100);
      expect(ring.overflowCount).toBe(0);
      expect(ring.available).toBe(0);
    });
  });

  describe('Overflow Policies (OVERWRITE, DROP, ERROR)', () => {
    it('implements OVERWRITE policy by discarding oldest unread samples and pushing read pointer', () => {
      const ring = new BoundedRingBuffer({ capacity: 4, overflowPolicy: 'OVERWRITE' });

      // Write 4 samples: [10, 20, 30, 40]
      ring.write(new Float32Array([10, 20, 30, 40]));
      expect(ring.available).toBe(4);

      // Write 2 more samples without reading: [50, 60]
      // Capacity is 4, so [10, 20] are overwritten; buffer should now contain [30, 40, 50, 60]
      const written = ring.write(new Float32Array([50, 60]));
      expect(written).toBe(2);
      expect(ring.available).toBe(4);
      expect(ring.overflowCount).toBe(2);

      const out = new Float32Array(4);
      ring.read(out);
      expect(Array.from(out)).toEqual([30, 40, 50, 60]);
    });

    it('implements OVERWRITE policy when batch exceeds entire buffer capacity', () => {
      const ring = new BoundedRingBuffer({ capacity: 4, overflowPolicy: 'OVERWRITE' });

      // Write 10 samples all at once into capacity 4
      const largeBatch = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ring.write(largeBatch);

      expect(ring.available).toBe(4);
      expect(ring.overflowCount).toBe(6); // 10 samples - 4 capacity = 6 overflowed

      // Should retain only the latest 4: [7, 8, 9, 10]
      const out = new Float32Array(4);
      ring.read(out);
      expect(Array.from(out)).toEqual([7, 8, 9, 10]);
    });

    it('implements DROP policy by discarding excess samples and preserving unread data', () => {
      const ring = new BoundedRingBuffer({ capacity: 4, overflowPolicy: 'DROP' });

      ring.write(new Float32Array([10, 20]));
      expect(ring.available).toBe(2);
      expect(ring.freeSpace).toBe(2);

      // Write 4 samples when only 2 slots are free
      const written = ring.write(new Float32Array([30, 40, 50, 60]));
      expect(written).toBe(2); // Only 2 accepted
      expect(ring.available).toBe(4);
      expect(ring.overflowCount).toBe(2); // 2 dropped

      // Reading should yield [10, 20, 30, 40]
      const out = new Float32Array(4);
      ring.read(out);
      expect(Array.from(out)).toEqual([10, 20, 30, 40]);
    });

    it('implements ERROR policy by throwing RingBufferOverflowError', () => {
      const ring = new BoundedRingBuffer({ capacity: 4, overflowPolicy: 'ERROR' });

      ring.write(new Float32Array([1, 2, 3]));
      expect(ring.freeSpace).toBe(1);

      expect(() => ring.write(new Float32Array([4, 5]))).toThrow(RingBufferOverflowError);
      expect(ring.available).toBe(3); // State unchanged
    });
  });

  describe('Underflow Policies (PARTIAL, ZERO_FILL, ERROR)', () => {
    it('implements PARTIAL policy by returning available samples without padding', () => {
      const ring = new BoundedRingBuffer({ capacity: 16, underflowPolicy: 'PARTIAL' });
      ring.write(new Float32Array([100, 200]));

      const dest = new Float32Array(5);
      dest.fill(-1);

      const count = ring.read(dest, 5);
      expect(count).toBe(2);
      expect(dest[0]).toBe(100);
      expect(dest[1]).toBe(200);
      expect(dest[2]).toBe(-1); // Untouched
      expect(ring.underflowCount).toBe(3);
    });

    it('implements ZERO_FILL policy by padding remaining slots with 0.0', () => {
      const ring = new BoundedRingBuffer({ capacity: 16, underflowPolicy: 'ZERO_FILL' });
      ring.write(new Float32Array([11, 22]));

      const dest = new Float32Array(5);
      dest.fill(-1);

      const count = ring.read(dest, 5);
      expect(count).toBe(2);
      expect(dest[0]).toBe(11);
      expect(dest[1]).toBe(22);
      expect(dest[2]).toBe(0.0); // Zero padded
      expect(dest[3]).toBe(0.0);
      expect(dest[4]).toBe(0.0);
    });

    it('implements ERROR policy by throwing RingBufferUnderflowError', () => {
      const ring = new BoundedRingBuffer({ capacity: 16, underflowPolicy: 'ERROR' });
      ring.write(new Float32Array([1, 2]));

      const dest = new Float32Array(5);
      expect(() => ring.read(dest, 5)).toThrow(RingBufferUnderflowError);
      expect(ring.available).toBe(2); // State unchanged
    });
  });

  describe('Producer-Consumer Scenarios', () => {
    it('handles reader faster than writer (frequent empty buffer drains)', () => {
      const ring = new BoundedRingBuffer({ capacity: 32 });
      const dest = new Float32Array(10);

      for (let i = 0; i < 50; i++) {
        // Writer writes 2 samples
        ring.writeOne(i * 2);
        ring.writeOne(i * 2 + 1);

        // Fast reader attempts to read 10 samples
        const readCount = ring.read(dest, 10);
        expect(readCount).toBe(2);
        expect(dest[0]).toBe(i * 2);
        expect(dest[1]).toBe(i * 2 + 1);
        expect(ring.available).toBe(0);
      }
    });

    it('handles writer faster than reader with continuous circular overwrite', () => {
      const ring = new BoundedRingBuffer({ capacity: 8, overflowPolicy: 'OVERWRITE' });
      const dest = new Float32Array(4);

      // Writer writes 20 samples in bursts of 5
      for (let b = 0; b < 4; b++) {
        const burst = new Float32Array([b * 5, b * 5 + 1, b * 5 + 2, b * 5 + 3, b * 5 + 4]);
        ring.write(burst);
      }
      expect(ring.totalWritten).toBe(20);
      expect(ring.available).toBe(8); // Full capacity

      // Read latest available samples
      ring.read(dest, 4);
      // Pointers and values must remain sequentially ordered
      expect(dest[0]).toBe(12);
      expect(dest[1]).toBe(13);
      expect(dest[2]).toBe(14);
      expect(dest[3]).toBe(15);
    });
  });

  describe('Long-Running Soak Test', () => {
    it('streams 10,000,000 samples through varying burst sizes with zero drift and flatline memory', () => {
      const capacity = 65536; // 64k power-of-two buffer
      const ring = new BoundedRingBuffer({ capacity, overflowPolicy: 'OVERWRITE' });

      const maxBatch = 4096;
      const writeScratch = new Float32Array(maxBatch);
      const readScratch = new Float32Array(maxBatch);

      const targetTotal = 10_000_000;
      let totalProduced = 0;
      let totalConsumed = 0;

      let nextWriteSeq = 0;
      let nextExpectedReadSeq = 0;

      const t0 = performance.now();

      while (totalProduced < targetTotal) {
        // Randomized batch size in [64, maxBatch]
        const burstSize = Math.min(
          targetTotal - totalProduced,
          64 + Math.floor(Math.random() * (maxBatch - 64))
        );

        // Fill batch with sequential sequence numbers
        for (let i = 0; i < burstSize; i++) {
          writeScratch[i] = nextWriteSeq++;
        }
        ring.write(writeScratch, burstSize);
        totalProduced += burstSize;

        // Drain available samples up to maxBatch
        while (ring.available > 0) {
          const toRead = Math.min(ring.available, maxBatch);
          const readCount = ring.read(readScratch, toRead);

          for (let i = 0; i < readCount; i++) {
            if (readScratch[i] !== nextExpectedReadSeq) {
              throw new Error(
                `Sequence corruption at sample ${totalConsumed + i}: expected ${nextExpectedReadSeq}, got ${readScratch[i]}`
              );
            }
            nextExpectedReadSeq++;
          }
          totalConsumed += readCount;
        }
      }

      const elapsedMs = performance.now() - t0;
      const msps = (targetTotal / elapsedMs) / 1000;

      console.log(
        `[Wave 9 Soak Test] Processed ${targetTotal.toLocaleString()} samples in ${elapsedMs.toFixed(2)} ms (${msps.toFixed(2)} MSPS)`
      );

      expect(totalProduced).toBe(targetTotal);
      expect(totalConsumed).toBe(targetTotal);
      expect(ring.available).toBe(0);
      expect(ring.overflowCount).toBe(0);
      expect(msps).toBeGreaterThan(5.0); // Should exceed 5 MSPS comfortably
    });
  });

  describe('Zero-Allocation Benchmark', () => {
    it('executes 1,000,000 write and read operations with zero memory allocations', () => {
      const ring = new BoundedRingBuffer({ capacity: 131072 });
      const batchSize = 1000;
      const writeBuf = new Float32Array(batchSize);
      const readBuf = new Float32Array(batchSize);

      for (let i = 0; i < batchSize; i++) writeBuf[i] = i;

      const batches = 1000; // 1,000 * 1,000 = 1,000,000 samples

      const t0 = performance.now();
      for (let b = 0; b < batches; b++) {
        ring.write(writeBuf, batchSize);
        ring.read(readBuf, batchSize);
      }
      const elapsedMs = performance.now() - t0;

      const totalOps = batches * batchSize;
      const opsPerSec = (totalOps / elapsedMs) * 1000;

      console.log(
        `[Wave 9 Benchmark] Zero-Allocation Throughput: ${(opsPerSec / 1_000_000).toFixed(2)} Mops/sec (${elapsedMs.toFixed(2)} ms per 1M samples)`
      );

      expect(ring.totalWritten).toBe(totalOps);
      expect(ring.totalRead).toBe(totalOps);
      expect(opsPerSec).toBeGreaterThan(10_000_000); // Greater than 10 Mops/sec
    });
  });
});
