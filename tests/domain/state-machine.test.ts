import { describe, it, expect } from 'vitest';
import { OscilloscopeStateMachine } from '../../src/domain/state-machine/OscilloscopeStateMachine';
import { InvalidStateTransitionError } from '../../src/domain/types';

describe('Oscilloscope State Machine', () => {
  it('starts in IDLE state', () => {
    const sm = new OscilloscopeStateMachine();
    expect(sm.state).toBe('IDLE');
    expect(sm.previousState).toBeNull();
    expect(sm.lastError).toBeNull();
  });

  it('follows standard acquisition lifecycle: IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → RUNNING', () => {
    const sm = new OscilloscopeStateMachine();

    // 1. Arm
    sm.transitionTo('ARMED');
    expect(sm.state).toBe('ARMED');
    expect(sm.previousState).toBe('IDLE');

    // 2. Run
    sm.transitionTo('RUNNING');
    expect(sm.state).toBe('RUNNING');
    expect(sm.previousState).toBe('ARMED');

    // 3. Wait for trigger
    sm.transitionTo('WAITING_TRIGGER');
    expect(sm.state).toBe('WAITING_TRIGGER');

    // 4. Capture
    sm.transitionTo('CAPTURED');
    expect(sm.state).toBe('CAPTURED');

    // 5. Continuous cycle back to RUNNING
    sm.transitionTo('RUNNING');
    expect(sm.state).toBe('RUNNING');
  });

  it('supports single-sequence completion: CAPTURED → STOPPED', () => {
    const sm = new OscilloscopeStateMachine('CAPTURED');
    sm.transitionTo('STOPPED');
    expect(sm.state).toBe('STOPPED');
  });

  it('allows stopping from any active state', () => {
    const activeStates = ['ARMED', 'RUNNING', 'WAITING_TRIGGER', 'CAPTURED'] as const;

    for (const state of activeStates) {
      const sm = new OscilloscopeStateMachine(state);
      sm.transitionTo('STOPPED');
      expect(sm.state).toBe('STOPPED');
      expect(sm.previousState).toBe(state);
    }
  });

  it('allows re-starting from STOPPED to ARMED or RUNNING', () => {
    const sm = new OscilloscopeStateMachine('STOPPED');
    sm.transitionTo('ARMED');
    expect(sm.state).toBe('ARMED');

    sm.transitionTo('STOPPED');
    sm.transitionTo('RUNNING');
    expect(sm.state).toBe('RUNNING');
  });

  it('rejects illegal state transitions and throws InvalidStateTransitionError', () => {
    const sm = new OscilloscopeStateMachine('IDLE');

    // Cannot jump directly from IDLE to WAITING_TRIGGER or CAPTURED
    expect(() => sm.transitionTo('WAITING_TRIGGER')).toThrow(InvalidStateTransitionError);
    expect(() => sm.transitionTo('CAPTURED')).toThrow(InvalidStateTransitionError);

    const smWaiting = new OscilloscopeStateMachine('WAITING_TRIGGER');
    // Cannot jump backwards from WAITING_TRIGGER to ARMED or IDLE directly
    expect(() => smWaiting.transitionTo('ARMED')).toThrow(InvalidStateTransitionError);
    expect(() => smWaiting.transitionTo('IDLE')).toThrow(InvalidStateTransitionError);
  });

  describe('Error Transitions and Recovery', () => {
    it('transitions to ERROR from any valid state with error message', () => {
      const states = ['IDLE', 'ARMED', 'RUNNING', 'WAITING_TRIGGER', 'CAPTURED', 'STOPPED'] as const;

      for (const st of states) {
        const sm = new OscilloscopeStateMachine(st);
        sm.raiseError(`ADC buffer overflow in ${st}`);
        expect(sm.state).toBe('ERROR');
        expect(sm.previousState).toBe(st);
        expect(sm.lastError).toBe(`ADC buffer overflow in ${st}`);
      }
    });

    it('recovers from ERROR to STOPPED or IDLE', () => {
      const sm = new OscilloscopeStateMachine('RUNNING');
      sm.raiseError('Hardware disconnected');
      expect(sm.state).toBe('ERROR');

      // Recover to STOPPED
      sm.resetError('STOPPED');
      expect(sm.state).toBe('STOPPED');
      expect(sm.previousState).toBe('ERROR');
      expect(sm.lastError).toBeNull();

      // Another error and recover to IDLE
      sm.raiseError('Timeout');
      sm.resetError('IDLE');
      expect(sm.state).toBe('IDLE');
      expect(sm.lastError).toBeNull();
    });

    it('rejects resetError if not in ERROR state', () => {
      const sm = new OscilloscopeStateMachine('RUNNING');
      expect(() => sm.resetError()).toThrow(InvalidStateTransitionError);
    });
  });
});
