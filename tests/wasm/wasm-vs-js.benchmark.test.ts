import { describe, it, expect, beforeAll } from 'vitest';
import { WasmDspEngine } from '../../src/wasm/WasmDspEngine';
import { JsDspEngine } from '../../src/wasm/JsDspEngine';

describe('WebAssembly vs. JavaScript DSP Performance Benchmark (Wave 13)', () => {
  let wasmEngine: WasmDspEngine;
  let jsEngine: JsDspEngine;

  beforeAll(async () => {
    wasmEngine = new WasmDspEngine();
    await wasmEngine.init();
    jsEngine = new JsDspEngine();
  });

  it('measures JS-to-WASM call boundary overhead (dsp_noop)', () => {
    const iterations = 500_000;

    // Warm-up
    for (let i = 0; i < 50_000; i++) {
      jsEngine.callNoop();
      wasmEngine.callNoop();
    }

    // Benchmark Pure JS noop call
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.callNoop();
    }
    const jsTotalMs = performance.now() - jsStart;
    const jsNsPerCall = (jsTotalMs / iterations) * 1_000_000;

    // Benchmark WASM noop call
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.callNoop();
    }
    const wasmTotalMs = performance.now() - wasmStart;
    const wasmNsPerCall = (wasmTotalMs / iterations) * 1_000_000;

    console.log('\n===============================================================');
    console.log('BENCHMARK 1: JS-to-WASM Call Boundary Overhead (500,000 calls)');
    console.log('===============================================================');
    console.log(`Pure JS Function Call: ${jsNsPerCall.toFixed(2)} ns/call`);
    console.log(`WASM Exported Call:    ${wasmNsPerCall.toFixed(2)} ns/call`);
    console.log(`Boundary Cost Delta:   ${(wasmNsPerCall - jsNsPerCall).toFixed(2)} ns/call`);

    expect(wasmNsPerCall).toBeLessThan(100.0); // Sub-100ns call boundary
  });

  it('benchmarks statistical reduction across buffer sizes (JS vs Scalar WASM vs 128-bit SIMD)', () => {
    const bufferSizes = [64, 1_000, 10_000, 100_000, 500_000];

    console.log('\n========================================================================================================');
    console.log('BENCHMARK 2: Multi-Size Statistics Reduction (Vpp, Min, Max, RMS, Mean)');
    console.log('Comparing: Pure JS vs WASM Scalar vs WASM 128-bit SIMD vs In-Place SIMD (Zero-Copy)');
    console.log('========================================================================================================');
    console.log('| Buffer Size (N) | Pure JS (ms) | WASM Scalar | WASM SIMD | Raw SIMD (no-copy) | SIMD vs JS Speedup |');
    console.log('|-----------------|--------------|-------------|-----------|--------------------|-------------------|');

    for (const N of bufferSizes) {
      const samples = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        samples[i] = Math.sin(i * 0.01) * 3.0 + Math.cos(i * 0.05) * 1.5;
      }

      const iterations = N <= 1000 ? 5000 : N <= 10000 ? 1000 : 200;

      // Warmup
      for (let i = 0; i < 20; i++) {
        jsEngine.computeStats(samples);
        wasmEngine.computeStats(samples, false);
        wasmEngine.computeStats(samples, true);
      }

      // 1. Pure JS
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        jsEngine.computeStats(samples);
      }
      const jsMs = (performance.now() - jsStart) / iterations;

      // 2. WASM Scalar (with memory copy)
      const wasmScalarStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        wasmEngine.computeStats(samples, false);
      }
      const wasmScalarMs = (performance.now() - wasmScalarStart) / iterations;

      // 3. WASM SIMD (with memory copy)
      const wasmSimdStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        wasmEngine.computeStats(samples, true);
      }
      const wasmSimdMs = (performance.now() - wasmSimdStart) / iterations;

      // 4. Raw In-Place WASM SIMD (Zero memory copy, representing SharedArrayBuffer/direct pipeline)
      const inPtr = 32768;
      // Pre-populate memory once
      new Float32Array((wasmEngine as any)._memory.buffer, inPtr, N).set(samples);
      const rawSimdStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        wasmEngine.computeStatsRaw(inPtr, N, true);
      }
      const rawSimdMs = (performance.now() - rawSimdStart) / iterations;

      const simdSpeedup = jsMs / wasmSimdMs;

      console.log(
        `| ${N.toString().padEnd(15)} | ${jsMs.toFixed(4).padEnd(12)} | ${wasmScalarMs.toFixed(4).padEnd(11)} | ${wasmSimdMs.toFixed(4).padEnd(9)} | ${rawSimdMs.toFixed(4).padEnd(18)} | ${simdSpeedup.toFixed(2).padEnd(17)}x |`
      );

      // Verify numerical equivalence
      const jsRes = jsEngine.computeStats(samples);
      const simdRes = wasmEngine.computeStats(samples, true);
      expect(simdRes.min).toBeCloseTo(jsRes.min, 3);
      expect(simdRes.max).toBeCloseTo(jsRes.max, 3);
      expect(simdRes.rms).toBeCloseTo(jsRes.rms, 3);
    }
  });

  it('benchmarks dedicated True RMS kernel (JS vs WASM Scalar)', () => {
    const N = 100_000;
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = Math.sin(i * 0.02) * 2.0;
    }
    const iterations = 200;

    // Warm-up
    for (let i = 0; i < 20; i++) {
      jsEngine.computeRms(samples);
      wasmEngine.computeRms(samples);
    }

    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.computeRms(samples);
    }
    const jsMs = (performance.now() - jsStart) / iterations;

    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.computeRms(samples);
    }
    const wasmMs = (performance.now() - wasmStart) / iterations;

    console.log('\n===============================================================');
    console.log('BENCHMARK 3: Dedicated True RMS Kernel (100k samples, 200 iters)');
    console.log('===============================================================');
    console.log(`Pure JS RMS:   ${jsMs.toFixed(3)} ms/call | Throughput: ${((N * 1000) / (jsMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`WASM RMS:      ${wasmMs.toFixed(3)} ms/call | Throughput: ${((N * 1000) / (wasmMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`Speedup:       ${(jsMs / wasmMs).toFixed(2)}x`);

    expect(wasmMs).toBeLessThan(5.0);
  });

  it('benchmarks Peak-Detect Decimation (JS vs WASM across 100k and 500k)', () => {
    const configs = [
      { inCount: 100_000, bucketCount: 1_000, iterations: 200 },
      { inCount: 500_000, bucketCount: 2_000, iterations: 50 },
    ];

    console.log('\n===============================================================');
    console.log('BENCHMARK 4: Peak-Detect Decimation (Waveform Compression)');
    console.log('===============================================================');

    for (const cfg of configs) {
      const samples = new Float32Array(cfg.inCount);
      for (let i = 0; i < cfg.inCount; i++) {
        samples[i] = Math.sin(i * 0.01) * 4.0;
      }
      const outMin = new Float32Array(cfg.bucketCount);
      const outMax = new Float32Array(cfg.bucketCount);

      // Warmup
      for (let i = 0; i < 10; i++) {
        jsEngine.peakDetectDecimate(samples, cfg.bucketCount, outMin, outMax);
        wasmEngine.peakDetectDecimate(samples, cfg.bucketCount, outMin, outMax);
      }

      const jsStart = performance.now();
      for (let i = 0; i < cfg.iterations; i++) {
        jsEngine.peakDetectDecimate(samples, cfg.bucketCount, outMin, outMax);
      }
      const jsMs = (performance.now() - jsStart) / cfg.iterations;

      const wasmStart = performance.now();
      for (let i = 0; i < cfg.iterations; i++) {
        wasmEngine.peakDetectDecimate(samples, cfg.bucketCount, outMin, outMax);
      }
      const wasmMs = (performance.now() - wasmStart) / cfg.iterations;

      const jsThroughput = ((cfg.inCount * 1000) / (jsMs * 1e6));
      const wasmThroughput = ((cfg.inCount * 1000) / (wasmMs * 1e6));

      console.log(`\nConfig: ${cfg.inCount} samples -> ${cfg.bucketCount} buckets (${cfg.iterations} iters):`);
      console.log(`  Pure JS: ${jsMs.toFixed(3)} ms/call (${jsThroughput.toFixed(1)} MSPS)`);
      console.log(`  WASM:    ${wasmMs.toFixed(3)} ms/call (${wasmThroughput.toFixed(1)} MSPS)`);
      console.log(`  Speedup: ${(jsMs / wasmMs).toFixed(2)}x`);

      expect(wasmMs).toBeLessThan(10.0);
    }
  });

  it('benchmarks FIR Filtering: Direct Convolution (JS vs WASM)', () => {
    const sampleCount = 50_000;
    const taps = 32;
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = Math.sin(i * 0.05) * 2.0;
    }
    const coeffs = new Float32Array(taps).fill(1.0 / taps);
    const outBuffer = new Float32Array(sampleCount);
    const iterations = 50;

    // Warm-up
    for (let i = 0; i < 5; i++) {
      jsEngine.filterFir(samples, coeffs, outBuffer);
      wasmEngine.filterFir(samples, coeffs, outBuffer);
    }

    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.filterFir(samples, coeffs, outBuffer);
    }
    const jsMs = (performance.now() - jsStart) / iterations;

    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.filterFir(samples, coeffs, outBuffer);
    }
    const wasmMs = (performance.now() - wasmStart) / iterations;

    console.log('\n===============================================================');
    console.log(`BENCHMARK 5: FIR Direct Convolution (${sampleCount} samples, ${taps} taps, ${iterations} iters)`);
    console.log('===============================================================');
    console.log(`Pure JS FIR: ${jsMs.toFixed(3)} ms/call | Throughput: ${((sampleCount * 1000) / (jsMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`WASM FIR:    ${wasmMs.toFixed(3)} ms/call | Throughput: ${((sampleCount * 1000) / (wasmMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`Speedup (WASM vs JS): ${(jsMs / wasmMs).toFixed(2)}x`);

    expect(wasmMs).toBeLessThan(30.0);
  });

  it('benchmarks IIR Biquad Filtering: Direct Form II Transposed (JS vs WASM)', () => {
    const sampleCount = 100_000;
    const biquadCoeffs = {
      b0: 0.06745527,
      b1: 0.13491054,
      b2: 0.06745527,
      a1: -1.1429805,
      a2: 0.4128016,
    };
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = Math.sin(i * 0.01) * 3.0;
    }
    const outBuffer = new Float32Array(sampleCount);
    const iterations = 100;

    // Warm-up
    for (let i = 0; i < 10; i++) {
      jsEngine.filterIirBiquad(samples, biquadCoeffs, outBuffer);
      wasmEngine.filterIirBiquad(samples, biquadCoeffs, outBuffer);
    }

    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.filterIirBiquad(samples, biquadCoeffs, outBuffer);
    }
    const jsMs = (performance.now() - jsStart) / iterations;

    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.filterIirBiquad(samples, biquadCoeffs, outBuffer);
    }
    const wasmMs = (performance.now() - wasmStart) / iterations;

    console.log('\n===============================================================');
    console.log(`BENCHMARK 6: IIR Biquad Filter (${sampleCount} samples, ${iterations} iters)`);
    console.log('===============================================================');
    console.log(`Pure JS IIR: ${jsMs.toFixed(3)} ms/call | Throughput: ${((sampleCount * 1000) / (jsMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`WASM IIR:    ${wasmMs.toFixed(3)} ms/call | Throughput: ${((sampleCount * 1000) / (wasmMs * 1e6)).toFixed(1)} MSPS`);
    console.log(`Speedup (WASM vs JS): ${(jsMs / wasmMs).toFixed(2)}x`);

    expect(wasmMs).toBeLessThan(15.0);
  });
});
