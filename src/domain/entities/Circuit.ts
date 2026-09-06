import { CircuitComponentType, DomainValidationError } from '../types';

export interface CircuitComponent {
  id: string;
  type: CircuitComponentType;
  value: number; // Ohms, Farads, Henrys, Volts
  unit: string;
  nodeA: string;
  nodeB: string;
}

export interface ProbePoint {
  id: string;
  label: string;
  nodeId: string;
}

export interface CircuitConfig {
  id: string;
  name: string;
  description?: string;
  components?: CircuitComponent[];
  probePoints?: ProbePoint[];
}

export class Circuit {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  private _components: Map<string, CircuitComponent>;
  private _probePoints: Map<string, ProbePoint>;

  constructor(config: CircuitConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description ?? '';
    this._components = new Map();
    this._probePoints = new Map();

    if (config.components) {
      for (const comp of config.components) {
        this.addComponent(comp);
      }
    }

    if (config.probePoints) {
      for (const pt of config.probePoints) {
        this.addProbePoint(pt);
      }
    }
  }

  public get components(): CircuitComponent[] {
    return Array.from(this._components.values());
  }

  public get probePoints(): ProbePoint[] {
    return Array.from(this._probePoints.values());
  }

  public addComponent(component: CircuitComponent): void {
    if (this._components.has(component.id)) {
      throw new DomainValidationError('component', `Component with ID ${component.id} already exists`);
    }
    if (!Number.isFinite(component.value) || component.value <= 0) {
      throw new DomainValidationError('value', `Component value must be positive finite number`);
    }
    this._components.set(component.id, { ...component });
  }

  public removeComponent(componentId: string): void {
    this._components.delete(componentId);
  }

  public addProbePoint(probePoint: ProbePoint): void {
    if (this._probePoints.has(probePoint.id)) {
      throw new DomainValidationError('probePoint', `Probe point ${probePoint.id} already exists`);
    }
    this._probePoints.set(probePoint.id, { ...probePoint });
  }

  public getProbePoint(id: string): ProbePoint | undefined {
    return this._probePoints.get(id);
  }
}
