/**
 * Storage Layer (Wave 6+)
 *
 * Persistence for oscilloscope configuration, experiment states,
 * session recordings, and calibration tables.
 */

export interface IStateStorage<T> {
  save(key: string, data: T): Promise<void>;
  load(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
}
