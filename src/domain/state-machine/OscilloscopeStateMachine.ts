import {
  OscilloscopeStateEnum,
  InvalidStateTransitionError
} from '../types';

/**
 * Valid transitions table for Oscilloscope Lifecycle State Machine:
 * IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED
 * With support for ERROR transitions and recovery.
 */
const VALID_TRANSITIONS: Record<OscilloscopeStateEnum, readonly OscilloscopeStateEnum[]> = {
  IDLE: ['ARMED', 'RUNNING', 'STOPPED', 'ERROR'],
  ARMED: ['RUNNING', 'STOPPED', 'ERROR'],
  RUNNING: ['WAITING_TRIGGER', 'CAPTURED', 'STOPPED', 'ERROR'],
  WAITING_TRIGGER: ['CAPTURED', 'STOPPED', 'ERROR'],
  CAPTURED: ['RUNNING', 'WAITING_TRIGGER', 'STOPPED', 'ERROR'],
  STOPPED: ['ARMED', 'RUNNING', 'IDLE', 'ERROR'],
  ERROR: ['IDLE', 'STOPPED']
};

export class OscilloscopeStateMachine {
  private _state: OscilloscopeStateEnum;
  private _previousState: OscilloscopeStateEnum | null;
  private _lastError: string | null;

  constructor(initialState: OscilloscopeStateEnum = 'IDLE') {
    this._state = initialState;
    this._previousState = null;
    this._lastError = null;
  }

  public get state(): OscilloscopeStateEnum {
    return this._state;
  }

  public get previousState(): OscilloscopeStateEnum | null {
    return this._previousState;
  }

  public get lastError(): string | null {
    return this._lastError;
  }

  public canTransitionTo(targetState: OscilloscopeStateEnum): boolean {
    const allowed = VALID_TRANSITIONS[this._state];
    return allowed.includes(targetState);
  }

  public transitionTo(targetState: OscilloscopeStateEnum, reason?: string): void {
    if (!this.canTransitionTo(targetState)) {
      throw new InvalidStateTransitionError(this._state, targetState, reason);
    }

    this._previousState = this._state;
    this._state = targetState;

    if (targetState !== 'ERROR') {
      this._lastError = null;
    }
  }

  /**
   * Transition to ERROR from any valid state
   */
  public raiseError(errorMessage: string): void {
    if (!this.canTransitionTo('ERROR')) {
      throw new InvalidStateTransitionError(this._state, 'ERROR', 'Cannot transition to ERROR');
    }
    this._previousState = this._state;
    this._state = 'ERROR';
    this._lastError = errorMessage;
  }

  /**
   * Recover from ERROR state back to IDLE or STOPPED
   */
  public resetError(targetState: 'IDLE' | 'STOPPED' = 'STOPPED'): void {
    if (this._state !== 'ERROR') {
      throw new InvalidStateTransitionError(this._state, targetState, 'Not currently in ERROR state');
    }
    this._previousState = this._state;
    this._state = targetState;
    this._lastError = null;
  }
}
