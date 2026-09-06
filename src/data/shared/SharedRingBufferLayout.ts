/**
 * SharedRingBufferLayout
 *
 * Binary memory layout definition for the lock-free Single Producer Single Consumer
 * (SPSC) ring buffer implemented on top of a SharedArrayBuffer.
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ HEADER & CONTROL BLOCK (128 bytes = 32 x Int32 words)       │
 * │ [0]  MAGIC: 0x53414231 ("SAB1")                             │
 * │ [1]  VERSION: 1                                             │
 * │ [2]  CAPACITY: Power of 2 (e.g. 65,536)                     │
 * │ [3]  SAMPLE_RATE: e.g. 1,000,000                            │
 * │ [4]  WRITE_INDEX: Monotonic unsigned 32-bit sample pointer  │
 * │ [5]  READ_INDEX: Monotonic unsigned 32-bit sample pointer   │
 * │ [6]  SEQUENCE: Incremented on each committed batch          │
 * │ [7]  STATE: 0=IDLE, 1=RUNNING, 2=STOPPED, 3=ERROR           │
 * │ [8]  OVERFLOW_COUNT: Samples overwritten before being read   │
 * │ [9]  UNDERRUN_COUNT: Reader starvation events count         │
 * │ [10] FLAGS: Bit 0 = CH1 clipped, Bit 1 = CH2 clipped        │
 * │ [11] PRODUCED_TS_LOW: Lower 32 bits of performance.now()   │
 * │ [12] PRODUCED_TS_HIGH: Upper 32 bits (integer ms)          │
 * │ [13] BATCH_INDEX: Index of latest committed batch           │
 * │ [14..31] RESERVED / PADDING up to 128 bytes                 │
 * ├─────────────────────────────────────────────────────────────┤
 * │ CH1 DATA BUFFER (capacity * 4 bytes)                        │
 * │ Float32Array[0 .. capacity - 1]                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │ CH2 DATA BUFFER (capacity * 4 bytes)                        │
 * │ Float32Array[0 .. capacity - 1]                             │
 * └─────────────────────────────────────────────────────────────┘
 */

export const SAB_MAGIC = 0x53414231; // ASCII "SAB1"
export const SAB_VERSION = 1;

export const HEADER_BYTES = 128;
export const HEADER_WORDS = HEADER_BYTES / 4; // 32 Int32 words

// Int32 Word Indices in Header
export const IDX_MAGIC = 0;
export const IDX_VERSION = 1;
export const IDX_CAPACITY = 2;
export const IDX_SAMPLE_RATE = 3;
export const IDX_WRITE_INDEX = 4;
export const IDX_READ_INDEX = 5;
export const IDX_SEQUENCE = 6;
export const IDX_STATE = 7;
export const IDX_OVERFLOW_COUNT = 8;
export const IDX_UNDERRUN_COUNT = 9;
export const IDX_FLAGS = 10;
export const IDX_PRODUCED_TS_LOW = 11;
export const IDX_PRODUCED_TS_HIGH = 12;
export const IDX_BATCH_INDEX = 13;

// Flag bitmasks
export const FLAG_CH1_CLIPPED = 1 << 0;
export const FLAG_CH2_CLIPPED = 1 << 1;

// State codes
export const STATE_IDLE = 0;
export const STATE_RUNNING = 1;
export const STATE_STOPPED = 2;
export const STATE_ERROR = 3;

export class SharedRingBufferLayout {
  /**
   * Calculates the total size in bytes required for a buffer of the given capacity.
   */
  public static calculateTotalBytes(capacity: number): number {
    this.assertPowerOfTwo(capacity);
    return HEADER_BYTES + 2 * capacity * Float32Array.BYTES_PER_ELEMENT;
  }

  /**
   * Byte offset for CH1 sample array.
   */
  public static getCh1Offset(): number {
    return HEADER_BYTES;
  }

  /**
   * Byte offset for CH2 sample array.
   */
  public static getCh2Offset(capacity: number): number {
    this.assertPowerOfTwo(capacity);
    return HEADER_BYTES + capacity * Float32Array.BYTES_PER_ELEMENT;
  }

  /**
   * Allocates and initializes a new SharedArrayBuffer with the specified capacity and sample rate.
   */
  public static createBuffer(capacity: number = 65_536, sampleRate: number = 1_000_000): SharedArrayBuffer {
    this.assertPowerOfTwo(capacity);
    const totalBytes = this.calculateTotalBytes(capacity);
    const sab = new SharedArrayBuffer(totalBytes);
    const ctrl = new Int32Array(sab, 0, HEADER_WORDS);

    // Initialize Header with Atomics
    Atomics.store(ctrl, IDX_MAGIC, SAB_MAGIC);
    Atomics.store(ctrl, IDX_VERSION, SAB_VERSION);
    Atomics.store(ctrl, IDX_CAPACITY, capacity);
    Atomics.store(ctrl, IDX_SAMPLE_RATE, sampleRate);
    Atomics.store(ctrl, IDX_WRITE_INDEX, 0);
    Atomics.store(ctrl, IDX_READ_INDEX, 0);
    Atomics.store(ctrl, IDX_SEQUENCE, 0);
    Atomics.store(ctrl, IDX_STATE, STATE_IDLE);
    Atomics.store(ctrl, IDX_OVERFLOW_COUNT, 0);
    Atomics.store(ctrl, IDX_UNDERRUN_COUNT, 0);
    Atomics.store(ctrl, IDX_FLAGS, 0);
    Atomics.store(ctrl, IDX_PRODUCED_TS_LOW, 0);
    Atomics.store(ctrl, IDX_PRODUCED_TS_HIGH, 0);
    Atomics.store(ctrl, IDX_BATCH_INDEX, 0);

    return sab;
  }

  /**
   * Validates header structure of an existing SharedArrayBuffer.
   */
  public static validateBuffer(sab: SharedArrayBuffer): { capacity: number; sampleRate: number } {
    if (sab.byteLength < HEADER_BYTES) {
      throw new Error(`SharedArrayBuffer is too small: ${sab.byteLength} bytes < minimum header ${HEADER_BYTES} bytes`);
    }

    const ctrl = new Int32Array(sab, 0, HEADER_WORDS);
    const magic = Atomics.load(ctrl, IDX_MAGIC);
    if (magic !== SAB_MAGIC) {
      throw new Error(`Invalid SharedArrayBuffer magic: 0x${magic.toString(16)} != 0x${SAB_MAGIC.toString(16)}`);
    }

    const version = Atomics.load(ctrl, IDX_VERSION);
    if (version !== SAB_VERSION) {
      throw new Error(`SharedArrayBuffer version mismatch: got ${version}, expected ${SAB_VERSION}`);
    }

    const capacity = Atomics.load(ctrl, IDX_CAPACITY);
    this.assertPowerOfTwo(capacity);

    const expectedTotal = this.calculateTotalBytes(capacity);
    if (sab.byteLength < expectedTotal) {
      throw new Error(
        `SharedArrayBuffer size mismatch: ${sab.byteLength} bytes < expected ${expectedTotal} bytes for capacity ${capacity}`
      );
    }

    const sampleRate = Atomics.load(ctrl, IDX_SAMPLE_RATE);
    return { capacity, sampleRate };
  }

  private static assertPowerOfTwo(capacity: number): void {
    if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
      throw new Error(`Ring buffer capacity must be a positive power of two, got ${capacity}`);
    }
  }
}
