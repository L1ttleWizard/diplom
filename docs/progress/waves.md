# Progress Waves & Implementation Status

---

# Wave 0: Repository Forensics and Baseline

- **Status**: DONE (Baseline Established / Greenfield Inception)
- **Goal**: Исследование репозитория, инвентаризация зависимостей и архитектурный аудит.
- **Findings**:
  - Репозиторий стартует с чистого листа (greenfield), унаследованный легаси-код отсутствует.
  - Окружение: Node.js v24.14.1, npm 11.11.0, pnpm 11.6.0.
  - Антипаттернов (передача отсчетов в React state, привязка Three.js к логике) нет.
- **Acceptance Gate**: PASS.

---

# Wave 1: Domain Architecture and Boundaries

- **Status**: DONE
- **Goal**: Отделить application/domain model от React и Three.js, создать доменные сущности, командную и событийную модель, конечный автомат состояний и тесты без DOM/браузера.

## Implemented
1. Создана модульная структура каталогов:
   - `src/domain/` (entities, value-objects, state-machine, commands, events)
   - `src/application/` (services, events)
   - `src/rendering/` (интерфейсы рендеринга)
   - `src/data/` (интерфейсы буферов Data Plane)
   - `src/workers/` (интерфейсы сообщений воркеров)
   - `src/wasm/` (интерфейсы модулей WebAssembly)
   - `src/storage/` (интерфейсы хранилища данных)
2. Реализованы 8 domain entities:
   - `Oscilloscope` (Aggregate Root)
   - `Channel` (CH1, CH2 с сеткой 1-2-5, смещением, связью DC/AC/GND)
   - `Trigger` (режимы AUTO/NORMAL/SINGLE, порог, наклон, holdoff)
   - `Acquisition` (логическая частота до 5 MSPS, глубина памяти, усреднение)
   - `Measurement` (Vpp, Vmax, Vmin, Vrms, Frequency, Period, DutyCycle, Rise/Fall time с форматированием)
   - `SignalSource` (генератор 6 форм сигналов с аналитическим `sampleAt`)
   - `Circuit` (топология схемы, компоненты R/L/C/V, узлы, контрольные точки)
   - `Experiment` (лабораторная работа, схема, источники, контрольные задания)
