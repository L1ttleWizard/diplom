import type * as THREE from 'three';

export type PerformanceTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PerformanceTierConfig {
  readonly tier: PerformanceTier;
  readonly dpr: number;
  readonly shadows: boolean;
  readonly antialias: boolean;
  readonly powerPreference: 'high-performance' | 'default' | 'low-power';
  readonly maxPixelRatio: number;
}

export const TIER_CONFIGS: Record<PerformanceTier, PerformanceTierConfig> = {
  HIGH: {
    tier: 'HIGH',
    dpr: 2.0,
    maxPixelRatio: 2.0,
    shadows: true,
    antialias: true,
    powerPreference: 'high-performance'
  },
  MEDIUM: {
    tier: 'MEDIUM',
    dpr: 1.0,
    maxPixelRatio: 1.5,
    shadows: true,
    antialias: true,
    powerPreference: 'default'
  },
  LOW: {
    tier: 'LOW',
    dpr: 0.75,
    maxPixelRatio: 1.0,
    shadows: false,
    antialias: false,
    powerPreference: 'low-power'
  }
};

export interface PerformanceMetrics {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly frameTimeP50: number;
  readonly frameTimeP95: number;
  readonly frameTimeP99: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly memoryMb: number | null;
}

export interface ISceneHierarchy {
  readonly root: THREE.Group;
  readonly environmentGroup: THREE.Group;
  readonly lightingGroup: THREE.Group;
  readonly oscilloscopeGroup: THREE.Group;
  readonly generatorGroup: THREE.Group;
  readonly circuitGroup: THREE.Group;
}
