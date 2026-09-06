import {
  ChannelId,
  TriggerMode,
  TriggerSource,
  TriggerSlope,
  DomainValidationError
} from '../types';
import { TimeDiv } from '../value-objects/TimeDiv';
import { VoltDiv } from '../value-objects/VoltDiv';

export interface RunCommand {
  readonly type: 'RUN';
}

export interface StopCommand {
  readonly type: 'STOP';
}

export interface SetTimeDivCommand {
  readonly type: 'SET_TIME_DIV';
  readonly timeDiv: number;
}

export interface SetVoltDivCommand {
  readonly type: 'SET_VOLT_DIV';
  readonly channelId: ChannelId;
  readonly voltDiv: number;
}

export interface SetTriggerLevelCommand {
  readonly type: 'SET_TRIGGER_LEVEL';
  readonly level: number;
}

export interface SetTriggerModeCommand {
  readonly type: 'SET_TRIGGER_MODE';
  readonly mode: TriggerMode;
}

export interface SetTriggerSlopeCommand {
  readonly type: 'SET_TRIGGER_SLOPE';
  readonly slope: TriggerSlope;
}

export interface SetTriggerSourceCommand {
  readonly type: 'SET_TRIGGER_SOURCE';
  readonly source: TriggerSource;
}

export interface SetTriggerPositionCommand {
  readonly type: 'SET_TRIGGER_POSITION';
  readonly position: number;
}

export interface SetTriggerHoldoffCommand {
  readonly type: 'SET_TRIGGER_HOLDOFF';
  readonly holdoff: number;
}

export interface SetTriggerHysteresisCommand {
  readonly type: 'SET_TRIGGER_HYSTERESIS';
  readonly hysteresis: number;
}

export interface ForceTriggerCommand {
  readonly type: 'FORCE_TRIGGER';
}

export interface EnableChannelCommand {
  readonly type: 'ENABLE_CHANNEL';
  readonly channelId: ChannelId;
}

export interface DisableChannelCommand {
  readonly type: 'DISABLE_CHANNEL';
  readonly channelId: ChannelId;
}

export type OscilloscopeCommand =
  | RunCommand
  | StopCommand
  | SetTimeDivCommand
  | SetVoltDivCommand
  | SetTriggerLevelCommand
  | SetTriggerModeCommand
  | SetTriggerSlopeCommand
  | SetTriggerSourceCommand
  | SetTriggerPositionCommand
  | SetTriggerHoldoffCommand
  | SetTriggerHysteresisCommand
  | ForceTriggerCommand
  | EnableChannelCommand
  | DisableChannelCommand;

/**
 * Validates a command before execution
 */
export function validateCommand(command: OscilloscopeCommand): void {
  switch (command.type) {
    case 'RUN':
    case 'STOP':
      // No extra fields to validate
      break;

    case 'SET_TIME_DIV':
      if (!TimeDiv.isValid(command.timeDiv)) {
        throw new DomainValidationError(
          'timeDiv',
          `Invalid time/div ${command.timeDiv}s. Must be a valid 1-2-5 scale value between 10ns and 5s.`
        );
      }
      break;

    case 'SET_VOLT_DIV':
      if (command.channelId !== 'CH1' && command.channelId !== 'CH2') {
        throw new DomainValidationError(
          'channelId',
          `Invalid channel ID: ${command.channelId}. Must be 'CH1' or 'CH2'.`
        );
      }
      if (!VoltDiv.isValid(command.voltDiv)) {
        throw new DomainValidationError(
          'voltDiv',
          `Invalid volts/div ${command.voltDiv}V. Must be a valid 1-2-5 scale value between 1mV and 10V.`
        );
      }
      break;

    case 'SET_TRIGGER_LEVEL':
      if (!Number.isFinite(command.level)) {
        throw new DomainValidationError(
          'level',
          `Trigger level must be a finite number, received: ${command.level}`
        );
      }
      break;

    case 'SET_TRIGGER_MODE':
      if (
        command.mode !== 'AUTO' &&
        command.mode !== 'NORMAL' &&
        command.mode !== 'SINGLE'
      ) {
        throw new DomainValidationError(
          'mode',
          `Invalid trigger mode: ${command.mode}. Must be AUTO, NORMAL, or SINGLE.`
        );
      }
      break;

    case 'SET_TRIGGER_SLOPE':
      if (command.slope !== 'RISING' && command.slope !== 'FALLING') {
        throw new DomainValidationError(
          'slope',
          `Invalid trigger slope: ${command.slope}. Must be RISING or FALLING.`
        );
      }
      break;

    case 'SET_TRIGGER_SOURCE':
      if (command.source !== 'CH1' && command.source !== 'CH2' && command.source !== 'EXT') {
        throw new DomainValidationError(
          'source',
          `Invalid trigger source: ${command.source}. Must be CH1, CH2, or EXT.`
        );
      }
      break;

    case 'SET_TRIGGER_POSITION':
      if (!Number.isFinite(command.position) || command.position < 0.0 || command.position > 1.0) {
        throw new DomainValidationError(
          'position',
          `Trigger position must be a number between 0.0 and 1.0, received: ${command.position}`
        );
      }
      break;

    case 'SET_TRIGGER_HOLDOFF':
      if (!Number.isFinite(command.holdoff) || command.holdoff < 0) {
        throw new DomainValidationError(
          'holdoff',
          `Holdoff must be a non-negative finite number, received: ${command.holdoff}`
        );
      }
      break;

    case 'SET_TRIGGER_HYSTERESIS':
      if (!Number.isFinite(command.hysteresis) || command.hysteresis < 0) {
        throw new DomainValidationError(
          'hysteresis',
          `Hysteresis must be a non-negative finite number, received: ${command.hysteresis}`
        );
      }
      break;

    case 'FORCE_TRIGGER':
      // No extra fields to validate
      break;

    case 'ENABLE_CHANNEL':
    case 'DISABLE_CHANNEL':
      if (command.channelId !== 'CH1' && command.channelId !== 'CH2') {
        throw new DomainValidationError(
          'channelId',
          `Invalid channel ID: ${command.channelId}. Must be 'CH1' or 'CH2'.`
        );
      }
      break;

    default: {
      const exhaustiveCheck: never = command;
      throw new DomainValidationError('command', `Unknown command type: ${(exhaustiveCheck as any)?.type}`);
    }
  }
}

