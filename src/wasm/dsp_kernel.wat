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

  ;; Exported helper: return default input buffer offset
  (func (export "dsp_get_input_buffer_ptr") (result i32)
    i32.const 32768
  )

  ;; Exported helper: return default output buffer offset
  (func (export "dsp_get_output_buffer_ptr") (result i32)
    i32.const 4096
  )

  ;; =========================================================================
  ;; dsp_compute_stats
  ;; Computes min, max, peak-to-peak (Vpp), mean, and RMS of Float32 samples.
  ;; Arguments:
  ;;   $in_ptr:  byte offset of input samples array (i32)
  ;;   $count:   number of samples to process (i32)
  ;;   $out_ptr: byte offset where SignalStats struct (28 bytes) is written (i32)
  ;; Returns: 0 on success, or negative error code
  ;; =========================================================================
  (func (export "dsp_compute_stats")
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
    ;; in_ptr <= 0 or out_ptr < 0 -> ERR_NULL_POINTER (-1)
    (if (i32.or (i32.le_s (local.get $in_ptr) (i32.const 0))
                (i32.lt_s (local.get $out_ptr) (i32.const 0)))
      (then (return (i32.const -1)))
    )
    ;; count <= 0 -> ERR_INVALID_COUNT (-2)
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
  ;; dsp_peak_detect_decimate
  ;; Peak-Detect (Min/Max) decimation kernel for oscilloscope display rendering.
  ;; Splits in_count samples into bucket_count bins, finding min and max in each bin.
  ;; Arguments:
  ;;   $in_ptr:       byte offset of input Float32Array
  ;;   $in_count:     number of input samples
  ;;   $out_min_ptr:  byte offset of output Float32Array for min values
  ;;   $out_max_ptr:  byte offset of output Float32Array for max values
  ;;   $bucket_count: number of output buckets (display horizontal resolution)
  ;; Returns: 0 on success, or negative error code
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
)
