import type { SectionKey } from "@reactive-resume/schema";
import type { Template } from "@reactive-resume/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { MM_TO_PX, Page } from "../components/page";
import { useArtboardStore } from "../store/artboard";
import { getTemplate } from "../templates";
import {
  bindCanvasInteractions,
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
} from "../utils/canvas-interactions";
import { getPageDimensions } from "../utils/resume";

export const BuilderLayout = () => {
  const [wheelPanning, setWheelPanning] = useState(true);

  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  const layout = useArtboardStore((state) => state.resume.metadata.layout);
  const page = useArtboardStore((state) => state.resume.metadata.page);
  const dimensions = getPageDimensions(page);
  const contentWidth =
    layout.length * dimensions.width * MM_TO_PX + Math.max(0, layout.length - 1) * 48;
  const contentHeight = dimensions.height * MM_TO_PX;

  const fitView = useCallback(() => {
    const scale = Math.max(
      MIN_CANVAS_SCALE,
      Math.min(
        1,
        (window.innerWidth - 48) / contentWidth,
        (window.innerHeight - 64) / contentHeight,
      ),
    );
    transformRef.current?.centerView(scale, 0);
  }, [contentWidth, contentHeight]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitView);
    window.addEventListener("resize", fitView);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitView);
    };
  }, [fitView]);
  const template = useArtboardStore((state) => state.resume.metadata.template || "rhyhorn");

  const Template = useMemo(() => getTemplate(template as Template), [template]);

  useEffect(() => bindCanvasInteractions(() => transformRef.current), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !event.data)
        return;

      if (event.data.type === "ZOOM_IN") transformRef.current?.zoomIn(0.2);
      if (event.data.type === "ZOOM_OUT") transformRef.current?.zoomOut(0.2);
      if (event.data.type === "CENTER_VIEW") fitView();
      if (event.data.type === "RESET_VIEW") {
        fitView();
      }
      if (event.data.type === "TOGGLE_PAN_MODE") {
        setWheelPanning(event.data.panMode);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [fitView]);

  return (
    <TransformWrapper
      ref={transformRef}
      maxScale={MAX_CANVAS_SCALE}
      minScale={MIN_CANVAS_SCALE}
      initialScale={1}
      limitToBounds={false}
      wheel={{ wheelDisabled: wheelPanning }}
      panning={{ wheelPanning: wheelPanning }}
      onInit={fitView}
    >
      <TransformComponent
        wrapperClass="!w-screen !h-screen"
        contentClass="grid items-start justify-center gap-12 pointer-events-none"
        contentStyle={{
          width: `${contentWidth}px`,
          gridTemplateColumns: `repeat(${layout.length}, 1fr)`,
        }}
      >
        <AnimatePresence>
          {layout.map((columns, pageIndex) => (
            <motion.div
              key={pageIndex}
              layout
              initial={{ opacity: 0, x: -200, y: 0 }}
              animate={{ opacity: 1, x: 0, transition: { delay: pageIndex * 0.3 } }}
              exit={{ opacity: 0, x: -200 }}
            >
              <Page mode="builder" pageNumber={pageIndex + 1}>
                <Template isFirstPage={pageIndex === 0} columns={columns as SectionKey[][]} />
              </Page>
            </motion.div>
          ))}
        </AnimatePresence>
      </TransformComponent>
    </TransformWrapper>
  );
};
