/**
 * DSP Kernel Reference Specification (C-ABI)
 *
 * Mathematical reference implementation for high-frequency signal processing
 * in the digital twin oscilloscope. Complies with freestanding WebAssembly C-ABI.
 */

#include <stdint.h>
#include <math.h>

#define ERR_OK               0
#define ERR_NULL_POINTER    -1
#define ERR_INVALID_COUNT   -2
#define ERR_OUT_OF_BOUNDS   -3
#define ERR_INVALID_BUCKETS -4

#define MEMORY_INPUT_OFFSET   0x8000 // 32,768 bytes offset
#define MEMORY_OUTPUT_OFFSET  0x1000 // 4,096 bytes offset
#define MAX_SAMPLES_CAPACITY  250000

// Output structure for statistical parameters (offset 0..31 bytes)
typedef struct {
    float min_val;
    float max_val;
    float vpp;
    float rms;
    float mean;
    int32_t sample_count;
    int32_t error_code;
} SignalStats;

/**
 * Initializes DSP core state.
 */
int32_t dsp_init(void) {
    return ERR_OK;
}

/**
 * Returns fixed input buffer byte offset in linear memory.
 */
int32_t dsp_get_input_buffer_ptr(void) {
    return MEMORY_INPUT_OFFSET;
}

/**
 * Returns fixed output buffer byte offset in linear memory.
 */
int32_t dsp_get_output_buffer_ptr(void) {
    return MEMORY_OUTPUT_OFFSET;
}

/**
 * Computes min, max, peak-to-peak (Vpp), and RMS for an array of Float32 samples.
 *
 * @param in_ptr   Byte offset of input Float32Array in linear memory
 * @param count    Number of samples to process
 * @param out_ptr  Byte offset where SignalStats struct (28 bytes) will be written
 * @returns 0 on success, or negative error code
 */
int32_t dsp_compute_stats(int32_t in_ptr, int32_t count, int32_t out_ptr) {
    if (in_ptr <= 0 || out_ptr < 0) {
        return ERR_NULL_POINTER;
    }
    if (count <= 0 || count > MAX_SAMPLES_CAPACITY) {
        return ERR_INVALID_COUNT;
    }

    const float* const samples = (const float*)(uintptr_t)in_ptr;
    SignalStats* const stats = (SignalStats*)(uintptr_t)out_ptr;

    float min_val = samples[0];
    float max_val = samples[0];
    double sum = 0.0;
    double sum_sq = 0.0;

    for (int32_t i = 0; i < count; i++) {
        const float val = samples[i];
        if (val < min_val) min_val = val;
        if (val > max_val) max_val = val;
        sum += val;
        sum_sq += (double)val * (double)val;
    }

    const float mean = (float)(sum / count);
    const float rms = (float)sqrt(sum_sq / count);

    stats->min_val = min_val;
    stats->max_val = max_val;
    stats->vpp = max_val - min_val;
    stats->rms = rms;
    stats->mean = mean;
    stats->sample_count = count;
    stats->error_code = ERR_OK;

    return ERR_OK;
}

/**
 * Peak-detect decimation kernel (Min/Max Decimation).
 * Splits input sample stream into bucket_count bins, finding min and max in each bin.
 * Essential for oscilloscope waveform display without aliasing high-frequency spikes.
 *
 * @param in_ptr       Byte offset of input Float32Array
 * @param in_count     Number of input samples
 * @param out_min_ptr  Byte offset of output Float32Array for minimums (size >= bucket_count)
 * @param out_max_ptr  Byte offset of output Float32Array for maximums (size >= bucket_count)
 * @param bucket_count Number of display buckets (e.g. 600 or 1024)
 * @returns 0 on success, or negative error code
 */
int32_t dsp_peak_detect_decimate(
    int32_t in_ptr,
    int32_t in_count,
    int32_t out_min_ptr,
    int32_t out_max_ptr,
    int32_t bucket_count
) {
    if (in_ptr <= 0 || out_min_ptr < 0 || out_max_ptr < 0) {
        return ERR_NULL_POINTER;
    }
    if (in_count <= 0 || in_count > MAX_SAMPLES_CAPACITY) {
        return ERR_INVALID_COUNT;
    }
    if (bucket_count <= 0 || bucket_count > in_count) {
        return ERR_INVALID_BUCKETS;
    }

    const float* const samples = (const float*)(uintptr_t)in_ptr;
    float* const out_min = (float*)(uintptr_t)out_min_ptr;
    float* const out_max = (float*)(uintptr_t)out_max_ptr;

    const double samples_per_bucket = (double)in_count / (double)bucket_count;

    for (int32_t b = 0; b < bucket_count; b++) {
        const int32_t start_idx = (int32_t)(b * samples_per_bucket);
        int32_t end_idx = (int32_t)((b + 1) * samples_per_bucket);
        if (end_idx > in_count) end_idx = in_count;
        if (start_idx >= end_idx) {
            out_min[b] = samples[start_idx];
            out_max[b] = samples[start_idx];
            continue;
        }

        float b_min = samples[start_idx];
        float b_max = samples[start_idx];

        for (int32_t i = start_idx + 1; i < end_idx; i++) {
            const float val = samples[i];
            if (val < b_min) b_min = val;
            if (val > b_max) b_max = val;
        }

        out_min[b] = b_min;
        out_max[b] = b_max;
    }

    return ERR_OK;
}
