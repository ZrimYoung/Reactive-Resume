import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindCanvasInteractions } from "./canvas-interactions";

let wrapper: HTMLDivElement;
let unbind: () => void;
let state: { scale: number; positionX: number; positionY: number; previousScale: number };
let setTransform: ReturnType<typeof vi.fn>;

beforeEach(() => {
  wrapper = document.createElement("div");
  document.body.append(wrapper);
  Object.defineProperty(wrapper, "clientHeight", { value: 300 });
  wrapper.getBoundingClientRect = () => ({ left: 40, top: 60, width: 600, height: 300 }) as DOMRect;
  state = { scale: 1, positionX: -20, positionY: 30, previousScale: 1 };
  setTransform = vi.fn((positionX: number, positionY: number, scale: number) => {
    Object.assign(state, { positionX, positionY, scale });
  });
  unbind = bindCanvasInteractions(() => ({
    setTransform,
    instance: { wrapperComponent: wrapper, transformState: state },
  }));
});
afterEach(() => {
  unbind();
  wrapper.remove();
  vi.restoreAllMocks();
});
const wheel = (target: Element, init: WheelEventInit) => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 240,
    clientY: 160,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};
const ask = (target: Element, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true, ...init }),
  );

describe("canvas wheel gestures", () => {
  it.each(["ctrlKey", "metaKey"] as const)(
    "anchors %s+wheel to the pointer and prevents both browser zoom and duplicate panning",
    (key) => {
      const pan = vi.fn();
      wrapper.addEventListener("wheel", pan);
      const contentX = (200 - state.positionX) / state.scale;
      const contentY = (100 - state.positionY) / state.scale;
      const event = wheel(wrapper, { deltaY: -100, [key]: true });
      expect(event.defaultPrevented).toBe(true);
      expect(pan).not.toHaveBeenCalled();
      expect(state.scale).toBeGreaterThan(1);
      expect(contentX * state.scale + state.positionX).toBeCloseTo(200);
      expect(contentY * state.scale + state.positionY).toBeCloseTo(100);
    },
  );

  it("keeps plain wheels, outside wheels and editable targets available to their normal handlers", () => {
    expect(wheel(wrapper, { deltaY: -100 }).defaultPrevented).toBe(false);
    expect(wheel(document.body, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(false);
    const input = document.createElement("input");
    wrapper.append(input);
    expect(wheel(input, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("accumulates fine trackpad deltas, normalizes line deltas and still prevents browser zoom at a scale limit", () => {
    wheel(wrapper, { deltaY: -1, ctrlKey: true });
    wheel(wrapper, { deltaY: -1, ctrlKey: true });
    expect(state.scale).toBeCloseTo(Math.exp(0.004));
    state.scale = 1;
    wheel(wrapper, { deltaY: -1, deltaMode: 1, ctrlKey: true });
    expect(state.scale).toBeCloseTo(Math.exp(0.032));
    state.scale = 2;
    setTransform.mockClear();
    expect(wheel(wrapper, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(setTransform).not.toHaveBeenCalled();
  });
});

describe("canvas shortcut help forwarding", () => {
  it("forwards ? to the current origin, but leaves typing and IME composition alone", () => {
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(vi.fn());
    ask(wrapper);
    expect(post).toHaveBeenCalledWith({ type: "ARTBOARD_SHORTCUT_HELP" }, window.location.origin);
    const input = document.createElement("input");
    wrapper.append(input);
    ask(input);
    ask(wrapper, { isComposing: true });
    ask(wrapper, { keyCode: 229 });
    ask(wrapper, { repeat: true });
    expect(post).toHaveBeenCalledTimes(1);
    unbind();
    ask(wrapper);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
