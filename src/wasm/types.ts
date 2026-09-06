/**
 * WebAssembly DSP Core Types & Interfaces (Wave 11)
 */

export interface SignalStats {
  min: number;
  max: number;
  vpp: number;
  rms: number;
  mean: number;
  sampleCount: number;
}

export const WASM_ERR_OK = 0;
export const WASM_ERR_NULL_POINTER = -1;
export const WASM_ERR_INVALID_COUNT = -2;
export const WASM_ERR_OUT_OF_BOUNDS = -3;
export const WASM_ERR_INVALID_BUCKETS = -4;

export class WasmDspError extends Error {
  public readonly code: number;

  constructor(code: number, message?: string) {
    const detail = message ?? WasmDspError.describeCode(code);
    super(`[WasmDspError ${code}] ${detail}`);
    this.name = 'WasmDspError';
    this.code = code;
  }

  public static describeCode(code: number): string {
    switch (code) {
      case WASM_ERR_NULL_POINTER:
        return 'Null or invalid memory pointer provided to WASM kernel';
      case WASM_ERR_INVALID_COUNT:
        return 'Sample count is non-positive or exceeds maximum linear memory capacity';
      case WASM_ERR_OUT_OF_BOUNDS:
        return 'Linear memory access out of allocated bounds';
      case WASM_ERR_INVALID_BUCKETS:
        return 'Bucket count is non-positive or exceeds input sample count';
      default:
        return `Unknown WASM DSP error (code ${code})`;
    }
  }
}

export interface WasmDspExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  dsp_init(): number;
  dsp_noop(): number;
  dsp_get_input_buffer_ptr(): number;
  dsp_get_output_buffer_ptr(): number;
  dsp_compute_stats(inPtr: number, count: number, outPtr: number): number;
  dsp_compute_stats_simd(inPtr: number, count: number, outPtr: number): number;
  dsp_compute_rms_scalar(inPtr: number, count: number): number;
  dsp_peak_detect_decimate(
    inPtr: number,
    inCount: number,
    outMinPtr: number,
    outMaxPtr: number,
    bucketCount: number
  ): number;
  dsp_fir_filter(
    inPtr: number,
    outPtr: number,
    count: number,
    coeffPtr: number,
    taps: number
  ): number;
  dsp_iir_biquad(
    inPtr: number,
    outPtr: number,
    count: number,
    b0: number,
    b1: number,
    b2: number,
    a1: number,
    a2: number,
    statePtr: number
  ): number;
}

export interface IWasmDspEngine {
  readonly isInitialized: boolean;
  readonly memoryByteSize: number;
  init(): Promise<void>;
  computeStats(samples: Float32Array, useSimd?: boolean): SignalStats;
  computeRms(samples: Float32Array): number;
  peakDetectDecimate(
    samples: Float32Array,
    bucketCount: number,
    outMin?: Float32Array,
    outMax?: Float32Array
  ): { min: Float32Array; max: Float32Array };
  filterFir(samples: Float32Array, coefficients: Float32Array, outBuffer?: Float32Array): Float32Array;
  filterIirBiquad(
    samples: Float32Array,
    coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
    outBuffer?: Float32Array
  ): Float32Array;
  callNoop(): number;
}
