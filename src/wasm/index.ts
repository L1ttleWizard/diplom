/**
 * WebAssembly Layer (Wave 5+)
 *
 * High-performance C/Rust compiled modules for decimation, FFT,
 * and high-frequency circuit simulation.
 */

export interface IWasmModule {
  readonly isLoaded: boolean;
  init(): Promise<void>;
}
