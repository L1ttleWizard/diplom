import { BoundedRingBuffer } from './BoundedRingBuffer';
import { RingBufferOptions } from './types';

/**
 * SampleRingBuffer for Data Plane acquisition.
 *
 * Inherits full functionality from BoundedRingBuffer:
 * - Preallocated contiguous Float32Array
 * - Power-of-two capacity with branchless masking
 * - Zero dynamic allocations
 * - Overwrite on overflow (standard DSO circular capture)
 * - Partial on underflow
 */
export class SampleRingBuffer extends BoundedRingBuffer {
  constructor(capacityOrOptions: number | RingBufferOptions = 1_048_576) {
    super(capacityOrOptions);
  }
}