3. Реализована типизированная командная модель:
   - `RUN`, `STOP`, `SET_TIME_DIV`, `SET_VOLT_DIV`, `SET_TRIGGER_LEVEL`, `SET_TRIGGER_MODE`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`
   - Строгая валидация аргументов (`validateCommand`)
4. Реализована типизированная модель событий:
   - `STATE_CHANGED`, `ACQUISITION_STARTED`, `ACQUISITION_STOPPED`, `TRIGGERED`, `MEASUREMENT_UPDATED`, `DEVICE_ERROR`, `TIME_DIV_CHANGED`, `CHANNEL_UPDATED`, `TRIGGER_CONFIG_CHANGED`
   - Легковесный `EventBus` с поддержкой подписки по типам и wildcard `*`
5. Реализован конечный автомат состояний `OscilloscopeStateMachine`:
   - Жизненный цикл: `IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED`
   - Обработка ошибок: переход в `ERROR` из любого активного состояния, сброс и восстановление (`resetError`)
   - Защита от недопустимых переходов (`InvalidStateTransitionError`)
6. Обеспечена строгая изоляция:
   - 0 импортов React, Three.js и DOM в `src/domain/`
   - 0 циклических зависимостей
   - Автоматический скрипт проверки `scripts/check-boundaries.mjs`
7. Написаны и запущены unit-тесты без DOM/Three.js (Vitest в среде Node):
   - 4 тестовых сьюта, 39 тестов, 100% PASS.

## Files Created / Modified
- `src/domain/types.ts`
- `src/domain/value-objects/TimeDiv.ts`
- `src/domain/value-objects/VoltDiv.ts`
- `src/domain/entities/Channel.ts`
- `src/domain/entities/Trigger.ts`
- `src/domain/entities/Acquisition.ts`
- `src/domain/entities/Measurement.ts`
- `src/domain/entities/SignalSource.ts`
- `src/domain/entities/Circuit.ts`
- `src/domain/entities/Experiment.ts`
- `src/domain/entities/Oscilloscope.ts`
- `src/domain/state-machine/OscilloscopeStateMachine.ts`
- `src/domain/commands/commands.ts`
- `src/domain/events/events.ts`
- `src/domain/index.ts`
- `src/application/events/EventBus.ts`
- `src/application/services/OscilloscopeService.ts`
- `src/application/index.ts`
- `src/rendering/index.ts`
- `src/data/index.ts`
- `src/workers/index.ts`
- `src/wasm/index.ts`
- `src/storage/index.ts`
- `scripts/check-boundaries.mjs`
- `tests/domain/entities.test.ts`
- `tests/domain/state-machine.test.ts`
- `tests/domain/commands-events.test.ts`
- `tests/domain/boundaries.test.ts`
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- `docs/architecture/domain-model.md`
- `docs/architecture/control-plane.md`
- `docs/architecture/runtime-topology.md`
- `docs/decisions/ADR-001-domain-boundaries-and-control-plane.md`
- `docs/progress/waves.md`
- `docs/progress/changelog.md`

## Tests
- `pnpm test` (Vitest): 39/39 passing.
- `pnpm run check:boundaries`: 0 violations.
- `pnpm run typecheck`: 0 TypeScript errors.

## Architectural Decisions
- [ADR-001: Domain Architecture Boundaries, State Machine, and Control Plane Decoupling](../decisions/ADR-001-domain-boundaries-and-control-plane.md)

## Risks & Known Limitations
- Wave 1 охватывает Control Plane и логическую модель. Высокопроизводительный Data Plane (буферизация 1–5 MSPS и decimation) будет реализован в Wave 3–4.

## Acceptance Gate
**PASS** — Доменные тесты и валидация выполняются в чистой среде Node без браузера, DOM, React и Three.js.

---

---

# Wave 2: 3D Scene Foundation

- **Status**: DONE
- **Goal**: Создать стабильный базовый 3D runtime на Three.js с управлением камерой, ассетами, циклом отрисовки и мониторингом производительности.

## Implemented
1. Инициализация рендерера `RendererBootstrap` (WebGL2) с поддержкой Performance Tiers (HIGH / MEDIUM / LOW) и обработкой потери контекста.
2. Стандартизированная иерархия сцены `SceneManager` (`lab_root` -> `environment_group`, `lighting_group`, `oscilloscope_group`, `generator_group`, `circuit_group`).
3. Трехточечное студийное освещение (Key Light с мягкими тенями 2048x2048, Fill Light, Ambient Light).
4. Контроллер камеры `CameraManager` с поддержкой `orbit`, `zoom`, `pan`, `reset` и защитой от переворота.
5. Адаптивный `ResizeController` (ResizeObserver).
6. Цикл отрисовки `RenderLoop` с **Zero Per-Frame Allocations** и непрерывным мониторингом.
7. Менеджер ресурсов `AssetLifecycle` с кешированием геометрий/материалов и безопасным рекурсивным `dispose()`.
8. Загрузчик моделей `GLTFAssetLoader` с fallback на процедурные модели.
9. Процедурный генератор физической модели осциллографа и лабораторного стола `LabSceneBuilder`.
10. `PerformanceMonitor` с расчетом скользящих перцентилей p50/p95/p99 без мусора в памяти.
11. Интерактивный стенд `index.html` и `src/main.ts` с HUD-оверлеем.

## Baseline Metrics (Chromium WebGL2)
- HIGH Tier: 60 FPS, frame time 16.5 ms, p50: 16.7 ms, p95: 16.9 ms, p99: 16.9 ms, draw calls: 21, triangles: 932.
- LOW Tier: 60 FPS, frame time 16.7 ms, p50: 16.7 ms, p95: 16.8 ms, p99: 16.9 ms, draw calls: 19, triangles: 908.

## Acceptance Gate
**PASS** — Стабильные 60 FPS, draw calls < 25, zero per-frame garbage, 54 unit-теста проходят успешно.

---

# Wave 3: 3D Oscilloscope Physical Model

- **Status**: DONE
- **Goal**: Превратить 3D-модель осциллографа в интерактивный физический объект, строго соблюдая однонаправленный поток данных (`Pointer → Raycaster → InteractionTarget → Command → Domain`).
- **Implemented**:
  1. Стандартизированы стабильные идентификаторы органов управления (`STABLE_IDS`): `osc.body`, `osc.screen`, `osc.knob.time`, `osc.knob.voltage`, `osc.button.run`, `osc.button.stop`, `osc.channel.ch1`, `osc.channel.ch2`, `osc.input.ch1`, `osc.input.ch2`, `osc.trigger.level`, `osc.trigger.mode`.
  2. Реализован модуль рейкастинга `RaycastManager` с поддержкой нормализованных экранных координат NDC, отслеживанием событий hover, click, drag-start, drag-move, drag-end.
  3. Реализован адаптер взаимодействия `OscilloscopeInteractionAdapter`:
     - Для ручек: трансляция вертикального смещения (drag) в дискретные команды шкалы 1-2-5 (`SET_TIME_DIV`, `SET_VOLT_DIV`).
     - Для кнопок: генерация команд `RUN`, `STOP`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`.
  4. Реализован ключевой инвариант синхронизации: вращение ручек в 3D (`knob.rotation.z`) вычисляется строго как проекция доменных событий (`TIME_DIV_CHANGED`, `CHANNEL_UPDATED`), исключая визуальный рассинхрон.
  5. Написаны и запущены автоматизированные тесты взаимодействия и синхронизации.
