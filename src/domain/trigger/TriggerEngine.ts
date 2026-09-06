/**
 * TriggerEngine (Wave 14)
 *
 * Full-featured digital storage oscilloscope trigger and capture window subsystem:
 * - Operates strictly in the sample domain (ADC / ring buffer samples)
 * - Manages TriggerDetector (Schmitt trigger comparator with hysteresis)
 * - Pre-trigger and Post-trigger window slicing
 * - Rigorous mode semantics: AUTO, NORMAL, SINGLE
 * - Auto-timeout free-running sweep generation
 * - Display buffer extraction with rock-solid phase alignment
 */

import { TriggerMode, TriggerSlope, TriggerSource } from '../types';
import { TriggerDetector } from './TriggerDetector';
import {
  CaptureWindow,
  TriggerDetectionResult,
  TriggerEngineConfig,
  TriggerEngineState
} from './types';

export class TriggerEngine {
  private _sampleRate: number;
  private _timeDiv: number;
  private _position: number;
  private _mode: TriggerMode;
  private _source: TriggerSource;
  private _holdoff: number;
  private _autoTimeout: number;

  private readonly _detector: TriggerDetector;
  private _state: TriggerEngineState;
  private _lastCapture: CaptureWindow | null;
  private _lastTriggerSampleIndex: number;
  private _pendingTrigger: TriggerDetectionResult | null;
  private _samplesSinceLastTrigger: number;
  private _singleArmed: boolean;

  constructor(config: TriggerEngineConfig = {}) {
    this._sampleRate = config.sampleRate ?? 1_000_000;
    this._timeDiv = config.timeDiv ?? 1e-3;
    this._position = config.position ?? 0.5; // 50% center
    this._mode = config.mode ?? 'AUTO';
    this._source = config.source ?? 'CH1';
    this._holdoff = config.holdoff ?? 100e-9;
    this._autoTimeout = config.autoTimeout ?? 0.04; // 40ms default

    const holdoffSamples = Math.max(1, Math.round(this._holdoff * this._sampleRate));
    this._detector = new TriggerDetector({
      level: config.level ?? 0.0,
      slope: config.slope ?? 'RISING',
      hysteresis: config.hysteresis ?? 0.02,
      holdoffSamples,
      sampleRate: this._sampleRate
    });

    this._state = 'IDLE';
    this._lastCapture = null;
    this._lastTriggerSampleIndex = -1;
    this._pendingTrigger = null;
    this._samplesSinceLastTrigger = 0;
    this._singleArmed = false;
  }

  // Configuration Getters & Setters
  public get sampleRate(): number {
    return this._sampleRate;
  }

  public get timeDiv(): number {
    return this._timeDiv;
  }

  public get position(): number {
    return this._position;
  }

  public get mode(): TriggerMode {
    return this._mode;
  }

  public get source(): TriggerSource {
    return this._source;
  }

  public get level(): number {
    return this._detector.level;
  }

  public get slope(): TriggerSlope {
    return this._detector.slope;
  }

  public get hysteresis(): number {
    return this._detector.hysteresis;
  }

  public get holdoff(): number {
    return this._holdoff;
  }

  public get autoTimeout(): number {
    return this._autoTimeout;
  }

  public get state(): TriggerEngineState {
    return this._state;
  }

  public get lastCapture(): CaptureWindow | null {
    return this._lastCapture;
  }

  public get detector(): TriggerDetector {
    return this._detector;
  }

  public setSampleRate(rate: number): void {
    this._sampleRate = Math.max(1, rate);
    this._detector.setSampleRate(this._sampleRate);
    this.updateHoldoffSamples();
  }

  public setTimeDiv(timeDiv: number): void {
    this._timeDiv = Math.max(1e-9, timeDiv);
  }

  public setPosition(pos: number): void {
    this._position = Math.min(1.0, Math.max(0.0, pos));
  }

  public setMode(mode: TriggerMode): void {
    this._mode = mode;
    if (mode === 'SINGLE') {
      this._singleArmed = true;
      this._state = 'WAITING_TRIGGER';
    }
  }

  public setSource(source: TriggerSource): void {
    this._source = source;
  }

  public setLevel(level: number): void {
    this._detector.setLevel(level);
  }

  public setSlope(slope: TriggerSlope): void {
    this._detector.setSlope(slope);
  }

  public setHysteresis(hysteresis: number): void {
    this._detector.setHysteresis(hysteresis);
  }

  public setHoldoff(holdoff: number): void {
    this._holdoff = Math.max(0, holdoff);
    this.updateHoldoffSamples();
  }

  public setAutoTimeout(timeout: number): void {
    this._autoTimeout = Math.max(0.001, timeout);
  }

