# WebAssembly DSP Core ABI & Architecture

## 1. Назначение и контекст в Data Plane

В соответствии с правилом `GEMINI.md` (п. 9), WebAssembly используется в проекте исключительно для вычислительно-интенсивных операций цифровой обработки сигналов (DSP), где benchmark подтверждает преимущество по сравнению с JIT JavaScript.

```text
ADC / Acquisition Stream (1–5 MSPS)
           │
           ▼
  SharedRingBuffer (SAB)
           │
           ▼
    DSP Subsystem
 ┌────────────────────────────────────────────────┐
 │ WasmDspEngine (TypeScript Wrapper)            │
 │       │                                        │
 │       ▼ C-ABI Boundary (2–5 ns call overhead)  │
 │ WebAssembly Linear Memory [1 MB .. 16 MB]      │
 │ ┌────────────────────────────────────────────┐ │
 │ │ dsp_compute_stats()                        │ │
 │ │ - Min, Max, Vpp, RMS, Mean                 │ │
 │ │                                            │ │
 │ │ dsp_peak_detect_decimate()                 │ │
 │ │ - Min/Max display bins (500-2048 buckets)  │ │
 │ └────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────┘
           │
           ▼
    Display Decimated Buffers
           │
           ▼
    GPU Waveform Buffer (60 FPS)
```

---

## 2. Linear Memory Layout (Карта линейной памяти)

Модуль WebAssembly компилируется с начальным объемом 16 страниц (1 048 576 байт = 1 МБ) и максимальным до 256 страниц (16 МБ). При необходимости `WasmDspEngine` автоматически вызывает `memory.grow()`.

| Сегмент памяти | Диапазон байт | Размер | Назначение |
|---|---|---|---|
| **Stats Output Struct** | `0x0000 .. 0x001B` | 28 байт | Структура результатов `SignalStats` (7 полей по 4 байта) |
| **IIR State Buffers** | `0x0100 .. 0x0107` | 8 байт | Регистры задержки $d_1, d_2$ для БИХ-биквадрата |
| **FIR Coefficients** | `0x0400 .. 0x0FFF` | ~3 КБ | Буфер весовых коэффициентов КИХ-фильтра (до 768 отводов) |
| **Decimated Out Min / Temp Out** | `0x1000 .. 0x3FFF` | 12 КБ | Буфер минимумов по корзинам / выходной буфер фильтрации |
| **Decimated Out Max** | `0x4000 .. 0x7FFF` | 16 КБ | Буфер максимумов по корзинам (до 4096 корзин `Float32`) |
| **Sample Input Buffer** | `0x8000 .. 0xFFFFF` | 992 КБ+ | Буфер входных выборок АЦП (248 000+ `Float32` отсчетов; расширяется динамически) |

### Структура `SignalStats` (`out_ptr = 0x0000`):
```c
struct SignalStats {
    float min;          // offset 0  (0x00) — Минимальное значение напряжения (В)
    float max;          // offset 4  (0x04) — Максимальное значение напряжения (В)
    float vpp;          // offset 8  (0x08) — Размах сигнала Vpp = max - min (В)
    float rms;          // offset 12 (0x0C) — Среднеквадратичное значение (RMS, В)
    float mean;         // offset 16 (0x10) — Постоянная составляющая / среднее (В)
    int32_t count;      // offset 20 (0x14) — Количество обработанных отсчетов
    int32_t error_code; // offset 24 (0x18) — Код возврата (0 = OK)
};
```

---

## 3. Спецификация функций C-ABI

### 3.1. `dsp_init`
```c
int32_t dsp_init(void);
```
- **Назначение**: Инициализирует внутренние константы ядра.
- **Возврат**: `0` при успешной инициализации.

### 3.2. `dsp_noop`
```c
int32_t dsp_noop(void);
```
- **Назначение**: Нулевая операция для высокоточного измерения накладных расходов перехода границы JavaScript/WASM.
- **Возврат**: `0`.

### 3.3. `dsp_compute_stats`
```c
int32_t dsp_compute_stats(
    int32_t in_ptr,     // Смещение входного массива Float32 (байт)
    int32_t count,      // Количество отсчетов (> 0)
    int32_t out_ptr     // Смещение для записи структуры SignalStats (28 байт)
);
```
- **Алгоритм**:
  - Скалярная однопроходная редукция: `min`, `max`, `sum` ($\sum x_i$), `sum_sq` ($\sum x_i^2$).
  - Накопление сумм ведётся в `f64` (double precision) для предотвращения потери точности при $N > 10^5$.
  - Вычисляет:
    $$V_{pp} = \max - \min$$
    $$V_{mean} = \frac{\sum x_i}{N}$$
    $$V_{rms} = \sqrt{\frac{\sum x_i^2}{N}}$$
