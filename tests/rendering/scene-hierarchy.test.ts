import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../../src/rendering/core/SceneManager';
import { LabSceneBuilder } from '../../src/rendering/procedural/LabSceneBuilder';
import { AssetLifecycle } from '../../src/rendering/assets/AssetLifecycle';

describe('Scene Hierarchy & Oscilloscope Physical Model', () => {
  it('establishes standardized scene hierarchy structure', () => {
    const sm = new SceneManager();
    const h = sm.hierarchy;

    expect(h.root.name).toBe('lab_root');
    expect(h.environmentGroup.name).toBe('environment_group');
    expect(h.lightingGroup.name).toBe('lighting_group');
    expect(h.oscilloscopeGroup.name).toBe('oscilloscope_group');
    expect(h.generatorGroup.name).toBe('generator_group');
    expect(h.circuitGroup.name).toBe('circuit_group');

    // Root should contain all subgroups
    expect(h.root.children).toContain(h.environmentGroup);
    expect(h.root.children).toContain(h.lightingGroup);
    expect(h.root.children).toContain(h.oscilloscopeGroup);
    expect(h.root.children).toContain(h.generatorGroup);
    expect(h.root.children).toContain(h.circuitGroup);
  });

  it('builds lab scene and provides identifiable oscilloscope elements', () => {
    const sm = new SceneManager();
    const assets = new AssetLifecycle();
    const builder = new LabSceneBuilder(assets);

    const { screenMesh, interactiveObjects } = builder.buildLabScene(sm.hierarchy);

    expect(screenMesh).toBeInstanceOf(THREE.Mesh);
    expect(screenMesh.name).toBe('oscilloscope_screen');

    // Knobs must be present
    expect(interactiveObjects.has('knob_time_div')).toBe(true);
    expect(interactiveObjects.has('knob_volt_div_ch1')).toBe(true);
    expect(interactiveObjects.has('knob_volt_div_ch2')).toBe(true);
    expect(interactiveObjects.has('knob_trigger_level')).toBe(true);

    // BNC connectors must be present
    expect(interactiveObjects.has('bnc_ch1')).toBe(true);
    expect(interactiveObjects.has('bnc_ch2')).toBe(true);
    expect(interactiveObjects.has('bnc_ext_trig')).toBe(true);

    // Buttons must be present
    expect(interactiveObjects.has('btn_power')).toBe(true);
    expect(interactiveObjects.has('btn_run_stop')).toBe(true);
    expect(interactiveObjects.has('btn_autoset')).toBe(true);

    // Verify geometries are cached and reused
    expect(assets.stats.cachedGeometries).toBeGreaterThan(0);
    expect(assets.stats.cachedMaterials).toBeGreaterThan(0);
  });
});
