import { Oscilloscope } from '../../domain/entities/Oscilloscope';
import {
  OscilloscopeCommand,
  validateCommand
} from '../../domain/commands/commands';
import { EventBus, IEventBus } from '../events/EventBus';
import { OscilloscopeStateEnum } from '../../domain/types';

export class OscilloscopeService {
  private readonly _oscilloscope: Oscilloscope;
  private readonly _eventBus: IEventBus;

  constructor(oscilloscope?: Oscilloscope, eventBus?: IEventBus) {
    this._oscilloscope = oscilloscope ?? new Oscilloscope();
    this._eventBus = eventBus ?? new EventBus();
  }

  public get oscilloscope(): Oscilloscope {
    return this._oscilloscope;
  }

  public get eventBus(): IEventBus {
    return this._eventBus;
  }

  public getState(): OscilloscopeStateEnum {
    return this._oscilloscope.state;
  }

  /**
   * Execute a typed oscilloscope command
   */
  public execute(command: OscilloscopeCommand): void {
    // 1. Validate command invariants
    validateCommand(command);

    // 2. Dispatch to domain aggregate
    switch (command.type) {
      case 'RUN':
        this._oscilloscope.run();
        break;

      case 'STOP':
        this._oscilloscope.stop();
        break;

      case 'SET_TIME_DIV':
        this._oscilloscope.setTimeDiv(command.timeDiv);
        break;

      case 'SET_VOLT_DIV':
        this._oscilloscope.setVoltDiv(command.channelId, command.voltDiv);
        break;

      case 'SET_TRIGGER_LEVEL':
        this._oscilloscope.setTriggerLevel(command.level);
        break;

      case 'SET_TRIGGER_MODE':
        this._oscilloscope.setTriggerMode(command.mode);
        break;

      case 'ENABLE_CHANNEL':
        this._oscilloscope.enableChannel(command.channelId);
        break;

      case 'DISABLE_CHANNEL':
        this._oscilloscope.disableChannel(command.channelId);
        break;
    }

    // 3. Collect domain events and publish to EventBus
    const events = this._oscilloscope.pullEvents();
    this._eventBus.publishAll(events);
  }

  public executeCommand(command: OscilloscopeCommand): void {
    this.execute(command);
  }
}
