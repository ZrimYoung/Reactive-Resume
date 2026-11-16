import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

export const MIN_CANVAS_SCALE = 0.1;
export const MAX_CANVAS_SCALE = 2;

type CanvasTransform = Pick<ReactZoomPanPinchRef, "setTransform"> & {
  instance: Pick<ReactZoomPanPinchRef["instance"], "wrapperComponent" | "transformState">;
};

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );

/** Capture modified wheels before the transform library can also pan or zoom. */
export function bindCanvasInteractions(getTransform: () => CanvasTransform | null) {
  const onWheel = (event: WheelEvent) => {
    const transform = getTransform();
    const wrapper = transform?.instance.wrapperComponent;
    if (
      !transform ||
      !wrapper ||
      !(event.target instanceof Node) ||
      !wrapper.contains(event.target) ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0 ||
      editable(event.target)
    )
      return;

    // This also prevents browser zoom when the canvas has reached a scale limit.
    event.preventDefault();
    event.stopPropagation();
    const { scale, positionX, positionY } = transform.instance.transformState;
    let unit = 1;
    if (event.deltaMode === 1) unit = 16;
    if (event.deltaMode === 2) unit = Math.max(1, wrapper.clientHeight);
    const delta = event.deltaY * unit;
    const nextScale = Math.min(
      MAX_CANVAS_SCALE,
      Math.max(MIN_CANVAS_SCALE, scale * Math.exp(-delta * 0.002)),
    );
    if (nextScale === scale) return;
    const bounds = wrapper.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const ratio = nextScale / scale;
    // The content point under the pointer stays under it after the scale changes.
    transform.setTransform(x - (x - positionX) * ratio, y - (y - positionY) * ratio, nextScale, 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key !== "?" ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Some IMEs signal composition only with legacy code 229.
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      editable(event.target) ||
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
      )
    )
      return;
    event.preventDefault();
    window.parent.postMessage({ type: "ARTBOARD_SHORTCUT_HELP" }, window.location.origin);
  };

  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("keydown", onKeyDown);
  };
}
