(module
  ;; Memory declaration: initial 16 pages (1 MB), maximum 256 pages (16 MB)
  (memory (export "memory") 16 256)

  ;; Constants
  ;; Input buffer offset: 0x8000 = 32768
  ;; Output buffer offset: 0x1000 = 4096

  ;; Exported helper: initialize DSP core
  (func (export "dsp_init") (result i32)
    i32.const 0
  )

  ;; Exported helper: empty no-op for measuring raw JS-to-WASM boundary call overhead
  (func (export "dsp_noop") (result i32)
    i32.const 0
  )

  ;; Exported helper: return default input buffer offset
  (func (export "dsp_get_input_buffer_ptr") (result i32)
    i32.const 32768
  )

  ;; Exported helper: return default output buffer offset
  (func (export "dsp_get_output_buffer_ptr") (result i32)
    i32.const 4096
  )

  ;; =========================================================================
  ;; dsp_compute_stats (Scalar Baseline)
  ;; Computes min, max, peak-to-peak (Vpp), mean, and RMS of Float32 samples.
  ;; Arguments:
  ;;   $in_ptr:  byte offset of input samples array (i32)
  ;;   $count:   number of samples to process (i32)
  ;;   $out_ptr: byte offset where SignalStats struct (28 bytes) is written (i32)
  ;; Returns: 0 on success, or negative error code
  ;; =========================================================================
  (func $dsp_compute_stats (export "dsp_compute_stats")
    (param $in_ptr i32)
    (param $count i32)
    (param $out_ptr i32)
    (result i32)

    (local $i i32)
    (local $addr i32)
    (local $val f32)
    (local $val64 f64)
    (local $min f32)
    (local $max f32)
    (local $sum f64)
    (local $sum_sq f64)
    (local $count64 f64)

    ;; 1. Parameter Validation
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
                (i32.lt_s (local.get $out_ptr) (i32.const 0)))
      (then (return (i32.const -1)))
    )
    (if (i32.le_s (local.get $count) (i32.const 0))
      (then (return (i32.const -2)))
    )

    ;; 2. Initialize min, max, sum, sum_sq from first sample
    (local.set $min (f32.load (local.get $in_ptr)))
    (local.set $max (local.get $min))
    (local.set $val64 (f64.promote_f32 (local.get $min)))
    (local.set $sum (local.get $val64))
    (local.set $sum_sq (f64.mul (local.get $val64) (local.get $val64)))

    ;; 3. Loop over remaining samples (i = 1 .. count - 1)
    (local.set $i (i32.const 1))
    (block $break_loop
      (loop $stat_loop
        (br_if $break_loop (i32.ge_s (local.get $i) (local.get $count)))

        ;; addr = in_ptr + i * 4
        (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $i) (i32.const 2))))
        (local.set $val (f32.load (local.get $addr)))

        ;; min = f32.min(min, val)
        (local.set $min (f32.min (local.get $min) (local.get $val)))
        ;; max = f32.max(max, val)
        (local.set $max (f32.max (local.get $max) (local.get $val)))

        ;; sum += val, sum_sq += val * val
        (local.set $val64 (f64.promote_f32 (local.get $val)))
        (local.set $sum (f64.add (local.get $sum) (local.get $val64)))
        (local.set $sum_sq (f64.add (local.get $sum_sq) (f64.mul (local.get $val64) (local.get $val64))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $stat_loop)
      )
    )

    ;; 4. Compute statistics
    (local.set $count64 (f64.convert_i32_s (local.get $count)))

    ;; Write min (offset 0)
    (f32.store offset=0 (local.get $out_ptr) (local.get $min))
    ;; Write max (offset 4)
    (f32.store offset=4 (local.get $out_ptr) (local.get $max))
    ;; Write vpp = max - min (offset 8)
    (f32.store offset=8 (local.get $out_ptr) (f32.sub (local.get $max) (local.get $min)))
    ;; Write rms = sqrt(sum_sq / count) (offset 12)
    (f32.store offset=12 (local.get $out_ptr)
      (f32.demote_f64 (f64.sqrt (f64.div (local.get $sum_sq) (local.get $count64))))
    )
    ;; Write mean = sum / count (offset 16)
    (f32.store offset=16 (local.get $out_ptr)
      (f32.demote_f64 (f64.div (local.get $sum) (local.get $count64)))
    )
    ;; Write sample_count (offset 20)
    (i32.store offset=20 (local.get $out_ptr) (local.get $count))
    ;; Write error_code 0 (offset 24)
    (i32.store offset=24 (local.get $out_ptr) (i32.const 0))

    i32.const 0
  )

  ;; =========================================================================
  ;; dsp_compute_stats_simd (Wave 13 SIMD Optimization)
  ;; 128-bit Vectorized stats reduction (4 float32 lanes per iteration)
  ;; =========================================================================
  (func (export "dsp_compute_stats_simd")
    (param $in_ptr i32)
    (param $count i32)
    (param $out_ptr i32)
    (result i32)

    (local $vec_count i32)
    (local $i i32)
    (local $addr i32)
    (local $v v128)
    (local $vec_min v128)
    (local $vec_max v128)
    (local $vec_sum v128)
    (local $vec_sum_sq v128)
    (local $min f32)
    (local $max f32)
    (local $sum f64)
    (local $sum_sq f64)
    (local $val f32)
    (local $val64 f64)
    (local $count64 f64)

    ;; 1. Validation
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
                (i32.lt_s (local.get $out_ptr) (i32.const 0)))
      (then (return (i32.const -1)))
    )
    (if (i32.le_s (local.get $count) (i32.const 0))
      (then (return (i32.const -2)))
    )

    ;; If count < 4, fall back to scalar
    (if (i32.lt_s (local.get $count) (i32.const 4))
      (then
        (return (call $dsp_compute_stats (local.get $in_ptr) (local.get $count) (local.get $out_ptr)))
      )
    )

    ;; vec_count = count / 4
    (local.set $vec_count (i32.shr_u (local.get $count) (i32.const 2)))

    ;; Initialize vector accumulators with first 4 samples
    (local.set $v (v128.load (local.get $in_ptr)))
    (local.set $vec_min (local.get $v))
    (local.set $vec_max (local.get $v))
    (local.set $vec_sum (local.get $v))
    (local.set $vec_sum_sq (f32x4.mul (local.get $v) (local.get $v)))

    ;; Main vector loop (i = 1 .. vec_count - 1)
    (local.set $i (i32.const 1))
    (block $break_simd
      (loop $simd_loop
        (br_if $break_simd (i32.ge_s (local.get $i) (local.get $vec_count)))

        ;; addr = in_ptr + i * 16
        (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $i) (i32.const 4))))
        (local.set $v (v128.load (local.get $addr)))

        (local.set $vec_min (f32x4.min (local.get $vec_min) (local.get $v)))
        (local.set $vec_max (f32x4.max (local.get $vec_max) (local.get $v)))
        (local.set $vec_sum (f32x4.add (local.get $vec_sum) (local.get $v)))
        (local.set $vec_sum_sq (f32x4.add (local.get $vec_sum_sq) (f32x4.mul (local.get $v) (local.get $v))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $simd_loop)
      )
    )

    ;; Horizontal reduction across the 4 lanes
    ;; min = min(min(l0, l1), min(l2, l3))
    (local.set $min
      (f32.min
        (f32.min (f32x4.extract_lane 0 (local.get $vec_min)) (f32x4.extract_lane 1 (local.get $vec_min)))
        (f32.min (f32x4.extract_lane 2 (local.get $vec_min)) (f32x4.extract_lane 3 (local.get $vec_min)))
      )
    )
    ;; max = max(max(l0, l1), max(l2, l3))
    (local.set $max
      (f32.max
        (f32.max (f32x4.extract_lane 0 (local.get $vec_max)) (f32x4.extract_lane 1 (local.get $vec_max)))
        (f32.max (f32x4.extract_lane 2 (local.get $vec_max)) (f32x4.extract_lane 3 (local.get $vec_max)))
      )
    )
    ;; sum = l0 + l1 + l2 + l3
    (local.set $sum
      (f64.add
        (f64.add
          (f64.promote_f32 (f32x4.extract_lane 0 (local.get $vec_sum)))
          (f64.promote_f32 (f32x4.extract_lane 1 (local.get $vec_sum)))
        )
        (f64.add
          (f64.promote_f32 (f32x4.extract_lane 2 (local.get $vec_sum)))
          (f64.promote_f32 (f32x4.extract_lane 3 (local.get $vec_sum)))
        )
      )
    )
    ;; sum_sq = l0 + l1 + l2 + l3
    (local.set $sum_sq
      (f64.add
        (f64.add
          (f64.promote_f32 (f32x4.extract_lane 0 (local.get $vec_sum_sq)))
          (f64.promote_f32 (f32x4.extract_lane 1 (local.get $vec_sum_sq)))
        )
        (f64.add
          (f64.promote_f32 (f32x4.extract_lane 2 (local.get $vec_sum_sq)))
          (f64.promote_f32 (f32x4.extract_lane 3 (local.get $vec_sum_sq)))
        )
      )
    )

    ;; Process remaining tail samples (count % 4)
    (local.set $i (i32.shl (local.get $vec_count) (i32.const 2)))
    (block $break_tail
      (loop $tail_loop
        (br_if $break_tail (i32.ge_s (local.get $i) (local.get $count)))

        (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $i) (i32.const 2))))
        (local.set $val (f32.load (local.get $addr)))

        (local.set $min (f32.min (local.get $min) (local.get $val)))
        (local.set $max (f32.max (local.get $max) (local.get $val)))
        (local.set $val64 (f64.promote_f32 (local.get $val)))
        (local.set $sum (f64.add (local.get $sum) (local.get $val64)))
        (local.set $sum_sq (f64.add (local.get $sum_sq) (f64.mul (local.get $val64) (local.get $val64))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $tail_loop)
      )
    )

    ;; Compute & write statistics
    (local.set $count64 (f64.convert_i32_s (local.get $count)))
    (f32.store offset=0 (local.get $out_ptr) (local.get $min))
    (f32.store offset=4 (local.get $out_ptr) (local.get $max))
    (f32.store offset=8 (local.get $out_ptr) (f32.sub (local.get $max) (local.get $min)))
    (f32.store offset=12 (local.get $out_ptr)
      (f32.demote_f64 (f64.sqrt (f64.div (local.get $sum_sq) (local.get $count64))))
    )
    (f32.store offset=16 (local.get $out_ptr)
      (f32.demote_f64 (f64.div (local.get $sum) (local.get $count64)))
    )
    (i32.store offset=20 (local.get $out_ptr) (local.get $count))
    (i32.store offset=24 (local.get $out_ptr) (i32.const 0))

    i32.const 0
  )

  ;; =========================================================================
  ;; dsp_compute_rms_scalar
  ;; Standalone scalar True RMS calculation: sqrt(sum(x^2) / count)
  ;; =========================================================================
  (func (export "dsp_compute_rms_scalar")
    (param $in_ptr i32)
    (param $count i32)
    (result f32)

    (local $i i32)
    (local $addr i32)
    (local $val64 f64)
    (local $sum_sq f64)

    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
                (i32.le_s (local.get $count) (i32.const 0)))
      (then (return (f32.const 0.0)))
    )

    (local.set $sum_sq (f64.const 0.0))
    (local.set $i (i32.const 0))
    (block $break_rms
      (loop $rms_loop
        (br_if $break_rms (i32.ge_s (local.get $i) (local.get $count)))
        (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $i) (i32.const 2))))
        (local.set $val64 (f64.promote_f32 (f32.load (local.get $addr))))
        (local.set $sum_sq (f64.add (local.get $sum_sq) (f64.mul (local.get $val64) (local.get $val64))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $rms_loop)
      )
    )

    (f32.demote_f64
      (f64.sqrt
        (f64.div (local.get $sum_sq) (f64.convert_i32_s (local.get $count)))
      )
    )
  )

  ;; =========================================================================
  ;; dsp_peak_detect_decimate
  ;; Peak-Detect (Min/Max) decimation kernel for oscilloscope display rendering.
  ;; =========================================================================
  (func (export "dsp_peak_detect_decimate")
    (param $in_ptr i32)
    (param $in_count i32)
    (param $out_min_ptr i32)
    (param $out_max_ptr i32)
    (param $bucket_count i32)
    (result i32)

    (local $b i32)
    (local $step f64)
    (local $start_idx i32)
    (local $end_idx i32)
    (local $b_min f32)
    (local $b_max f32)
    (local $i i32)
    (local $val f32)
    (local $addr i32)

    ;; 1. Validation
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
        (i32.or (i32.lt_s (local.get $out_min_ptr) (i32.const 0))
                (i32.lt_s (local.get $out_max_ptr) (i32.const 0))))
      (then (return (i32.const -1)))
    )
    (if (i32.le_s (local.get $in_count) (i32.const 0))
      (then (return (i32.const -2)))
    )
    (if (i32.or (i32.le_s (local.get $bucket_count) (i32.const 0))
                (i32.gt_s (local.get $bucket_count) (local.get $in_count)))
      (then (return (i32.const -4)))
    )

    ;; step = in_count / bucket_count
    (local.set $step
      (f64.div (f64.convert_i32_s (local.get $in_count))
               (f64.convert_i32_s (local.get $bucket_count)))
    )

    ;; 2. Outer loop over buckets (b = 0 .. bucket_count - 1)
    (local.set $b (i32.const 0))
    (block $break_buckets
      (loop $bucket_loop
        (br_if $break_buckets (i32.ge_s (local.get $b) (local.get $bucket_count)))

        ;; start_idx = (int)(b * step)
        (local.set $start_idx
          (i32.trunc_f64_s
            (f64.mul (f64.convert_i32_s (local.get $b)) (local.get $step)))
        )
        ;; end_idx = (int)((b + 1) * step)
        (local.set $end_idx
          (i32.trunc_f64_s
            (f64.mul (f64.convert_i32_s (i32.add (local.get $b) (i32.const 1))) (local.get $step)))
        )

        ;; Clamp end_idx <= in_count
        (if (i32.gt_s (local.get $end_idx) (local.get $in_count))
          (then (local.set $end_idx (local.get $in_count)))
        )
        ;; Ensure at least 1 sample per bucket
        (if (i32.le_s (local.get $end_idx) (local.get $start_idx))
          (then (local.set $end_idx (i32.add (local.get $start_idx) (i32.const 1))))
        )

        ;; Initialize bucket min/max with first sample in bucket
        (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $start_idx) (i32.const 2))))
        (local.set $b_min (f32.load (local.get $addr)))
        (local.set $b_max (local.get $b_min))

        ;; Inner loop over samples in bucket (i = start_idx + 1 .. end_idx - 1)
        (local.set $i (i32.add (local.get $start_idx) (i32.const 1)))
        (block $break_samples
          (loop $sample_loop
            (br_if $break_samples (i32.ge_s (local.get $i) (local.get $end_idx)))

            (local.set $addr (i32.add (local.get $in_ptr) (i32.shl (local.get $i) (i32.const 2))))
            (local.set $val (f32.load (local.get $addr)))

            (local.set $b_min (f32.min (local.get $b_min) (local.get $val)))
            (local.set $b_max (f32.max (local.get $b_max) (local.get $val)))

            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $sample_loop)
          )
        )

        ;; Store results: out_min[b] = b_min, out_max[b] = b_max
        (f32.store
          (i32.add (local.get $out_min_ptr) (i32.shl (local.get $b) (i32.const 2)))
          (local.get $b_min)
        )
        (f32.store
          (i32.add (local.get $out_max_ptr) (i32.shl (local.get $b) (i32.const 2)))
          (local.get $b_max)
        )

        (local.set $b (i32.add (local.get $b) (i32.const 1)))
        (br $bucket_loop)
      )
    )

    i32.const 0
  )

  ;; =========================================================================
  ;; dsp_fir_filter (Wave 13)
  ;; Direct Convolution FIR filter: y[n] = sum_{k=0}^{taps-1} b[k] * x[n - k]
  ;; Arguments:
  ;;   $in_ptr:    offset of input Float32Array
  ;;   $out_ptr:   offset of output Float32Array
  ;;   $count:     number of samples
  ;;   $coeff_ptr: offset of filter tap coefficients (Float32Array)
  ;;   $taps:      number of filter taps
  ;; Returns: 0 on success, or negative error code
  ;; =========================================================================
  (func (export "dsp_fir_filter")
    (param $in_ptr i32)
    (param $out_ptr i32)
    (param $count i32)
    (param $coeff_ptr i32)
    (param $taps i32)
    (result i32)

    (local $n i32)
    (local $k i32)
    (local $idx i32)
    (local $acc f32)
    (local $c f32)
    (local $x f32)

    ;; Validation
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
        (i32.or (i32.lt_s (local.get $out_ptr) (i32.const 0))
                (i32.le_s (local.get $coeff_ptr) (i32.const 0))))
      (then (return (i32.const -1)))
    )
    (if (i32.or (i32.le_s (local.get $count) (i32.const 0))
                (i32.le_s (local.get $taps) (i32.const 0)))
      (then (return (i32.const -2)))
    )

    ;; Loop over output samples n = 0 .. count - 1
    (local.set $n (i32.const 0))
    (block $break_n
      (loop $loop_n
        (br_if $break_n (i32.ge_s (local.get $n) (local.get $count)))

        (local.set $acc (f32.const 0.0))

        ;; Inner loop over taps k = 0 .. taps - 1
        (local.set $k (i32.const 0))
        (block $break_k
          (loop $loop_k
            (br_if $break_k (i32.ge_s (local.get $k) (local.get $taps)))

            (local.set $idx (i32.sub (local.get $n) (local.get $k)))
            (if (i32.ge_s (local.get $idx) (i32.const 0))
              (then
                (local.set $c (f32.load (i32.add (local.get $coeff_ptr) (i32.shl (local.get $k) (i32.const 2)))))
                (local.set $x (f32.load (i32.add (local.get $in_ptr) (i32.shl (local.get $idx) (i32.const 2)))))
                (local.set $acc (f32.add (local.get $acc) (f32.mul (local.get $c) (local.get $x))))
              )
            )

            (local.set $k (i32.add (local.get $k) (i32.const 1)))
            (br $loop_k)
          )
        )

        ;; out[n] = acc
        (f32.store (i32.add (local.get $out_ptr) (i32.shl (local.get $n) (i32.const 2))) (local.get $acc))

        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (br $loop_n)
      )
    )

    i32.const 0
  )

  ;; =========================================================================
  ;; dsp_iir_biquad (Wave 13)
  ;; Direct Form II Transposed Second-Order Section
  ;; Arguments:
  ;;   $in_ptr:    offset of input Float32Array
  ;;   $out_ptr:   offset of output Float32Array
  ;;   $count:     number of samples
  ;;   $b0, b1, b2, a1, a2: normalized biquad filter coefficients (f32)
  ;;   $state_ptr: offset where [d1, d2] (8 bytes) are read and written back
  ;; Returns: 0 on success, or negative error code
  ;; =========================================================================
  (func (export "dsp_iir_biquad")
    (param $in_ptr i32)
    (param $out_ptr i32)
    (param $count i32)
    (param $b0 f32)
    (param $b1 f32)
    (param $b2 f32)
    (param $a1 f32)
    (param $a2 f32)
    (param $state_ptr i32)
    (result i32)

    (local $n i32)
    (local $x f32)
    (local $y f32)
    (local $d1 f32)
    (local $d2 f32)

    ;; Validation
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
        (i32.or (i32.lt_s (local.get $out_ptr) (i32.const 0))
                (i32.lt_s (local.get $state_ptr) (i32.const 0))))
      (then (return (i32.const -1)))
    )
    (if (i32.le_s (local.get $count) (i32.const 0))
      (then (return (i32.const -2)))
    )

    ;; Load initial delay states d1, d2
    (local.set $d1 (f32.load offset=0 (local.get $state_ptr)))
    (local.set $d2 (f32.load offset=4 (local.get $state_ptr)))

    ;; Loop over samples
    (local.set $n (i32.const 0))
    (block $break_iir
      (loop $loop_iir
        (br_if $break_iir (i32.ge_s (local.get $n) (local.get $count)))

        ;; x = in[n]
        (local.set $x (f32.load (i32.add (local.get $in_ptr) (i32.shl (local.get $n) (i32.const 2)))))

        ;; y = b0 * x + d1
        (local.set $y (f32.add (f32.mul (local.get $b0) (local.get $x)) (local.get $d1)))

        ;; d1 = b1 * x - a1 * y + d2
        (local.set $d1
          (f32.add
            (f32.sub (f32.mul (local.get $b1) (local.get $x)) (f32.mul (local.get $a1) (local.get $y)))
            (local.get $d2)
          )
        )

        ;; d2 = b2 * x - a2 * y
        (local.set $d2
          (f32.sub (f32.mul (local.get $b2) (local.get $x)) (f32.mul (local.get $a2) (local.get $y)))
        )

        ;; out[n] = y
        (f32.store (i32.add (local.get $out_ptr) (i32.shl (local.get $n) (i32.const 2))) (local.get $y))

        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (br $loop_iir)
      )
    )

    ;; Store updated delay states back
    (f32.store offset=0 (local.get $state_ptr) (local.get $d1))
    (f32.store offset=4 (local.get $state_ptr) (local.get $d2))

    i32.const 0
  )
)
