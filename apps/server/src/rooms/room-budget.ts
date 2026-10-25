import { ServerError } from "colyseus";
import { ROOM_LIMIT, SERVER_FULL_MESSAGE } from "@vibewars/game-protocol";

/**
 * How many rooms one server holds at once, match and lobby rooms together
 * (#114, SECURITY.md gap 6). Every room costs a tick or a timer, and one
 * client opening 1 500 rooms pushed every match past its tick budget.
 *
 * One budget per server, made by `createGameServer`, never a module
 * global: the tests run several servers in one process.
 */
export interface RoomBudget {
  /** Take a slot; false when every slot is taken. */
  tryAcquire(): boolean;
  /** Give one back. Never below none. */
  release(): void;
  readonly inUse: number;
}

export function createRoomBudget(max: number): RoomBudget {
  let inUse = 0;
  return {
    tryAcquire() {
      if (inUse >= max) {
        return false;
      }
      inUse += 1;
      return true;
    },
    release() {
      inUse = Math.max(0, inUse - 1);
    },
    get inUse() {
      return inUse;
    },
  };
}

/**
 * One room's hold on a slot: taken first thing in `onCreate`, given back
 * once, whether the room is disposed or its creation failed after the
 * slot was taken.
 */
export class RoomSlot {
  #held = false;
  readonly #budget: RoomBudget;

  public constructor(budget: RoomBudget) {
    this.#budget = budget;
  }

  /** Take the slot, or refuse the room with `ROOM_LIMIT`. */
  public take(): void {
    if (!this.#budget.tryAcquire()) {
      throw new ServerError(ROOM_LIMIT, SERVER_FULL_MESSAGE);
    }
    this.#held = true;
  }

  public release(): void {
    if (this.#held) {
      this.#held = false;
      this.#budget.release();
    }
  }
}
