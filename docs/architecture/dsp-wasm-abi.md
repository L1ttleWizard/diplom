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
| **Reserved System** | `0x001C .. 0x0FFF` | ~4 КБ | Зарезервировано под метаданные и флаги ядра |
| **Decimated Out Min** | `0x1000 .. 0x3FFF` | 12 КБ | Буфер минимумов по корзинам (до 3072 корзин `Float32`) |
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

### 3.2. `dsp_compute_stats`
```c
int32_t dsp_compute_stats(
    int32_t in_ptr,     // Смещение входного массива Float32 (байт)
    int32_t count,      // Количество отсчетов (> 0)
    int32_t out_ptr     // Смещение для записи структуры SignalStats (28 байт)
);
```
- **Алгоритм**:
  - Выполняет однопроходную редукцию: вычисляет `min`, `max`, `sum` ($\sum x_i$), `sum_sq` ($\sum x_i^2$).
  - Накопление сумм ведётся в `f64` (double precision) для предотвращения потери точности при $N > 10^5$.
  - Вычисляет:
    $$V_{pp} = \max - \min$$
    $$V_{mean} = \frac{\sum x_i}{N}$$
    $$V_{rms} = \sqrt{\frac{\sum x_i^2}{N}}$$
- **Коды ошибок**:
  - `0`: Успех (`WASM_ERR_OK`);
  - `-1`: Нулевой указатель `in_ptr <= 0` или `out_ptr < 0` (`WASM_ERR_NULL_POINTER`);
  - `-2`: Некорректное число отсчетов `count <= 0` (`WASM_ERR_INVALID_COUNT`).

### 3.3. `dsp_peak_detect_decimate`
```c
int32_t dsp_peak_detect_decimate(
    int32_t in_ptr,         // Смещение входного массива отсчетов
    int32_t in_count,       // Число входных отсчетов
    int32_t out_min_ptr,    // Смещение буфера минимумов корзин
    int32_t out_max_ptr,    // Смещение буфера максимумов корзин
    int32_t bucket_count    // Число выходных экранных корзин (столбцов пикселей)
);
```
- **Алгоритм (Peak-Detect / Min-Max Decimation)**:
  - Делит массив `in_count` на `bucket_count` интервалов с плавающим шагом $\Delta = \frac{N_{in}}{N_{buckets}}$.
  - В каждой корзине $b$ находит локальный минимум $\min_b$ и локальный максимум $\max_b$.
  - Записывает пары $(\min_b, \max_b)$ в выходные массивы.
  - **Свойство**: гарантированно сохраняет узкие высокочастотные импульсы и пики шума (glitches) длительностью даже в 1 отсчёт, которые полностью теряются при обычном прореживании (subsampling).
- **Коды ошибок**:
  - `0`: Успех;
  - `-1`: Некорректный указатель (`in_ptr <= 0`, `out_min_ptr < 0`, `out_max_ptr < 0`);
  - `-2`: `in_count <= 0`;
  - `-4`: `bucket_count <= 0` или `bucket_count > in_count` (`WASM_ERR_INVALID_BUCKETS`).

---

## 4. Сборка и воспроизводимость (Reproducible Build)

Сборка бинарного WASM-файла и TypeScript-загрузчика автоматизирована:

```bash
pnpm run build:wasm
```

- **Входные файлы**:
  - `src/wasm/dsp_kernel.c` — алгоритмический эталон на C;
  - `src/wasm/dsp_kernel.wat` — исходный код на WebAssembly Text Format.
- **Инструмент компиляции**: `wabt` (WebAssembly Binary Toolkit через официальный npm-пакет `wabt`).
- **Скрипт**: `scripts/build-wasm.mjs`.
- **Выходные артефакты**:
  - `src/wasm/dsp_kernel.wasm` (размер **884 байта**);
  - `src/wasm/dsp_kernel_binary.ts` (base64-инкапсуляция с кроссплатформенным декодером для Node.js и браузера).
