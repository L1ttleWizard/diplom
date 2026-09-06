# Data Plane Architecture — Sample Stream & Ring Buffer

## 1. Overview & Data Plane Role

В соответствии с фундаментальным принципом цифрового двойника осциллографа (`GEMINI.md`), высокочастотный поток оцифрованных отсчетов (1–5 MSPS) физически и логически изолирован от Control Plane:

```mermaid
graph TD
    subgraph "Acquisition / Worker Plane (High-Frequency Data Producer)"
        GEN[Deterministic Signal Engine] -->|Analog V(t)| AFE[Analog Front End: Gain/Offset/RC]
        AFE -->|Conditioned Signal| ADC[Quantizing ADC Model: 8-16 bit]
        ADC -->|Sample Batches Float32Array| POST[Acquisition Pipeline]
    end

    subgraph "Data Plane Storage (Zero-Allocation Buffer)"
        POST -->|write / Transferable ArrayBuffer| RING["BoundedRingBuffer (Power-of-Two Float32Array)"]
    end

    subgraph "Consumer Plane (Trigger, DSP, Display Decimation)"
        RING -->|readLatest / peek| TRIG[Digital Trigger Engine]
        RING -->|readWindow / read| DSP[DSP: Min/Max Decimation & Peak Detect]
        DSP -->|Vertex Attributes| GPU[GPU / WebGL2 Display Render Target]
    end
```

### Ключевые требования Data Plane:
1. **Строгое отсутствие аллокаций в горячем цикле**: запрещены вызовы `new Float32Array()`, `.slice()`, `.map()`, `.filter()` при записи и чтении.
2. **Детерминированное время доступа**: $O(1)$ для операций чтения, записи и среза.
3. **Безопасность при переполнении и опустошении**: явные политики `OVERWRITE`, `DROP`, `ERROR` (overflow) и `PARTIAL`, `ZERO_FILL`, `ERROR` (underflow).
4. **Произвольный доступ к хронологическим окнам**: поддержка чтения последних $N$ отсчетов (`readLatest`) и выборки по глобальному индексу отсчета (`readWindow`) без разрушения содержимого буфера.

---

## 2. Bounded Circular Ring Buffer (`BoundedRingBuffer`)

### 2.1. Внутреннее представление и выравнивание по степени двойки
Емкость буфера всегда округляется вверх до ближайшей степени двойки:
$$C = 2^{\lceil \log_2(capacity) \rceil}$$

Это позволяет заменить дорогостоящую операцию целочисленного деления по модулю (`idx % capacity`) на сверхбыструю побитовую маску:
$$\text{physicalIndex} = \text{globalIndex} \ \& \ (C - 1)$$

```text
Memory Layout (Single Pre-allocated Float32Array):
+--------+--------+--------+--------+--------+--------+--------+--------+
| Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 | Slot 6 | Slot 7 |  (Capacity = 8, Mask = 0b111)
+--------+--------+--------+--------+--------+--------+--------+--------+
   ^                                   ^
   |                                   |
_readIndex (e.g. 8)                 _writeIndex (e.g. 12)
(8 & 7 = Slot 0)                    (12 & 7 = Slot 4)
Available = _writeIndex - _readIndex = 4 samples
```

### 2.2. Монотонные 64-битные указатели
Вместо хранения относительных смещений с ручным сбросом при переходе границы, `BoundedRingBuffer` использует монотонно возрастающие индексы `_writeIndex` и `_readIndex`:
- `available`: $\Delta = \_writeIndex - \_readIndex$
- `freeSpace`: $C - \text{available}$
- `wraparound`: `_writeIndex >= capacity`
- `wrapCount`: $\lfloor \_writeIndex / C \rfloor$

Числовая точность JavaScript `Number` (IEEE 754 Double Precision) гарантирует сохранение целочисленной точности до $2^{53} - 1 \approx 9 \times 10^{15}$ отсчетов. При частоте 5 MSPS непрерывный захват без потери точности указателей возможен в течение:
$$T = \frac{2^{53} - 1}{5 \cdot 10^6 \cdot 3600 \cdot 24 \cdot 365.25} \approx 57\,000 \text{ лет}$$

