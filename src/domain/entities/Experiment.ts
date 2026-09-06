import { Circuit } from './Circuit';
import { SignalSource } from './SignalSource';
import { MeasurementType } from '../types';

export interface TargetMeasurement {
  type: MeasurementType;
  expectedMin: number;
  expectedMax: number;
  unit: string;
}

export interface ExperimentConfig {
  id: string;
  title: string;
  description: string;
  circuit?: Circuit;
  signalSources?: SignalSource[];
  targets?: TargetMeasurement[];
}

export class Experiment {
  public readonly id: string;
  public readonly title: string;
  public readonly description: string;
  private _circuit?: Circuit;
  private _signalSources: Map<string, SignalSource>;
  private _targets: TargetMeasurement[];
  private _completed: boolean;

  constructor(config: ExperimentConfig) {
    this.id = config.id;
    this.title = config.title;
    this.description = config.description;
    this._circuit = config.circuit;
    this._signalSources = new Map();
    this._targets = config.targets ? [...config.targets] : [];
    this._completed = false;

    if (config.signalSources) {
      for (const src of config.signalSources) {
        this.addSignalSource(src);
      }
    }
  }

  public get circuit(): Circuit | undefined {
    return this._circuit;
  }

  public get signalSources(): SignalSource[] {
    return Array.from(this._signalSources.values());
  }

  public get targets(): readonly TargetMeasurement[] {
    return this._targets;
  }

  public get completed(): boolean {
    return this._completed;
  }

  public setCircuit(circuit: Circuit): void {
    this._circuit = circuit;
  }

  public addSignalSource(source: SignalSource): void {
    this._signalSources.set(source.id, source);
  }

  public removeSignalSource(sourceId: string): void {
    this._signalSources.delete(sourceId);
  }

  public markCompleted(): void {
    this._completed = true;
  }

  public reset(): void {
    this._completed = false;
  }
}