- **Коды ошибок**:
  - `0`: Успех (`WASM_ERR_OK`);
  - `-1`: Нулевой указатель `in_ptr <= 0` или `out_ptr < 0` (`WASM_ERR_NULL_POINTER`);
  - `-2`: Некорректное число отсчетов `count <= 0` (`WASM_ERR_INVALID_COUNT`).

### 3.4. `dsp_compute_stats_simd`
```c
int32_t dsp_compute_stats_simd(
    int32_t in_ptr,
    int32_t count,
    int32_t out_ptr
);
```
- **Алгоритм**:
  - 128-битная SIMD-редукция (WASM SIMD proposal).
  - Векторный цикл шагом 4 отсчета (`v128.load`):
    - `v_min = f32x4.min(v_min, v_x)`
    - `v_max = f32x4.max(v_max, v_x)`
    - `v_sum = f32x4.add(v_sum, v_x)`
    - `v_sum_sq = f32x4.add(v_sum_sq, f32x4.mul(v_x, v_x))`
  - Горизонтальное извлечение полос (lane extraction) с накоплением в `f64`.
  - Скалярный хвостовой цикл для остатка $count \pmod 4$.

### 3.5. `dsp_compute_rms_scalar`
```c
float dsp_compute_rms_scalar(
    int32_t in_ptr,
    int32_t count
);
```
- **Назначение**: Высокоскоростное ядро True RMS.
- **Алгоритм**: Аппаратный накопитель квадратов в `f64` без вычисления min, max и mean. Возвращает $\sqrt{\frac{\sum x_i^2}{N}}$.

### 3.6. `dsp_peak_detect_decimate`
```c
int32_t dsp_peak_detect_decimate(
    int32_t in_ptr,         // Смещение входного массива отсчетов
    int32_t in_count,       // Число входных отсчетов
    int32_t out_min_ptr,    // Смещение буфера минимумов корзин
    int32_t out_max_ptr,    // Смещение буфера максимумов корзин
    int32_t bucket_count    // Число выходных экранных корзин (столбцов пикселей)
);
```
- **Алгоритм**: Мин/макс децимация с сохранением всплесков (Peak-Detect).
- **Коды ошибок**: `0` = OK, `-1` = неверный указатель, `-2` = `in_count <= 0`, `-4` = `bucket_count <= 0` или `> in_count`.

### 3.7. `dsp_fir_filter`
```c
int32_t dsp_fir_filter(
    int32_t in_ptr,
    int32_t out_ptr,
    int32_t count,
    int32_t coeff_ptr,
    int32_t taps
);
```
- **Назначение**: Прямая свертка КИХ-фильтра:
  $$y[n] = \sum_{k=0}^{M-1} h[k] \cdot x[n - k]$$
- **Производительность**: > 95 MSPS (в 3.5x быстрее JavaScript JIT за счёт исключения проверок границ массивов).

### 3.8. `dsp_iir_biquad`
```c
int32_t dsp_iir_biquad(
    int32_t in_ptr,
    int32_t out_ptr,
    int32_t count,
    float b0, float b1, float b2,
    float a1, float a2,
    int32_t state_ptr
);
```
- **Назначение**: БИХ-фильтрация 2-го порядка в форме Direct Form II Transposed:
  $$y[n] = b_0 x[n] + d_1[n-1]$$
  $$d_1[n] = b_1 x[n] - a_1 y[n] + d_2[n-1]$$
  $$d_2[n] = b_2 x[n] - a_2 y[n]$$

---

## 4. Сборка и воспроизводимость (Reproducible Build)

Сборка бинарного WASM-файла и TypeScript-загрузчика автоматизирована:

```bash
pnpm run build:wasm
```

- **Входные файлы**:
  - `src/wasm/dsp_kernel.c` — алгоритмический эталон на C;
  - `src/wasm/dsp_kernel.wat` — исходный код на WebAssembly Text Format с поддержкой SIMD.
- **Инструмент компиляции**: `wabt` (`wat2wasm --enable-simd`).
- **Скрипт**: `scripts/build-wasm.mjs`.
- **Выходные артефакты**:
  - `src/wasm/dsp_kernel.wasm` (размер **2 221 байт**);
  - `src/wasm/dsp_kernel_binary.ts` (base64-инкапсуляция с кроссплатформенным декодером для Node.js и браузера).