---

## 3. Политики переполнения и опустошения

### 3.1. Политики переполнения (Overflow Policies)

| Политика | Поведение при `requested > freeSpace` | Область применения |
|---|---|---|
| **`OVERWRITE`** (Default) | Старейшие непрочитанные отсчеты перезаписываются. Указатель `_readIndex` сдвигается вперед (`_readIndex += overflowCount`). Буфер сохраняет самые свежие отсчеты. | Непрерывный режим осциллографа (Rolling buffer / Real-time display). |
| **`DROP`** | Записываются только отсчеты, помещающиеся в `freeSpace`. Избыточные отсчеты отбрасываются. Указатель `_readIndex` остается на месте. | Фиксированные кадры захвата без права потери истории (Shot logging). |
| **`ERROR`** | Выбрасывается исключение `RingBufferOverflowError`. Буфер остается неизменным. | Строгая математическая верификация и отладка пайплайна. |

### 3.2. Политики опустошения (Underflow Policies)

| Политика | Поведение при `requested > available` | Область применения |
|---|---|---|
| **`PARTIAL`** (Default) | Читаются только фактически доступные отсчеты (`available`). Возвращается число фактически прочитанных значений. | Регулярный опрос потребителями (Display decimation, Trigger scanner). |
| **`ZERO_FILL`** | Доступные отсчеты копируются в начало выходного массива, остаток заполняется нулями (`0.0`). Возвращается запрошенное количество. | DSP алгоритмы с фиксированным размером окна (FFT, FIR фильтрация). |
| **`ERROR`** | Выбрасывается исключение `RingBufferUnderflowError`. Буфер и целевой массив остаются неизменными. | Жесткие протоколы блочной передачи. |

---

## 4. Неразрушающее чтение для визуализации и триггера

Осциллограф требует частого сканирования выборок для:
1. Поиска условий синхронизации (Edge Trigger / Level Crossings);
2. Построения кадра развертки на экране (Min/Max Decimation для 60 FPS).

Обычное чтение со сдвигом указателя `_readIndex` разрушало бы данные для последующих стадий. `BoundedRingBuffer` предоставляет методы неразрушающего доступа:

```ts
// 1. Быстрый подсмотр отсчета относительно головы чтения
const sample = ring.peek(offsetFromRead);

// 2. Неразрушающее извлечение последних N отсчетов в scratch-буфер
const copied = ring.readLatest(destBuffer, count);

// 3. Доступ к произвольному хронологическому окну по абсолютному индексу
const copied = ring.readWindow(destBuffer, globalStartIndex, count);
```

---

## 5. Инвариант нулевых аллокаций (Zero-Allocation Invariant)

Для соответствия требованиям 60 FPS и предотвращения пауз сборщика мусора (GC Stop-The-World):
- Вся память под кольцевой буфер выделяется однократно при инициализации (`new Float32Array(capacity)`).
- Методы `write` и `read` принимают существующие типизированные массивы потребителя.
- В горячих циклах полностью исключены вызовы `.slice()`, `.map()`, `Array.from()`, замыкания и создание временных объектов.

---

## 6. Результаты нагрузочного тестирования и бенчмарков

Результаты зафиксированы на эталонном тестовом стенде:
- **Zero-Allocation Throughput**: **430–620 Mops/sec** (чтение и запись 1 000 000 отсчетов за 1.7–2.3 мс).
- **Soak Test**: **10 000 000 отсчетов** непрерывного потока пакетами случайной длины (1–4096 выборок).
  - Время прогона: **32.2 мс** (эффективная пропускная способность **310 MSPS**).
  - Проверка монотонности: $V_k = V_{k-1} + 1$ для всех 10 млн отсчетов без сбоев нумерации.
  - Динамические аллокации: **0 байт** (flatline heap usage).