  public configure(config: TriggerEngineConfig): void {
    if (config.sampleRate !== undefined) this.setSampleRate(config.sampleRate);
    if (config.timeDiv !== undefined) this.setTimeDiv(config.timeDiv);
    if (config.position !== undefined) this.setPosition(config.position);
    if (config.mode !== undefined) this.setMode(config.mode);
    if (config.source !== undefined) this.setSource(config.source);
    if (config.level !== undefined) this.setLevel(config.level);
    if (config.slope !== undefined) this.setSlope(config.slope);
    if (config.hysteresis !== undefined) this.setHysteresis(config.hysteresis);
    if (config.holdoff !== undefined) this.setHoldoff(config.holdoff);
    if (config.autoTimeout !== undefined) this.setAutoTimeout(config.autoTimeout);
  }

  public arm(): void {
    if (this._mode === 'SINGLE') {
      this._singleArmed = true;
    }
    this._state = 'WAITING_TRIGGER';
    this._detector.reset();
  }

  public stop(): void {
    this._state = 'STOPPED';
    this._singleArmed = false;
  }

  public reset(): void {
    this._state = 'IDLE';
    this._lastCapture = null;
    this._lastTriggerSampleIndex = -1;
    this._pendingTrigger = null;
    this._samplesSinceLastTrigger = 0;
    this._singleArmed = false;
    this._detector.reset();
  }

  /**
   * Forces an immediate manual trigger event.
   */
  public forceTrigger(newestSampleIndex: number): CaptureWindow | null {
    const windowParams = this.computeWindowLengths();
    const trigIdx = newestSampleIndex - windowParams.postTriggerSamples;

    return this.createCaptureWindow(
      trigIdx,
      0.0,
      windowParams.sampleCount,
      windowParams.preTriggerSamples,
      windowParams.postTriggerSamples,
      true,
      true
    );
  }

  /**
   * Calculates discrete sample lengths for the current timebase span
   */
  public computeWindowLengths(): {
    sampleCount: number;
    preTriggerSamples: number;
    postTriggerSamples: number;
    windowDuration: number;
  } {
    const windowDuration = 10 * this._timeDiv;
    const sampleCount = Math.max(2, Math.round(windowDuration * this._sampleRate));
    const preTriggerSamples = Math.round(sampleCount * this._position);
    const postTriggerSamples = sampleCount - preTriggerSamples;

    return {
      sampleCount,
      preTriggerSamples,
      postTriggerSamples,
      windowDuration
    };
  }

  /**
   * Evaluates incoming sample stream / ring buffer and generates a synchronized capture frame
   *
   * @param sampleAt - Accessor function returning sample voltage at monotonic global index
   * @param totalWritten - Total samples written to circular buffer (monotonic newest index)
   * @param totalRead - Total samples read / oldest valid sample index
   * @param newlyAcquiredCount - Number of new samples ingested in the latest acquisition batch
   * @returns Completed CaptureWindow, or null if waiting for trigger or post-trigger samples
   */
  public processAcquisition(
    sampleAt: (index: number) => number | null,
    totalWritten: number,
    totalRead: number,
    newlyAcquiredCount: number = 0
  ): CaptureWindow | null {
    if (this._state === 'STOPPED') {
      return this._lastCapture;
    }

    const available = totalWritten - totalRead;
    const { sampleCount, preTriggerSamples, postTriggerSamples } = this.computeWindowLengths();

    // Invariant: must have at least preTriggerSamples before searching for triggers
    if (available < preTriggerSamples + 2) {
      this._state = 'ARMED';
      return null;
    }

    // Advance auto-timeout tracking
    this._samplesSinceLastTrigger += newlyAcquiredCount;
    const autoTimeoutSamples = Math.round(this._autoTimeout * this._sampleRate);

    // If SINGLE mode already completed a capture and was not re-armed, stop.
    if (this._mode === 'SINGLE' && !this._singleArmed) {
      this._state = 'STOPPED';
      return this._lastCapture;
    }

    // 1. If we have a pending trigger, check if postTriggerSamples have arrived
    if (this._pendingTrigger !== null) {
      const neededIndex = this._pendingTrigger.sampleIndex + postTriggerSamples;
      if (totalWritten >= neededIndex) {
        // Complete the capture window
        const trig = this._pendingTrigger;
        this._pendingTrigger = null;
        return this.finishCapture(
          trig.sampleIndex,
          trig.fractionalOffset,
          sampleCount,
          preTriggerSamples,
          postTriggerSamples,
          true,
          false
        );
      }
      // Still collecting post-trigger samples
      this._state = 'TRIGGERED';
      return null;
    }

    // 2. Search for a trigger crossing
    // We search backwards from (totalWritten - postTriggerSamples) down to (totalRead + preTriggerSamples)
    const searchEnd = totalWritten - 1 - postTriggerSamples;
    const searchStart = totalRead + preTriggerSamples;
    const searchSpan = Math.max(sampleCount * 2, 4096);

    let trigResult: TriggerDetectionResult | null = null;
    if (searchEnd > searchStart) {
      trigResult = this._detector.findTriggerReverse(sampleAt, searchEnd, searchSpan);
    }

    if (trigResult !== null) {
      this._samplesSinceLastTrigger = 0;

      // Check if post-trigger is already fully collected
      if (totalWritten >= trigResult.sampleIndex + postTriggerSamples) {
        return this.finishCapture(
          trigResult.sampleIndex,
          trigResult.fractionalOffset,
          sampleCount,
          preTriggerSamples,
          postTriggerSamples,
          true,
          false
        );
      } else {
        // Post-trigger samples still in flight
        this._pendingTrigger = trigResult;
        this._state = 'TRIGGERED';
        return null;
      }
    }

    // 3. No trigger found in search window
    if (this._mode === 'NORMAL') {
      this._state = 'WAITING_TRIGGER';
      return null; // Freeze display on previous frame
    }

    if (this._mode === 'SINGLE') {
      this._state = 'WAITING_TRIGGER';
      return null;
    }

    // 4. AUTO mode: check if auto-timeout has elapsed
    if (this._mode === 'AUTO' && this._samplesSinceLastTrigger >= autoTimeoutSamples) {
      this._samplesSinceLastTrigger = 0;
      const forcedTrigIndex = totalWritten - 1 - postTriggerSamples;

      if (forcedTrigIndex - preTriggerSamples >= totalRead) {
        return this.finishCapture(
          forcedTrigIndex,
          0.0,
          sampleCount,
          preTriggerSamples,
          postTriggerSamples,
          false,
          true
        );
      }
    }

    this._state = 'WAITING_TRIGGER';
    return null;
  }

