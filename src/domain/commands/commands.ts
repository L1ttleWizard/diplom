import {
  ChannelId,
  TriggerMode,
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
