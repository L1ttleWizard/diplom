import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraManager } from '../../src/rendering/core/CameraManager';

describe('CameraManager', () => {
  it('initializes with default perspective and target', () => {
    const cm = new CameraManager();
    expect(cm.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(cm.target.x).toBeCloseTo(0);
    expect(cm.target.y).toBeCloseTo(0.22);
    expect(cm.target.z).toBeCloseTo(0);
    expect(cm.radius).toBeCloseTo(1.2);
  });

  it('orbits around target while clamping polar angle', () => {
    const cm = new CameraManager();
    const initialTheta = cm.theta;
    const initialPhi = cm.phi;

    cm.orbit(0.5, -0.2);
    expect(cm.theta).toBeCloseTo(initialTheta + 0.5);
    expect(cm.phi).toBeCloseTo(initialPhi - 0.2);

    // Try to orbit beyond pole limits
    cm.orbit(0, 10.0);
    expect(cm.phi).toBeLessThanOrEqual(cm.maxPolarAngle);

    cm.orbit(0, -20.0);
    expect(cm.phi).toBeGreaterThanOrEqual(cm.minPolarAngle);
  });

  it('zooms within minDistance and maxDistance bounds', () => {
    const cm = new CameraManager();
    cm.minDistance = 0.5;
    cm.maxDistance = 3.0;

    cm.zoom(-0.5);
    expect(cm.radius).toBeCloseTo(0.7);

    // Zoom beyond minDistance
    cm.zoom(-5.0);
    expect(cm.radius).toBe(0.5);

    // Zoom beyond maxDistance
    cm.zoom(10.0);
    expect(cm.radius).toBe(3.0);
  });

  it('pans camera target in camera plane', () => {
    const cm = new CameraManager();
    const startTarget = cm.target.clone();

    cm.pan(0.1, 0.1);
    expect(cm.target.equals(startTarget)).toBe(false);
  });

  it('resets camera position and target to initial defaults', () => {
    const cm = new CameraManager();
    const defaultTarget = cm.target.clone();
    const defaultRadius = cm.radius;

    cm.orbit(1.0, 0.2);
    cm.zoom(0.8);
    cm.pan(0.5, 0.5);

    cm.reset();
    expect(cm.radius).toBe(defaultRadius);
    expect(cm.target.x).toBeCloseTo(defaultTarget.x);
    expect(cm.target.y).toBeCloseTo(defaultTarget.y);
    expect(cm.target.z).toBeCloseTo(defaultTarget.z);
  });

  it('updates aspect ratio and projection matrix', () => {
    const cm = new CameraManager();
    cm.setAspect(16 / 10);
    expect(cm.camera.aspect).toBeCloseTo(1.6);
  });
});
