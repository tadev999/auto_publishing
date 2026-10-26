import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioStage } from '../stage/StudioStage';
import type { Character } from '../stage/Character';
import { COFFEE_SEATS } from '../stage/studioMap';

type TestCharacter = Pick<Character, 'id' | 'status' | 'busy' | 'seated' | 'path' | 'onArrive' | 'sit' | 'say' | 'x' | 'y'>;

function character(id: string, status: Character['status'] = 'idle'): TestCharacter {
  return {
    id, status, busy: false, seated: 'desk', path: [], onArrive: null, x: 0, y: 0,
    say: vi.fn(),
    sit: vi.fn(function (this: TestCharacter, style: Character['seated']) { this.seated = style; }),
  };
}

describe('idle coffee breaks', () => {
  let stage: StudioStage;
  let chars: Map<string, TestCharacter>;
  let arrivals: Map<string, () => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    stage = new StudioStage();
    chars = new Map(['planner', 'writer', 'critic', 'producer', 'publisher'].map((id) => [id, character(id)]));
    Reflect.set(stage, 'chars', chars);
    arrivals = new Map();
    vi.spyOn(stage, 'walkAgentTo').mockImplementation((id, _goal, onArrive) => {
      if (onArrive) arrivals.set(id, onArrive);
    });
  });

  afterEach(() => {
    stage.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reserves two distinct seats and rejects busy or non-idle agents', () => {
    chars.get('critic')!.status = 'working';
    chars.get('producer')!.status = 'rejected';
    chars.get('publisher')!.busy = true;
    for (const id of chars.keys()) stage.takeCoffeeBreak(id);
    expect(stage.walkAgentTo).toHaveBeenCalledTimes(2);
    expect(stage.walkAgentTo).toHaveBeenNthCalledWith(1, 'planner', COFFEE_SEATS[0], expect.any(Function));
    expect(stage.walkAgentTo).toHaveBeenNthCalledWith(2, 'writer', COFFEE_SEATS[1], expect.any(Function));
    expect(chars.get('critic')!.busy).toBe(false);
  });

  it('returns home after the break and enforces a cooldown', () => {
    stage.takeCoffeeBreak('planner');
    arrivals.get('planner')!();
    expect(chars.get('planner')!.seated).toBe('sofa');
    expect(chars.get('planner')!.status).toBe('idle');
    vi.advanceTimersByTime(30000);
    arrivals.get('planner')!();
    chars.get('planner')!.onArrive!();
    expect(chars.get('planner')!.seated).toBe('desk');
    expect(chars.get('planner')!.busy).toBe(false);
    vi.mocked(stage.walkAgentTo).mockClear();
    stage.takeCoffeeBreak('planner');
    expect(stage.walkAgentTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(45000);
    stage.takeCoffeeBreak('planner');
    expect(stage.walkAgentTo).toHaveBeenCalledTimes(1);
  });

  it('cancels only the character receiving work and removes its stale return timer', () => {
    stage.takeCoffeeBreak('planner');
    stage.takeCoffeeBreak('writer');
    arrivals.get('planner')!();
    arrivals.get('writer')!();
    const planner = chars.get('planner')!;
    Reflect.get(stage, 'cancelCoffeeBreak').call(stage, planner);
    planner.status = 'working';
    expect(planner.seated).toBe('desk');
    expect(planner.busy).toBe(false);
    expect(chars.get('writer')!.seated).toBe('sofa');
    vi.mocked(stage.walkAgentTo).mockClear();
    vi.advanceTimersByTime(30000);
    expect(stage.walkAgentTo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stage.walkAgentTo).mock.calls[0][0]).toBe('writer');
  });

  it('occasionally sends an idle character automatically and stops scheduling on destroy', () => {
    Reflect.get(stage, 'scheduleCoffeeBreak').call(stage);
    vi.advanceTimersByTime(19999);
    expect(stage.walkAgentTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15001);
    expect(stage.walkAgentTo).toHaveBeenCalledTimes(1);
    expect([...chars.values()].filter((char) => char.busy)).toHaveLength(1);
    stage.destroy();
    vi.mocked(stage.walkAgentTo).mockClear();
    vi.advanceTimersByTime(120000);
    expect(stage.walkAgentTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
