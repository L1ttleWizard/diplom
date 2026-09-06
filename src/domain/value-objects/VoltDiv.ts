import { DomainValidationError } from '../types';

/**
 * Standard 1-2-5 volts/div scale in volts (1 mV to 10 V)
 */
export const VALID_VOLT_DIV_VALUES: readonly number[] = [
  1e-3,  2e-3,  5e-3,   // 1mV, 2mV, 5mV
  10e-3, 20e-3, 50e-3,  // 10mV, 20mV, 50mV
  100e-3, 200e-3, 500e-3, // 100mV, 200mV, 500mV
  1.0,   2.0,   5.0,    // 1V, 2V, 5V
  10.0                  // 10V
];

export class VoltDiv {
  public readonly value: number;

  constructor(value: number) {
    if (!VoltDiv.isValid(value)) {
      throw new DomainValidationError(
        'VoltDiv',
        `Value ${value}V is not a standard 1-2-5 oscilloscope vertical scale. Valid range: 1mV to 10V.`
      );
    }
    this.value = value;
  }

  public static isValid(value: number): boolean {
    const EPSILON = 1e-6;
    return VALID_VOLT_DIV_VALUES.some((v) => Math.abs(v - value) < EPSILON);
  }

  public getNext(): VoltDiv {
    const EPSILON = 1e-6;
    const idx = VALID_VOLT_DIV_VALUES.findIndex((v) => Math.abs(v - this.value) < EPSILON);
    if (idx < VALID_VOLT_DIV_VALUES.length - 1) {
      return new VoltDiv(VALID_VOLT_DIV_VALUES[idx + 1]);
    }
    return this;
  }

  public getPrevious(): VoltDiv {
    const EPSILON = 1e-6;
    const idx = VALID_VOLT_DIV_VALUES.findIndex((v) => Math.abs(v - this.value) < EPSILON);
    if (idx > 0) {
      return new VoltDiv(VALID_VOLT_DIV_VALUES[idx - 1]);
    }
    return this;
  }

  public toString(): string {
    if (this.value >= 1) return `${this.value}V`;
    return `${this.value * 1e3}mV`;
  }
}
