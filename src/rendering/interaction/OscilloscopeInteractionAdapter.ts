import * as THREE from 'three';
import { OscilloscopeService } from '../../application/services/OscilloscopeService';
import { RaycastManager } from './RaycastManager';
import { STABLE_IDS } from './InteractionTarget';
import { VALID_TIME_DIV_VALUES, TimeDiv } from '../../domain/value-objects/TimeDiv';
import { VALID_VOLT_DIV_VALUES, VoltDiv } from '../../domain/value-objects/VoltDiv';
import { TriggerMode } from '../../domain/types';
import {
  TimeDivChangedEvent,
  ChannelUpdatedEvent,
  TriggerConfigChangedEvent,
  StateChangedEvent
} from '../../domain/events/events';

export class OscilloscopeInteractionAdapter {
  private readonly _service: OscilloscopeService;
  private readonly _raycastManager: RaycastManager;
  private readonly _knobMeshes: Map<string, THREE.Object3D> = new Map();
  private readonly _buttonMeshes: Map<string, THREE.Object3D> = new Map();

  // Accumulators for smooth knob drag-to-step quantization
  private _timeKnobAccumulator: number = 0;
  private _voltCh1Accumulator: number = 0;
  private _voltCh2Accumulator: number = 0;

  private _unsubscribers: Array<() => void> = [];

  constructor(
    service: OscilloscopeService,
    raycastManager: RaycastManager,
    interactiveObjects: Map<string, THREE.Object3D>
  ) {
    this._service = service;
    this._raycastManager = raycastManager;

    this.initTargets(interactiveObjects);
    this.subscribeToDomainEvents();
    this.syncAllFromDomain();
  }

