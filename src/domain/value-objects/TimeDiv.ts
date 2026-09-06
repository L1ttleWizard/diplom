import { DomainValidationError } from '../types';

/**
 * Standard 1-2-5 time/div scale in seconds (10 ns to 5 s)
 */
export const VALID_TIME_DIV_VALUES: readonly number[] = [
  10e-9,  20e-9,  50e-9,   // 10ns, 20ns, 50ns
  100e-9, 200e-9, 500e-9,  // 100ns, 200ns, 500ns
  1e-6,   2e-6,   5e-6,    // 1us, 2us, 5us
  10e-6,  20e-6,  50e-6,   // 10us, 20us, 50us
  100e-6, 200e-6, 500e-6,  // 100us, 200us, 500us
  1e-3,   2e-3,   5e-3,    // 1ms, 2ms, 5ms
  10e-3,  20e-3,  50e-3,   // 10ms, 20ms, 50ms
  100e-3, 200e-3, 500e-3,  // 100ms, 200ms, 500ms
  1.0,    2.0,    5.0      // 1s, 2s, 5s
];

export class TimeDiv {
  public readonly value: number;

  constructor(value: number) {
    if (!TimeDiv.isValid(value)) {
      throw new DomainValidationError(
        'TimeDiv',
        `Value ${value}s is not a standard 1-2-5 oscilloscope timebase. Valid range: 10ns to 5s.`
      );
    }
    this.value = value;
  }

  public static isValid(value: number): boolean {
    const EPSILON = 1e-12;
    return VALID_TIME_DIV_VALUES.some((v) => Math.abs(v - value) < EPSILON);
  }

  public getNext(): TimeDiv {
    const EPSILON = 1e-12;
    const idx = VALID_TIME_DIV_VALUES.findIndex((v) => Math.abs(v - this.value) < EPSILON);
    if (idx < VALID_TIME_DIV_VALUES.length - 1) {
      return new TimeDiv(VALID_TIME_DIV_VALUES[idx + 1]);
    }
    return this;
  }

  public getPrevious(): TimeDiv {
    const EPSILON = 1e-12;
    const idx = VALID_TIME_DIV_VALUES.findIndex((v) => Math.abs(v - this.value) < EPSILON);
    if (idx > 0) {
      return new TimeDiv(VALID_TIME_DIV_VALUES[idx - 1]);
    }
    return this;
  }

  public toString(): string {
    if (this.value >= 1) return `${this.value}s`;
    if (this.value >= 1e-3) return `${this.value * 1e3}ms`;
    if (this.value >= 1e-6) return `${this.value * 1e6}µs`;
    return `${this.value * 1e9}ns`;
  }
}