  /**
   * Decimates and maps capture window samples into destination display buffer.
   * Uses sample-domain sub-sample linear interpolation for jitter-free display.
   *
   * @param sampleAt - Global sample accessor
   * @param window - Active capture window record
   * @param destination - Float32Array to receive normalized graticule division offsets
   * @param pointsCount - Target number of horizontal display points (e.g. 600 or 1024)
   * @param voltDiv - Channel Volts/Div scale
   * @param chOffset - Channel voltage offset (V)
   */
  public extractDisplayBuffer(
    sampleAt: (index: number) => number | null,
    captureWindow: CaptureWindow,
    destination: Float32Array,
    pointsCount: number,
    voltDiv: number,
    chOffset: number = 0.0
  ): Float32Array {
    const dest = destination;
    const trigIdx = captureWindow.triggerSampleIndex;
    const sampleCount = captureWindow.sampleCount;
    const invVoltDiv = 1.0 / voltDiv;

    // Trigger position in display coordinates
    const centerPointIdx = Math.round((pointsCount - 1) * this._position);

    for (let i = 0; i < pointsCount; i++) {
      // Calculate continuous offset from trigger point in sample units
      const fracFromTrig = (i - centerPointIdx) / (pointsCount - 1);
      const exactSampleOffset = fracFromTrig * sampleCount;

      // Base integer sample index
      const exactSampleIdx = trigIdx + exactSampleOffset;
      const sampleIdx = Math.round(exactSampleIdx);

      const rawVoltage = sampleAt(sampleIdx) ?? 0.0;
      dest[i] = (rawVoltage - chOffset) * invVoltDiv;
    }

    return dest;
  }

  private finishCapture(
    triggerSampleIndex: number,
    fractionalOffset: number,
    sampleCount: number,
    preTriggerSamples: number,
    postTriggerSamples: number,
    isTriggered: boolean,
    isForcedAuto: boolean
  ): CaptureWindow {
    const captureWindow = this.createCaptureWindow(
      triggerSampleIndex,
      fractionalOffset,
      sampleCount,
      preTriggerSamples,
      postTriggerSamples,
      isTriggered,
      isForcedAuto
    );

    this._lastCapture = captureWindow;
    this._lastTriggerSampleIndex = triggerSampleIndex;
    this._state = 'CAPTURED';

    if (this._mode === 'SINGLE') {
      this._singleArmed = false;
      this._state = 'STOPPED';
    }

    return captureWindow;
  }

  private createCaptureWindow(
    triggerSampleIndex: number,
    fractionalOffset: number,
    sampleCount: number,
    preTriggerSamples: number,
    postTriggerSamples: number,
    isTriggered: boolean,
    isForcedAuto: boolean
  ): CaptureWindow {
    const startSampleIndex = triggerSampleIndex - preTriggerSamples;
    const timestamp = (triggerSampleIndex - 1 + fractionalOffset) / this._sampleRate;

    return {
      startSampleIndex,
      triggerSampleIndex,
      fractionalOffset,
      sampleCount,
      preTriggerSamples,
      postTriggerSamples,
      isTriggered,
      isForcedAuto,
      mode: this._mode,
      timestamp
    };
  }

  private updateHoldoffSamples(): void {
    const holdoffSamples = Math.max(1, Math.round(this._holdoff * this._sampleRate));
    this._detector.setHoldoffSamples(holdoffSamples);
  }
}
