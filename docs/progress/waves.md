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

# Next Wave
- **Wave 2**: 3D Scene Foundation (Bootstrap сцены, Three.js рендерер, камера, адаптер прибора).
