import {
  SharedRingBufferLayout,
  HEADER_WORDS,
  IDX_WRITE_INDEX,
  IDX_READ_INDEX,
  IDX_SEQUENCE,
  IDX_OVERFLOW_COUNT,
  IDX_UNDERRUN_COUNT,
  IDX_FLAGS,
  IDX_PRODUCED_TS_LOW,
  IDX_PRODUCED_TS_HIGH,
  FLAG_CH1_CLIPPED,
  FLAG_CH2_CLIPPED
} from './SharedRingBufferLayout';
import { SharedRingBufferStats } from './types';

/**
 * SharedRingBufferConsumer (Reader / Main Thread / DSP Side)
 *
 * Reads dual-channel samples from the SharedArrayBuffer using non-blocking
 * Load-Acquire Atomics semantics.
 *
 * IMPORTANT: Strictly avoids Atomics.wait() to comply with browser main-thread restrictions.
 */
export class SharedRingBufferConsumer {
  private readonly _buffer: SharedArrayBuffer;
  private readonly _ctrl: Int32Array;
  private readonly _ch1Data: Float32Array;
  private readonly _ch2Data: Float32Array;
  private readonly _capacity: number;
  private readonly _mask: number;

  constructor(buffer: SharedArrayBuffer) {
    const { capacity } = SharedRingBufferLayout.validateBuffer(buffer);
    this._buffer = buffer;
    this._capacity = capacity;
    this._mask = capacity - 1;

    this._ctrl = new Int32Array(buffer, 0, HEADER_WORDS);
    this._ch1Data = new Float32Array(buffer, SharedRingBufferLayout.getCh1Offset(), capacity);
    this._ch2Data = new Float32Array(buffer, SharedRingBufferLayout.getCh2Offset(capacity), capacity);
  }

  public get capacity(): number {
    return this._capacity;
  }

  public get buffer(): SharedArrayBuffer {
    return this._buffer;
  }

  /**
   * Reads available unread samples into the supplied output arrays and advances the read pointer.
   *
   * Zero heap allocations.
   *
   * @returns Number of samples actually read.
   */
  public readAvailable(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    maxCount?: number
  ): number {
    // 1. Load-Acquire: read latest write index published by producer
    const writeIndex = Atomics.load(this._ctrl, IDX_WRITE_INDEX);
    const readIndex = Atomics.load(this._ctrl, IDX_READ_INDEX);

    const available = (writeIndex - readIndex) >>> 0;
    if (available === 0) {
      return 0;
    }

    const limit = maxCount !== undefined ? Math.min(available, maxCount) : available;
    const countToRead = Math.min(limit, ch1Out.length, ch2Out.length);

    // 2. Read samples from ring buffer memory
    for (let i = 0; i < countToRead; i++) {
      const slot = (readIndex + i) & this._mask;
      ch1Out[i] = this._ch1Data[slot];
      ch2Out[i] = this._ch2Data[slot];
    }

    // 3. Commit new read pointer
    Atomics.store(this._ctrl, IDX_READ_INDEX, (readIndex + countToRead) | 0);

    return countToRead;
  }

  /**
   * Non-destructively reads the latest `count` samples up to the current write head.
   * Does NOT advance the read pointer. Tailored for oscilloscope screen decimation.
   *
   * Zero heap allocations.
   *
   * @returns Number of samples populated into output buffers.
   */
  public peekLatest(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    count: number
  ): number {
    if (count <= 0) return 0;

    // Load latest write index
    const writeIndex = Atomics.load(this._ctrl, IDX_WRITE_INDEX);
    const readIndex = Atomics.load(this._ctrl, IDX_READ_INDEX);

    const totalAvailable = (writeIndex - readIndex) >>> 0;
    // We can at most peek what was written up to capacity
    const effectiveAvailable = Math.min(totalAvailable, this._capacity);
    const actualCount = Math.min(count, effectiveAvailable, ch1Out.length, ch2Out.length);

    if (actualCount <= 0) {
      return 0;
    }

    const start = writeIndex - actualCount;
    for (let i = 0; i < actualCount; i++) {
      const slot = (start + i) & this._mask;
      ch1Out[i] = this._ch1Data[slot];
      ch2Out[i] = this._ch2Data[slot];
    }

    return actualCount;
  }

  /**
   * Resets read pointer to match write pointer (discards backlog).
   */
  public flush(): void {
    const writeIndex = Atomics.load(this._ctrl, IDX_WRITE_INDEX);
    Atomics.store(this._ctrl, IDX_READ_INDEX, writeIndex);
  }

  /**
   * Snapshot of current buffer telemetry and statistics.
   */
  public getStats(): SharedRingBufferStats {
    const writeIndex = Atomics.load(this._ctrl, IDX_WRITE_INDEX);
    const readIndex = Atomics.load(this._ctrl, IDX_READ_INDEX);
    const sequence = Atomics.load(this._ctrl, IDX_SEQUENCE);
    const overflowCount = Atomics.load(this._ctrl, IDX_OVERFLOW_COUNT);
    const underrunCount = Atomics.load(this._ctrl, IDX_UNDERRUN_COUNT);
    const flags = Atomics.load(this._ctrl, IDX_FLAGS);
    const tsLow = Atomics.load(this._ctrl, IDX_PRODUCED_TS_LOW) >>> 0;
    const tsHigh = Atomics.load(this._ctrl, IDX_PRODUCED_TS_HIGH);

    const available = (writeIndex - readIndex) >>> 0;
    const freeSpace = this._capacity - available;

    return {
      writeIndex,
      readIndex,
      sequence,
      available,
      freeSpace,
      capacity: this._capacity,
      overflowCount,
      underrunCount,
      ch1Clipped: (flags & FLAG_CH1_CLIPPED) !== 0,
      ch2Clipped: (flags & FLAG_CH2_CLIPPED) !== 0,
      producedTimestamp: tsHigh * 0x100000000 + tsLow
    };
  }
}
