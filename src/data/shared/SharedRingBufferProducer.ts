import {
  SharedRingBufferLayout,
  HEADER_WORDS,
  IDX_CAPACITY,
  IDX_WRITE_INDEX,
  IDX_READ_INDEX,
  IDX_SEQUENCE,
  IDX_STATE,
  IDX_OVERFLOW_COUNT,
  IDX_UNDERRUN_COUNT,
  IDX_FLAGS,
  IDX_PRODUCED_TS_LOW,
  IDX_PRODUCED_TS_HIGH,
  IDX_BATCH_INDEX,
  FLAG_CH1_CLIPPED,
  FLAG_CH2_CLIPPED,
  STATE_IDLE,
  STATE_RUNNING,
  STATE_STOPPED,
  STATE_ERROR
} from './SharedRingBufferLayout';
import { SharedBatchMetadata, SharedBufferState, SharedRingBufferStats } from './types';

/**
 * SharedRingBufferProducer (Writer / Worker Side)
 *
 * Writes digitized CH1 and CH2 samples directly into a pre-allocated SharedArrayBuffer
 * using SPSC lock-free ring buffer semantics and Atomics memory releases.
 */
export class SharedRingBufferProducer {
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
   * Sets the buffer execution state using atomic store.
   */
  public setState(state: SharedBufferState): void {
    let code = STATE_IDLE;
    switch (state) {
      case 'RUNNING':
        code = STATE_RUNNING;
        break;
      case 'STOPPED':
        code = STATE_STOPPED;
        break;
      case 'ERROR':
        code = STATE_ERROR;
        break;
      default:
        code = STATE_IDLE;
    }
    Atomics.store(this._ctrl, IDX_STATE, code);
  }

  /**
   * Writes a batch of dual-channel samples directly into the shared ring buffer.
   * Employs Store-Release ordering via Atomics to guarantee memory visibility for readers.
   *
   * Zero heap allocations.
   */
  public writeBatch(
    ch1: Float32Array,
    ch2: Float32Array,
    count: number,
    metadata?: Partial<SharedBatchMetadata>
  ): void {
    if (count <= 0) return;

    const currentWrite = Atomics.load(this._ctrl, IDX_WRITE_INDEX);
    const currentRead = Atomics.load(this._ctrl, IDX_READ_INDEX);

    // Check available unread samples before this write
    const currentAvailable = (currentWrite - currentRead) >>> 0;
    if (currentAvailable + count > this._capacity) {
      // Overwrite policy: advance reader pointer and log overflow
      const overflow = currentAvailable + count - this._capacity;
      Atomics.add(this._ctrl, IDX_OVERFLOW_COUNT, overflow);
      Atomics.store(this._ctrl, IDX_READ_INDEX, (currentRead + overflow) | 0);
    }

    // 1. Direct memory write into pre-allocated shared buffer slots
    for (let i = 0; i < count; i++) {
      const slot = (currentWrite + i) & this._mask;
      this._ch1Data[slot] = ch1[i];
      this._ch2Data[slot] = ch2[i];
    }

    // 2. Write metadata and flags
    let flags = 0;
    if (metadata?.ch1Clipped) flags |= FLAG_CH1_CLIPPED;
    if (metadata?.ch2Clipped) flags |= FLAG_CH2_CLIPPED;
    Atomics.store(this._ctrl, IDX_FLAGS, flags);

    if (metadata?.batchIndex !== undefined) {
      Atomics.store(this._ctrl, IDX_BATCH_INDEX, metadata.batchIndex);
    }

    const ts = metadata?.producedTimestamp ?? performance.now();
    Atomics.store(this._ctrl, IDX_PRODUCED_TS_LOW, (ts & 0xffffffff) | 0);
    Atomics.store(this._ctrl, IDX_PRODUCED_TS_HIGH, Math.floor(ts / 0x100000000) | 0);

    // 3. Store-Release Barrier:
    // First increment sequence counter, then publish new write index
    Atomics.add(this._ctrl, IDX_SEQUENCE, 1);
    Atomics.store(this._ctrl, IDX_WRITE_INDEX, (currentWrite + count) | 0);
  }

  /**
   * Resets the buffer write/read indices and sequence counter.
   */
  public reset(): void {
    Atomics.store(this._ctrl, IDX_WRITE_INDEX, 0);
    Atomics.store(this._ctrl, IDX_READ_INDEX, 0);
    Atomics.store(this._ctrl, IDX_SEQUENCE, 0);
    Atomics.store(this._ctrl, IDX_OVERFLOW_COUNT, 0);
    Atomics.store(this._ctrl, IDX_UNDERRUN_COUNT, 0);
    Atomics.store(this._ctrl, IDX_FLAGS, 0);
  }

  /**
   * Snapshot of current ring buffer statistics.
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