  private initTargets(objects: Map<string, THREE.Object3D>): void {
    // 1. TIME/DIV Knob
    const knobTime = objects.get('knob_time_div') ?? objects.get(STABLE_IDS.OSC_KNOB_TIME);
    if (knobTime) {
      this._knobMeshes.set(STABLE_IDS.OSC_KNOB_TIME, knobTime);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_KNOB_TIME,
        object3D: knobTime,
        type: 'KNOB',
        onDrag: (delta) => this.handleTimeKnobDrag(delta)
      });
    }

    // 2. VOLTS/DIV CH1 Knob
    const knobVoltCh1 = objects.get('knob_volt_div_ch1') ?? objects.get(STABLE_IDS.OSC_KNOB_VOLT_CH1);
    if (knobVoltCh1) {
      this._knobMeshes.set(STABLE_IDS.OSC_KNOB_VOLT_CH1, knobVoltCh1);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_KNOB_VOLT_CH1,
        object3D: knobVoltCh1,
        type: 'KNOB',
        onDrag: (delta) => this.handleVoltKnobDrag('CH1', delta)
      });
    }

    // 3. VOLTS/DIV CH2 Knob
    const knobVoltCh2 = objects.get('knob_volt_div_ch2') ?? objects.get(STABLE_IDS.OSC_KNOB_VOLT_CH2);
    if (knobVoltCh2) {
      this._knobMeshes.set(STABLE_IDS.OSC_KNOB_VOLT_CH2, knobVoltCh2);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_KNOB_VOLT_CH2,
        object3D: knobVoltCh2,
        type: 'KNOB',
        onDrag: (delta) => this.handleVoltKnobDrag('CH2', delta)
      });
    }

    // 4. TRIGGER LEVEL Knob
    const knobTrig = objects.get('knob_trigger_level') ?? objects.get(STABLE_IDS.OSC_KNOB_TRIG_LEVEL);
    if (knobTrig) {
      this._knobMeshes.set(STABLE_IDS.OSC_KNOB_TRIG_LEVEL, knobTrig);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_KNOB_TRIG_LEVEL,
        object3D: knobTrig,
        type: 'KNOB',
        onDrag: (delta) => this.handleTriggerLevelDrag(delta)
      });
    }

    // 5. RUN/STOP Button
    const btnRunStop = objects.get('btn_run_stop') ?? objects.get(STABLE_IDS.OSC_BUTTON_RUN);
    if (btnRunStop) {
      this._buttonMeshes.set(STABLE_IDS.OSC_BUTTON_RUN, btnRunStop);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_BUTTON_RUN,
        object3D: btnRunStop,
        type: 'BUTTON',
        onClick: () => {
          const state = this._service.getState();
          if (state === 'RUNNING' || state === 'WAITING_TRIGGER' || state === 'ARMED') {
            this._service.execute({ type: 'STOP' });
          } else {
            this._service.execute({ type: 'RUN' });
          }
        }
      });
    }

    // 6. Channel BNC Connectors (Toggle channel enable/disable on click)
    const bncCh1 = objects.get('bnc_ch1') ?? objects.get(STABLE_IDS.OSC_INPUT_CH1);
    if (bncCh1) {
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_INPUT_CH1,
        object3D: bncCh1,
        type: 'CONNECTOR',
        onClick: () => {
          const ch1 = this._service.oscilloscope.getChannel('CH1');
          if (ch1.enabled) {
            try {
              this._service.execute({ type: 'DISABLE_CHANNEL', channelId: 'CH1' });
            } catch {
              // Ignore if cannot disable last channel
            }
          } else {
            this._service.execute({ type: 'ENABLE_CHANNEL', channelId: 'CH1' });
          }
        }
      });
    }

    const bncCh2 = objects.get('bnc_ch2') ?? objects.get(STABLE_IDS.OSC_INPUT_CH2);
    if (bncCh2) {
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_INPUT_CH2,
        object3D: bncCh2,
        type: 'CONNECTOR',
        onClick: () => {
          const ch2 = this._service.oscilloscope.getChannel('CH2');
          if (ch2.enabled) {
            try {
              this._service.execute({ type: 'DISABLE_CHANNEL', channelId: 'CH2' });
            } catch {
              // Ignore if cannot disable last channel
            }
          } else {
            this._service.execute({ type: 'ENABLE_CHANNEL', channelId: 'CH2' });
          }
        }
      });
    }

    // 7. Autoset Button -> Cycles Trigger Mode
    const btnAutoset = objects.get('btn_autoset') ?? objects.get(STABLE_IDS.OSC_BUTTON_AUTOSET);
    if (btnAutoset) {
      this._buttonMeshes.set(STABLE_IDS.OSC_BUTTON_AUTOSET, btnAutoset);
      this._raycastManager.registerTarget({
        stableId: STABLE_IDS.OSC_BUTTON_AUTOSET,
        object3D: btnAutoset,
        type: 'BUTTON',
        onClick: () => {
          const currentMode = this._service.oscilloscope.trigger.mode;
          const nextMode: TriggerMode =
            currentMode === 'AUTO' ? 'NORMAL' : currentMode === 'NORMAL' ? 'SINGLE' : 'AUTO';
          this._service.execute({ type: 'SET_TRIGGER_MODE', mode: nextMode });
        }
      });
    }
  }

  private handleTimeKnobDrag(delta: number): void {
    this._timeKnobAccumulator += delta;
    const threshold = 0.5;

    if (Math.abs(this._timeKnobAccumulator) >= threshold) {
      const current = this._service.oscilloscope.timeDiv;
      const next = this._timeKnobAccumulator > 0 ? current.getNext() : current.getPrevious();
      this._timeKnobAccumulator = 0;

      if (next.value !== current.value) {
        this._service.execute({ type: 'SET_TIME_DIV', timeDiv: next.value });
      }
    }
  }

  private handleVoltKnobDrag(channelId: 'CH1' | 'CH2', delta: number): void {
    const acc = channelId === 'CH1' ? (this._voltCh1Accumulator += delta) : (this._voltCh2Accumulator += delta);
    const threshold = 0.5;

    if (Math.abs(acc) >= threshold) {
      const current = this._service.oscilloscope.getChannel(channelId).voltsPerDiv;
      const next = acc > 0 ? current.getNext() : current.getPrevious();

      if (channelId === 'CH1') this._voltCh1Accumulator = 0;
      else this._voltCh2Accumulator = 0;

      if (next.value !== current.value) {
        this._service.execute({ type: 'SET_VOLT_DIV', channelId, voltDiv: next.value });
      }
    }
  }

  private handleTriggerLevelDrag(delta: number): void {
    const current = this._service.oscilloscope.trigger.level;
    const step = 0.05 * Math.sign(delta);
    const next = Number((current + step).toFixed(2));
    this._service.execute({ type: 'SET_TRIGGER_LEVEL', level: next });
  }

  /**
   * Subscribe to Domain Events to keep 3D Visuals in sync with Domain State
   */
  private subscribeToDomainEvents(): void {
    const eb = this._service.eventBus;

    this._unsubscribers.push(
      eb.subscribe<TimeDivChangedEvent>('TIME_DIV_CHANGED', (evt) => {
        this.updateTimeKnobVisual(evt.timeDiv);
      })
    );

    this._unsubscribers.push(
      eb.subscribe<ChannelUpdatedEvent>('CHANNEL_UPDATED', (evt) => {
        this.updateVoltKnobVisual(evt.channelId, evt.voltsPerDiv);
      })
    );

    this._unsubscribers.push(
      eb.subscribe<TriggerConfigChangedEvent>('TRIGGER_CONFIG_CHANGED', (evt) => {
        this.updateTriggerKnobVisual(evt.level);
      })
    );

    this._unsubscribers.push(
      eb.subscribe<StateChangedEvent>('STATE_CHANGED', (evt) => {
        this.updateRunStopVisual(evt.toState);
      })
    );
  }

  public syncAllFromDomain(): void {
    const scope = this._service.oscilloscope;
    this.updateTimeKnobVisual(scope.timeDiv.value);
    this.updateVoltKnobVisual('CH1', scope.getChannel('CH1').voltsPerDiv.value);
    this.updateVoltKnobVisual('CH2', scope.getChannel('CH2').voltsPerDiv.value);
    this.updateTriggerKnobVisual(scope.trigger.level);
    this.updateRunStopVisual(scope.state);
  }

  private updateTimeKnobVisual(timeDivValue: number): void {
    const knob = this._knobMeshes.get(STABLE_IDS.OSC_KNOB_TIME);
    if (!knob) return;

    const idx = VALID_TIME_DIV_VALUES.findIndex((v) => Math.abs(v - timeDivValue) < 1e-12);
    if (idx !== -1) {
      // Rotate knob: span 270 degrees across total steps
      const total = VALID_TIME_DIV_VALUES.length;
      const angle = (idx / (total - 1)) * (Math.PI * 1.5) - Math.PI * 0.75;
      knob.rotation.z = angle;
    }
  }

  private updateVoltKnobVisual(channelId: 'CH1' | 'CH2', voltDivValue: number): void {
    const stableId = channelId === 'CH1' ? STABLE_IDS.OSC_KNOB_VOLT_CH1 : STABLE_IDS.OSC_KNOB_VOLT_CH2;
    const knob = this._knobMeshes.get(stableId);
    if (!knob) return;

    const idx = VALID_VOLT_DIV_VALUES.findIndex((v) => Math.abs(v - voltDivValue) < 1e-6);
    if (idx !== -1) {
      const total = VALID_VOLT_DIV_VALUES.length;
      const angle = (idx / (total - 1)) * (Math.PI * 1.5) - Math.PI * 0.75;
      knob.rotation.z = angle;
    }
  }

  private updateTriggerKnobVisual(level: number): void {
    const knob = this._knobMeshes.get(STABLE_IDS.OSC_KNOB_TRIG_LEVEL);
    if (!knob) return;
    knob.rotation.z = level * 0.8;
  }

  private updateRunStopVisual(state: string): void {
    const btn = this._buttonMeshes.get(STABLE_IDS.OSC_BUTTON_RUN);
    if (!btn || !(btn as THREE.Mesh).material) return;

    const mat = (btn as THREE.Mesh).material as THREE.MeshStandardMaterial;
    if (state === 'RUNNING' || state === 'WAITING_TRIGGER' || state === 'ARMED') {
      mat.color.set('#27ae60'); // green
      mat.emissive.set('#1e8449');
      mat.emissiveIntensity = 0.4;
    } else {
      mat.color.set('#e74c3c'); // red
      mat.emissive.set('#922b21');
      mat.emissiveIntensity = 0.4;
    }
  }

  public dispose(): void {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers.length = 0;
  }
}
