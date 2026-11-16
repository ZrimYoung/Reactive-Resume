/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush the real transform component's effects. */
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { bindCanvasInteractions } from "./canvas-interactions";

let host: HTMLDivElement;
let root: Root;
let unbind: (() => void) | undefined;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  unbind?.();
  unbind = undefined;
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("real react-zoom-pan-pinch imperative ref", () => {
  it.each([true, false])(
    "zooms and updates the actual content transform with wheelPanning=%s",
    async (wheelPanning) => {
      const ref = createRef<ReactZoomPanPinchRef>();
      await act(async () => {
        root.render(
          <TransformWrapper
            ref={ref}
            minScale={0.1}
            maxScale={2}
            initialPositionX={-20}
            initialPositionY={30}
            limitToBounds={false}
            wheel={{ wheelDisabled: wheelPanning }}
            panning={{ wheelPanning }}
          >
            <TransformComponent>
              <div>Canvas content</div>
            </TransformComponent>
          </TransformWrapper>,
        );
      });
      const transform = ref.current;
      if (!transform) throw new Error("The real transform ref was not initialized");
      // v3.7's declaration includes `state`, but its imperative handle returns only controls and instance.
      expect(Reflect.has(transform, "state")).toBe(false);
      const wrapper = transform.instance.wrapperComponent;
      const content = transform.instance.contentComponent;
      if (!wrapper || !content) throw new Error("The real transform DOM was not initialized");
      wrapper.getBoundingClientRect = () =>
        ({ left: 40, top: 60, width: 600, height: 300 }) as DOMRect;
      unbind = bindCanvasInteractions(() => ref.current);

      for (const key of ["ctrlKey", "metaKey"] as const) {
        transform.setTransform(-20, 30, 1, 0);
        const before = { ...transform.instance.transformState };
        const pointX = (200 - before.positionX) / before.scale;
        const pointY = (100 - before.positionY) / before.scale;
        const event = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 240,
          clientY: 160,
          deltaY: -100,
          [key]: true,
        });
        await act(async () => {
          wrapper.dispatchEvent(event);
        });
        const after = transform.instance.transformState;
        expect(event.defaultPrevented).toBe(true);
        expect(after.scale).toBeCloseTo(Math.exp(0.2));
        expect(pointX * after.scale + after.positionX).toBeCloseTo(200);
        expect(pointY * after.scale + after.positionY).toBeCloseTo(100);
        expect(content.style.transform).toContain(`scale(${after.scale})`);
      }
    },
  );
});
