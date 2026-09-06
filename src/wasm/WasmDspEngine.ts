/**
 * WebAssembly DSP Engine (Wave 11)
 *
 * High-performance C-ABI WASM kernel wrapper for oscilloscope DSP:
 * - Statistical analysis (Vpp, Min, Max, RMS, Mean)
 * - Peak-Detect (Min/Max) display decimation
 * - Zero-allocation fast-path with automatic memory growth
 */

import { getDspWasmBytes } from './dsp_kernel_binary';
import {
  IWasmDspEngine,
  SignalStats,
  WasmDspError,
  WasmDspExports,
  WASM_ERR_INVALID_COUNT,
  WASM_ERR_INVALID_BUCKETS,
  WASM_ERR_OK,
} from './types';

const STATS_OUT_PTR = 0;
const DEFAULT_DECIMATE_OUT_MIN_PTR = 4096;
const DEFAULT_INPUT_PTR = 32768;
const WASM_PAGE_SIZE = 65536;

export class WasmDspEngine implements IWasmDspEngine {
  private _instance: WebAssembly.Instance | null = null;
  private _exports: WasmDspExports | null = null;
  private _memory: WebAssembly.Memory | null = null;

  public get isInitialized(): boolean {
    return this._instance !== null && this._exports !== null && this._memory !== null;
  }

  public get memoryByteSize(): number {
    return this._memory ? this._memory.buffer.byteLength : 0;
  }

  /**
   * Initializes the WebAssembly instance from embedded binary bytecode.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const wasmBytes = getDspWasmBytes();
    const module = await WebAssembly.compile(wasmBytes as unknown as BufferSource);
    const instance = await WebAssembly.instantiate(module, {});

    this._instance = instance;
    this._exports = instance.exports as WasmDspExports;
    this._memory = this._exports.memory;

    this._exports.dsp_init();
  }

  /**
   * Computes min, max, peak-to-peak (Vpp), RMS, and mean statistics for a Float32 sample buffer.
   *
   * @param samples - Raw analog/ADC sample buffer
   * @returns SignalStats containing analytical measurements
   */
  public computeStats(samples: Float32Array): SignalStats {
    this.ensureInitialized();
    const count = samples.length;

    if (count <= 0) {
      throw new WasmDspError(WASM_ERR_INVALID_COUNT, 'Sample count must be greater than zero');
    }

    const inPtr = DEFAULT_INPUT_PTR;
    const requiredBytes = inPtr + count * 4;
    this.ensureMemoryCapacity(requiredBytes);

    // Copy samples into WASM linear memory
    const wasmMemoryBuffer = this._memory!.buffer;
    const inView = new Float32Array(wasmMemoryBuffer, inPtr, count);
    inView.set(samples);

    // Call WASM DSP kernel
    const res = this._exports!.dsp_compute_stats(inPtr, count, STATS_OUT_PTR);
    if (res !== WASM_ERR_OK) {
      throw new WasmDspError(res);
    }

    // Read 28-byte stats struct from STATS_OUT_PTR
    const dataView = new DataView(this._memory!.buffer, STATS_OUT_PTR, 28);
    const min = dataView.getFloat32(0, true);
    const max = dataView.getFloat32(4, true);
    const vpp = dataView.getFloat32(8, true);
    const rms = dataView.getFloat32(12, true);
    const mean = dataView.getFloat32(16, true);
    const sampleCount = dataView.getInt32(20, true);

    return {
      min,
      max,
      vpp,
      rms,
      mean,
      sampleCount,
    };
  }

  /**
   * Peak-Detect (Min/Max) decimation kernel.
   * Compresses inCount samples into bucketCount display buckets, tracking extremes per bucket.
   *
   * @param samples - Source sample buffer
   * @param bucketCount - Number of display buckets (e.g. 500, 1000, 2048)
   * @param outMin - Optional preallocated Float32Array for min values
   * @param outMax - Optional preallocated Float32Array for max values
   * @returns Object containing min and max arrays of size bucketCount
   */
  public peakDetectDecimate(
    samples: Float32Array,
    bucketCount: number,
    outMin?: Float32Array,
    outMax?: Float32Array
  ): { min: Float32Array; max: Float32Array } {
    this.ensureInitialized();
    const inCount = samples.length;

    if (inCount <= 0) {
      throw new WasmDspError(WASM_ERR_INVALID_COUNT, 'Sample count must be greater than zero');
    }
    if (bucketCount <= 0 || bucketCount > inCount) {
      throw new WasmDspError(
        WASM_ERR_INVALID_BUCKETS,
        `Bucket count (${bucketCount}) must be > 0 and <= sample count (${inCount})`
      );
    }

    const minArr = outMin && outMin.length >= bucketCount ? outMin : new Float32Array(bucketCount);
    const maxArr = outMax && outMax.length >= bucketCount ? outMax : new Float32Array(bucketCount);

    const outMinPtr = DEFAULT_DECIMATE_OUT_MIN_PTR;
    const outMaxPtr = outMinPtr + bucketCount * 4;
    const inPtr = Math.max(DEFAULT_INPUT_PTR, outMaxPtr + bucketCount * 4);
    const requiredBytes = inPtr + inCount * 4;

    this.ensureMemoryCapacity(requiredBytes);

    // Copy input samples into WASM memory
    const inView = new Float32Array(this._memory!.buffer, inPtr, inCount);
    inView.set(samples);

    // Execute WASM decimation kernel
    const res = this._exports!.dsp_peak_detect_decimate(
      inPtr,
      inCount,
      outMinPtr,
      outMaxPtr,
      bucketCount
    );

    if (res !== WASM_ERR_OK) {
      throw new WasmDspError(res);
    }

    // Copy decimated output from WASM linear memory
    const wasmOutMin = new Float32Array(this._memory!.buffer, outMinPtr, bucketCount);
    const wasmOutMax = new Float32Array(this._memory!.buffer, outMaxPtr, bucketCount);

    minArr.set(wasmOutMin);
    maxArr.set(wasmOutMax);

    return { min: minArr, max: maxArr };
  }

  /**
   * Ensures linear memory is large enough to contain requiredBytes.
   */
  private ensureMemoryCapacity(requiredBytes: number): void {
    const currentBytes = this._memory!.buffer.byteLength;
    if (requiredBytes > currentBytes) {
      const neededBytes = requiredBytes - currentBytes;
      const pagesToGrow = Math.ceil(neededBytes / WASM_PAGE_SIZE);
      this._memory!.grow(pagesToGrow);
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('WasmDspEngine has not been initialized. Call await init() first.');
    }
  }
}
