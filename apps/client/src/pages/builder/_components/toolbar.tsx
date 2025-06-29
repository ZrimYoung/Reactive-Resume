import { t } from "@lingui/macro";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  CircleNotch,
  ClockClockwise,
  CubeFocus,
  FilePdf,
  Hash,
  LineSegment,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { Button, Separator, Toggle, Tooltip } from "@reactive-resume/ui";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

import { printResume, updateResume } from "@/client/services/resume";
import { useBuilderStore } from "@/client/stores/builder";
import { useResumeStore, useTemporalResumeStore } from "@/client/stores/resume";

const openInNewTab = (url: string) => {
  const win = window.open(url, "_blank");
  if (win) win.focus();
};

export const BuilderToolbar = () => {
  const [panMode, setPanMode] = useState<boolean>(true);

  const setValue = useResumeStore((state) => state.setValue);
  const undo = useTemporalResumeStore((state) => state.undo);
  const redo = useTemporalResumeStore((state) => state.redo);
  const frameRef = useBuilderStore((state) => state.frame.ref);

  const resume = useResumeStore((state) => state.resume);
  const pageOptions = useResumeStore((state) => state.resume.data?.metadata?.page?.options);

  const [isPrinting, setPrinting] = useState(false);

  const onPrint = async () => {
    try {
      setPrinting(true);

      const { id, data } = resume;
      await updateResume({ id, data });

      const { url } = await printResume({ id });

      openInNewTab(url);
    } catch (error) {
      toast.error(t`An error occurred while printing. Please try again.`);
    } finally {
      setPrinting(false);
    }
  };

  const onZoomIn = () => frameRef?.contentWindow?.postMessage({ type: "ZOOM_IN" }, "*");
  const onZoomOut = () => frameRef?.contentWindow?.postMessage({ type: "ZOOM_OUT" }, "*");
  const onResetView = () => frameRef?.contentWindow?.postMessage({ type: "RESET_VIEW" }, "*");
  const onCenterView = () => frameRef?.contentWindow?.postMessage({ type: "CENTER_VIEW" }, "*");
  const onTogglePanMode = () => {
    setPanMode(!panMode);
    frameRef?.contentWindow?.postMessage({ type: "TOGGLE_PAN_MODE", panMode: !panMode }, "*");
  };

  return (
    <motion.div className="fixed inset-x-0 bottom-0 mx-auto hidden py-6 text-center md:block">
      <div className="inline-flex items-center justify-center rounded-full bg-background px-4 shadow-xl">
        <Tooltip content={t`Undo`}>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-none"
            onClick={() => {
              undo();
            }}
          >
            <ArrowCounterClockwise />
          </Button>
        </Tooltip>

        <Tooltip content={t`Redo`}>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-none"
            onClick={() => {
              redo();
            }}
          >
            <ArrowClockwise />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="h-9" />

        <Tooltip content={panMode ? t`Scroll to Pan` : t`Scroll to Zoom`}>
          <Toggle className="rounded-none" pressed={panMode} onPressedChange={onTogglePanMode}>
            {panMode ? <ArrowsOutCardinal /> : <MagnifyingGlass />}
          </Toggle>
        </Tooltip>

        <Separator orientation="vertical" className="h-9" />

        <Tooltip content={t`Zoom In`}>
          <Button size="icon" variant="ghost" className="rounded-none" onClick={onZoomIn}>
            <MagnifyingGlassPlus />
          </Button>
        </Tooltip>

        <Tooltip content={t`Zoom Out`}>
          <Button size="icon" variant="ghost" className="rounded-none" onClick={onZoomOut}>
            <MagnifyingGlassMinus />
          </Button>
        </Tooltip>

        <Tooltip content={t`Reset Zoom`}>
          <Button size="icon" variant="ghost" className="rounded-none" onClick={onResetView}>
            <ClockClockwise />
          </Button>
        </Tooltip>

        <Tooltip content={t`Center Artboard`}>
          <Button size="icon" variant="ghost" className="rounded-none" onClick={onCenterView}>
            <CubeFocus />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="h-9" />

        <Tooltip content={t`Toggle Page Break Line`}>
          <Toggle
            className="rounded-none"
            pressed={pageOptions.breakLine}
            onPressedChange={(pressed) => {
              setValue("metadata.page.options.breakLine", pressed);
            }}
          >
            <LineSegment />
          </Toggle>
        </Tooltip>

        <Tooltip content={t`Toggle Page Numbers`}>
          <Toggle
            className="rounded-none"
            pressed={pageOptions.pageNumbers}
            onPressedChange={(pressed) => {
              setValue("metadata.page.options.pageNumbers", pressed);
            }}
          >
            <Hash />
          </Toggle>
        </Tooltip>

        <Separator orientation="vertical" className="h-9" />

        <Tooltip content={t`Download PDF`}>
          <Button
            size="icon"
            variant="ghost"
            disabled={isPrinting}
            className="rounded-none"
            onClick={onPrint}
          >
            {isPrinting ? <CircleNotch className="animate-spin" /> : <FilePdf />}
          </Button>
        </Tooltip>
      </div>
    </motion.div>
  );
};