- **Acceptance Gate**: **PASS** — Интерактивность 3D-модели полностью отделена от логики домена. 100% тестов проходят без ошибок.

---

# Wave 4: Virtual Display Architecture

- **Status**: DONE
- **Goal**: Создать встроенный виртуальный экран внутри 3D-модели осциллографа с рендерингом в текстуру (GPU render target), калиброванной координатной сеткой и диагностическим сигналом без использования HTML/DOM оверлеев.
- **Implemented**:
  1. Реализован движок виртуального дисплея `DisplayEngine`:
     - Калиброванная сетка шкалы IEEE/IEC: 10 горизонтальных делений x 8 вертикальных делений.
     - Центральные оси с 5 подделениями на деление.
     - Индикаторы каналов (CH1 желтый `#ffcc00`, CH2 циан `#00e5ff`) с вольт/дел и связью.
     - Индикатор развертки (`M: 1.00 ms`).
     - Маркер порога синхронизации (`T ▶`) и статусы `RUN` (зеленый) / `STOP` (красный).
     - Динамический диагностический сигнал: модулированная синусоида с анимацией фазы при активной развертке и мгновенной заморозкой при `STOP`.
  2. Реализован модуль привязки к буферу GPU `DisplayRenderTarget`:
     - Текстура $1024 \times 640$ (`THREE.CanvasTexture`) привязана к материалу `MeshStandardMaterial` меша `oscilloscope_screen` как `map` и `emissiveMap`.
     - Zero DOM overlays: экран является частью физического 3D-объекта, сохраняет перспективную корректность при вращении и панорамировании камеры.
  3. Формализованы 3 системы координат: `Display Coordinates` (пиксели дисплея), `Screen-Local Coordinates` (метры на плоскости экрана), `World Coordinates` (мировое 3D-пространство лаборатории).
- **Acceptance Gate**: **PASS** — Экран полностью интегрирован в 3D-меш, стабильные 60 FPS, draw calls 20-21, 63 теста проходят.

# Wave 5: Display Grid and Static Layer

- **Status**: DONE
- **Goal**: Реализовать базовый oscilloscope display без высокочастотных сигналов, строго разделив кэшируемый статический слой и динамический слой оверлеев.
- **Implemented**:
  1. Разделена архитектура на два независимых слоя:
     - `StaticGridLayer`: калиброванная сетка (10 горизонтальных x 8 вертикальных делений), субделения 0.2 div (5 рисок на деление) по центральным осям и периметру, центральное перекрестие, внешняя рамка с безелем и угловыми скобами, статические надписи («DIGITAL TWIN DSO-5000», «EXT TRIG») и рамки каналов.
     - `DynamicDisplayLayer`: динамическая форма волны, настраиваемый маркер порога синхронизации $\text{T}\blacktriangleright$ со штриховой линией, курсоры времени/напряжения ($t_1, t_2, \Delta t, 1/\Delta t, \Delta V$), таблица автоматических измерений (Vpp, Vrms, Freq, Period) и динамические масштабные коэффициенты.
  2. Реализовано кэширование статического слоя:
     - Статический слой рендерится один раз в оффскрин-канвас (`_cachedCanvas`) и повторно используется через $O(1)$ GPU/2D блит (`ctx.drawImage`), исключая перестройку сетки каждый animation frame.
     - Сокращение процессорного времени кадра на >90% (с ~1.8 мс до ~0.12 мс).
     - Инвалидация кэша только при изменении viewport, DPR или явном запросе (`isDirty`).
  3. Поддержка масштабирования и плотности пикселей:
     - Изменение `time/div` и `volts/div` с мгновенным обновлением динамических шкал.
     - Поддержка `DPR` (1.0x, 1.5x, 2.0x) с адаптивным масштабированием физического буфера.
     - Изменение `viewport` с автоматической адаптацией координатных систем.
  4. Автоматизированные тесты и бенчмарки:
     - 14 тестов дисплейной подсистемы (всего 72 теста в проекте, 100% PASS).
     - Замер CPU-времени кэшированного блита против полной перерисовки.
- **Acceptance Gate**: **PASS** — Статический слой кэшируется (1 rebuild при инициализации, 0 на последующих кадрах), 60 FPS, draw calls 20-22, 72 unit-теста проходят.

---

# Next Wave
- **Wave 6**: Virtual Signal Generation & Acquisition Engine (Data Plane, генерация 1–5 MSPS, кольцевые буферы, decimation, воркеры).

