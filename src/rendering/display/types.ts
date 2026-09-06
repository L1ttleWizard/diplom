export interface GridConfig {
  horizontalDivisions: number; // Standard: 10
  verticalDivisions: number;   // Standard: 8
  subTicksPerDivision: number; // Standard: 5 (0.2 div each)
  marginLeft: number;          // Left margin in display pixels
  marginTop: number;           // Top margin in display pixels
  marginRight: number;         // Right margin in display pixels
  marginBottom: number;        // Bottom margin in display pixels
  gridColor: string;           // Dotted major division color
  axisColor: string;           // Center crosshair color
  subTickColor: string;        // Minor tick color
  backgroundColor: string;     // Inner graticule background
  frameColor: string;          // Outer bezel frame color
}

export interface TimeCursor {
  enabled: boolean;
  timeA: number; // Time position in seconds (or division fraction)
  timeB: number; // Time position in seconds (or division fraction)
}

export interface VoltageCursor {
  enabled: boolean;
  channelId: 'CH1' | 'CH2';
  voltageA: number; // Voltage position in Volts
  voltageB: number; // Voltage position in Volts
}

export interface CursorState {
  timeCursor: TimeCursor;
  voltageCursor: VoltageCursor;
}

export interface MeasurementItem {
  name: string;   // e.g. "Vpp", "Vrms", "Freq", "Period"
  value: string;  // formatted string e.g. "3.24 V", "1.00 kHz"
  channel: 'CH1' | 'CH2';
}

export interface DisplayStateSnapshot {
  state: 'IDLE' | 'ARMED' | 'RUNNING' | 'WAITING_TRIGGER' | 'CAPTURED' | 'STOPPED' | 'ERROR';
  timeDivStr: string;
  timeDivValue?: number; // In seconds
  ch1Enabled: boolean;
  ch1VoltDivStr: string;
  ch1VoltDivValue?: number; // In Volts
  ch1Offset?: number;
  ch2Enabled: boolean;
  ch2VoltDivStr: string;
  ch2VoltDivValue?: number; // In Volts
  ch2Offset?: number;
  triggerMode: string;
  triggerLevelStr: string;
  triggerLevelValue?: number; // In Volts
  triggerSource?: 'CH1' | 'CH2' | 'EXT';
  sampleRateStr: string;
  cursors?: Partial<CursorState>;
  measurements?: MeasurementItem[];
}
