import type * as THREE from 'three';

export const STABLE_IDS = {
  OSC_BODY: 'osc.body',
  OSC_SCREEN: 'osc.screen',
  OSC_KNOB_TIME: 'osc.knob.time',
  OSC_KNOB_VOLT_CH1: 'osc.knob.voltage.ch1',
  OSC_KNOB_VOLT_CH2: 'osc.knob.voltage.ch2',
  OSC_KNOB_TRIG_LEVEL: 'osc.knob.trigger.level',
  OSC_BUTTON_RUN: 'osc.button.run',
  OSC_BUTTON_STOP: 'osc.button.stop',
  OSC_BUTTON_AUTOSET: 'osc.button.autoset',
  OSC_CHANNEL_CH1: 'osc.channel.ch1',
  OSC_CHANNEL_CH2: 'osc.channel.ch2',
  OSC_INPUT_CH1: 'osc.input.ch1',
  OSC_INPUT_CH2: 'osc.input.ch2',
  OSC_TRIGGER_MODE: 'osc.trigger.mode'
} as const;

export type StableId = (typeof STABLE_IDS)[keyof typeof STABLE_IDS];

export type InteractionType = 'BUTTON' | 'KNOB' | 'CONNECTOR' | 'SCREEN';

export interface IInteractionTarget {
  readonly stableId: StableId | string;
  readonly object3D: THREE.Object3D;
  readonly type: InteractionType;
  onClick?: () => void;
  onDrag?: (deltaNormalized: number) => void;
  onHover?: (hovered: boolean) => void;
}
