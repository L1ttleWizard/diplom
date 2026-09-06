import * as THREE from 'three';
import { ISceneHierarchy } from '../types';
import { AssetLifecycle } from '../assets/AssetLifecycle';
import { STABLE_IDS } from '../interaction/InteractionTarget';

export class LabSceneBuilder {
  private readonly _assets: AssetLifecycle;

  constructor(assets?: AssetLifecycle) {
    this._assets = assets ?? new AssetLifecycle();
  }

  public buildLabScene(hierarchy: ISceneHierarchy): {
    screenMesh: THREE.Mesh;
    interactiveObjects: Map<string, THREE.Object3D>;
  } {
    const interactiveObjects = new Map<string, THREE.Object3D>();

    // 1. Build Environment (Desk and Floor)
    this.buildEnvironment(hierarchy.environmentGroup);

    // 2. Build Oscilloscope Physical Model
    const { screenMesh, scopeControls } = this.buildOscilloscope(hierarchy.oscilloscopeGroup);
    for (const [k, v] of scopeControls.entries()) {
      interactiveObjects.set(k, v);
    }

    // 3. Build Lab Signal Generator Placeholder
    this.buildGeneratorPlaceholder(hierarchy.generatorGroup);

    return { screenMesh, interactiveObjects };
  }

  private buildEnvironment(group: THREE.Group): void {
    // Floor
    const floorGeo = this._assets.getOrCreateGeometry('floor_geo', () => new THREE.PlaneGeometry(12, 12));
    const floorMat = this._assets.getOrCreateMaterial(
      'floor_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#1a1e24',
          roughness: 0.85,
          metalness: 0.1
        })
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.01;
    floorMesh.receiveShadow = true;
    floorMesh.name = 'floor_mesh';
    group.add(floorMesh);

    // Lab Workbench / Desk
    const deskGeo = this._assets.getOrCreateGeometry('desk_geo', () => new THREE.BoxGeometry(2.2, 0.05, 1.2));
    const deskMat = this._assets.getOrCreateMaterial(
      'desk_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#252a33',
          roughness: 0.65,
          metalness: 0.15
        })
    );
    const deskMesh = new THREE.Mesh(deskGeo, deskMat);
    deskMesh.position.set(0, 0, 0);
    deskMesh.receiveShadow = true;
    deskMesh.name = 'desk_mesh';
    group.add(deskMesh);

    // Desk Legs
    const legGeo = this._assets.getOrCreateGeometry('leg_geo', () => new THREE.CylinderGeometry(0.025, 0.025, 0.8, 16));
    const legMat = this._assets.getOrCreateMaterial(
      'leg_mat',
      () => new THREE.MeshStandardMaterial({ color: '#16191f', metalness: 0.8, roughness: 0.4 })
    );

    const legPositions = [
      [-1.0, -0.425, -0.5],
      [1.0, -0.425, -0.5],
      [-1.0, -0.425, 0.5],
      [1.0, -0.425, 0.5]
    ];

    for (let i = 0; i < legPositions.length; i++) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(legPositions[i][0], legPositions[i][1], legPositions[i][2]);
      leg.receiveShadow = true;
      group.add(leg);
    }
  }

  private buildOscilloscope(group: THREE.Group): {
    screenMesh: THREE.Mesh;
    scopeControls: Map<string, THREE.Object3D>;
  } {
    const controls = new Map<string, THREE.Object3D>();

    // Scope Dimensions: 34cm width, 17cm height, 15cm depth
    const width = 0.36;
    const height = 0.18;
    const depth = 0.15;

    // Scope Root Node
    const scopeRoot = new THREE.Group();
    scopeRoot.name = 'oscilloscope_root';
    scopeRoot.position.set(-0.15, height / 2 + 0.025, 0); // centered on desk

    // 1. Chassis / Body
    const bodyGeo = this._assets.getOrCreateGeometry(
      'scope_body_geo',
      () => new THREE.BoxGeometry(width, height, depth)
    );
    const bodyMat = this._assets.getOrCreateMaterial(
      'scope_body_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#d4d8de', // light lab grey chassis
          roughness: 0.5,
          metalness: 0.15
        })
    );
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.name = 'oscilloscope_body';
    bodyMesh.userData.stableId = STABLE_IDS.OSC_BODY;
    scopeRoot.add(bodyMesh);

    // Front Bezel Panel
    const bezelGeo = this._assets.getOrCreateGeometry(
      'scope_bezel_geo',
      () => new THREE.BoxGeometry(width * 0.98, height * 0.96, 0.012)
    );
    const bezelMat = this._assets.getOrCreateMaterial(
      'scope_bezel_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#1e2229', // dark graphite front panel
          roughness: 0.7,
          metalness: 0.1
        })
    );
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.set(0, 0, depth / 2 + 0.006);
    bezelMesh.name = 'front_panel';
    scopeRoot.add(bezelMesh);

    // 2. Display Screen (7-inch 16:9 ratio: ~16cm x 9.5cm)
    const screenWidth = 0.17;
    const screenHeight = 0.105;
    const screenGeo = this._assets.getOrCreateGeometry(
      'scope_screen_geo',
      () => new THREE.PlaneGeometry(screenWidth, screenHeight)
    );
    // Distinct material for screen display texture mapping in Wave 3/4
    const screenMat = new THREE.MeshStandardMaterial({
      color: '#080c10',
      roughness: 0.2,
      metalness: 0.05,
      emissive: '#04080e',
      emissiveIntensity: 0.3
    });
    screenMat.name = 'oscilloscope_screen_material';

    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    // Position on left side of front panel
    screenMesh.position.set(-0.065, 0.01, depth / 2 + 0.013);
    screenMesh.name = 'oscilloscope_screen';
    screenMesh.userData.stableId = STABLE_IDS.OSC_SCREEN;
    scopeRoot.add(screenMesh);

    // 3. Rotary Encoders / Knobs (Right Side of Front Panel)
    const knobGeo = this._assets.getOrCreateGeometry(
      'knob_geo',
      () => new THREE.CylinderGeometry(0.012, 0.013, 0.014, 24)
    );
    const knobMat = this._assets.getOrCreateMaterial(
      'knob_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#343a42',
          roughness: 0.4,
          metalness: 0.6
        })
    );

    // TIME/DIV knob
    const knobTimeDiv = new THREE.Mesh(knobGeo, knobMat);
    knobTimeDiv.rotation.x = Math.PI / 2;
    knobTimeDiv.position.set(0.07, 0.04, depth / 2 + 0.018);
    knobTimeDiv.name = 'knob_time_div';
    knobTimeDiv.userData.stableId = STABLE_IDS.OSC_KNOB_TIME;
    scopeRoot.add(knobTimeDiv);
    controls.set('knob_time_div', knobTimeDiv);
    controls.set(STABLE_IDS.OSC_KNOB_TIME, knobTimeDiv);

    // VOLTS/DIV CH1 knob
    const knobVoltDivCH1 = new THREE.Mesh(knobGeo, knobMat);
    knobVoltDivCH1.rotation.x = Math.PI / 2;
    knobVoltDivCH1.position.set(0.12, 0.04, depth / 2 + 0.018);
    knobVoltDivCH1.name = 'knob_volt_div_ch1';
    knobVoltDivCH1.userData.stableId = STABLE_IDS.OSC_KNOB_VOLT_CH1;
    scopeRoot.add(knobVoltDivCH1);
    controls.set('knob_volt_div_ch1', knobVoltDivCH1);
    controls.set(STABLE_IDS.OSC_KNOB_VOLT_CH1, knobVoltDivCH1);

    // VOLTS/DIV CH2 knob
    const knobVoltDivCH2 = new THREE.Mesh(knobGeo, knobMat);
    knobVoltDivCH2.rotation.x = Math.PI / 2;
    knobVoltDivCH2.position.set(0.12, -0.01, depth / 2 + 0.018);
    knobVoltDivCH2.name = 'knob_volt_div_ch2';
    knobVoltDivCH2.userData.stableId = STABLE_IDS.OSC_KNOB_VOLT_CH2;
    scopeRoot.add(knobVoltDivCH2);
    controls.set('knob_volt_div_ch2', knobVoltDivCH2);
    controls.set(STABLE_IDS.OSC_KNOB_VOLT_CH2, knobVoltDivCH2);

    // TRIGGER LEVEL knob
    const knobTriggerLevel = new THREE.Mesh(knobGeo, knobMat);
    knobTriggerLevel.rotation.x = Math.PI / 2;
    knobTriggerLevel.position.set(0.07, -0.01, depth / 2 + 0.018);
    knobTriggerLevel.name = 'knob_trigger_level';
    knobTriggerLevel.userData.stableId = STABLE_IDS.OSC_KNOB_TRIG_LEVEL;
    scopeRoot.add(knobTriggerLevel);
    controls.set('knob_trigger_level', knobTriggerLevel);
    controls.set(STABLE_IDS.OSC_KNOB_TRIG_LEVEL, knobTriggerLevel);

    // 4. BNC Connectors (Bottom Row)
    const bncOuterGeo = this._assets.getOrCreateGeometry(
      'bnc_outer_geo',
      () => new THREE.CylinderGeometry(0.007, 0.007, 0.012, 16)
    );
    const bncMat = this._assets.getOrCreateMaterial(
      'bnc_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#a0a8b4', // metallic nickel plated
          roughness: 0.25,
          metalness: 0.95
        })
    );

    const bncPositions = [
      { name: 'bnc_ch1', stableId: STABLE_IDS.OSC_INPUT_CH1, x: 0.04, colorRing: '#ffcc00' },     // CH1 yellow ring
      { name: 'bnc_ch2', stableId: STABLE_IDS.OSC_INPUT_CH2, x: 0.08, colorRing: '#00ccff' },     // CH2 cyan ring
      { name: 'bnc_ext_trig', stableId: 'osc.input.ext', x: 0.12, colorRing: '#999999' } // EXT trig grey ring
    ];

    for (const bnc of bncPositions) {
      const bncMesh = new THREE.Mesh(bncOuterGeo, bncMat);
      bncMesh.rotation.x = Math.PI / 2;
      bncMesh.position.set(bnc.x, -0.055, depth / 2 + 0.016);
      bncMesh.name = bnc.name;
      bncMesh.userData.stableId = bnc.stableId;
      scopeRoot.add(bncMesh);
      controls.set(bnc.name, bncMesh);
      controls.set(bnc.stableId, bncMesh);
    }

    // 5. Buttons (Power, Run/Stop, Autoset)
    const btnGeo = this._assets.getOrCreateGeometry(
      'btn_geo',
      () => new THREE.BoxGeometry(0.014, 0.008, 0.006)
    );

    // Run/Stop button (green/red)
    const runStopMat = this._assets.getOrCreateMaterial(
      'btn_run_stop_mat',
      () => new THREE.MeshStandardMaterial({ color: '#27ae60', roughness: 0.3 })
    );
    const btnRunStop = new THREE.Mesh(btnGeo, runStopMat);
    btnRunStop.position.set(0.07, 0.065, depth / 2 + 0.014);
    btnRunStop.name = 'btn_run_stop';
    btnRunStop.userData.stableId = STABLE_IDS.OSC_BUTTON_RUN;
    scopeRoot.add(btnRunStop);
    controls.set('btn_run_stop', btnRunStop);
    controls.set(STABLE_IDS.OSC_BUTTON_RUN, btnRunStop);

    // Autoset button
    const btnAutosetMat = this._assets.getOrCreateMaterial(
      'btn_autoset_mat',
      () => new THREE.MeshStandardMaterial({ color: '#e67e22', roughness: 0.3 })
    );
    const btnAutoset = new THREE.Mesh(btnGeo, btnAutosetMat);
    btnAutoset.position.set(0.12, 0.065, depth / 2 + 0.014);
    btnAutoset.name = 'btn_autoset';
    btnAutoset.userData.stableId = STABLE_IDS.OSC_BUTTON_AUTOSET;
    scopeRoot.add(btnAutoset);
    controls.set('btn_autoset', btnAutoset);
    controls.set(STABLE_IDS.OSC_BUTTON_AUTOSET, btnAutoset);

    // Power button (round, bottom-left)
    const powerGeo = this._assets.getOrCreateGeometry(
      'btn_power_geo',
      () => new THREE.CylinderGeometry(0.006, 0.006, 0.006, 16)
    );
    const powerMat = this._assets.getOrCreateMaterial(
      'btn_power_mat',
      () => new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 })
    );
    const btnPower = new THREE.Mesh(powerGeo, powerMat);
    btnPower.rotation.x = Math.PI / 2;
    btnPower.position.set(-0.15, -0.055, depth / 2 + 0.014);
    btnPower.name = 'btn_power';
    btnPower.userData.stableId = 'osc.button.power';
    scopeRoot.add(btnPower);
    controls.set('btn_power', btnPower);
    controls.set('osc.button.power', btnPower);

    // Add Scope Root to hierarchy
    group.add(scopeRoot);

    return { screenMesh, scopeControls: controls };
  }

  private buildGeneratorPlaceholder(group: THREE.Group): void {
    const genGeo = this._assets.getOrCreateGeometry(
      'gen_geo',
      () => new THREE.BoxGeometry(0.24, 0.12, 0.18)
    );
    const genMat = this._assets.getOrCreateMaterial(
      'gen_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#3d4450',
          roughness: 0.6,
          metalness: 0.2
        })
    );
    const genMesh = new THREE.Mesh(genGeo, genMat);
    genMesh.position.set(0.35, 0.06 + 0.025, -0.02);
    genMesh.castShadow = true;
    genMesh.receiveShadow = true;
    genMesh.name = 'generator_mesh';
    group.add(genMesh);
  }
}
