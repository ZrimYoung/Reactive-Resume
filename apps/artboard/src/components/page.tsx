import { useTheme } from "@reactive-resume/hooks";
import { cn, pageSizeMap } from "@reactive-resume/utils";

import { useArtboardStore } from "../store/artboard";

type Props = {
  mode?: "preview" | "builder";
  pageNumber: number;
  children: React.ReactNode;
};

export const MM_TO_PX = 3.78;

export const Page = ({ mode = "preview", pageNumber, children }: Props) => {
  const { isDarkMode } = useTheme();

  const page = useArtboardStore((state) =>
    state.resume.metadata?.page || {
      format: "a4",
      margin: 18,
      orientation: "portrait",
      custom: { enabled: false, width: 210, height: 297 },
      options: { breakLine: true, pageNumbers: true },
    },
  );

  // 计算页面显示尺寸（考虑自定义尺寸与横/竖方向）
  const baseWidthMm = page.custom?.enabled ? page.custom.width : pageSizeMap[page.format].width;
  const baseHeightMm = page.custom?.enabled ? page.custom.height : pageSizeMap[page.format].height;
  const displayWidthMm = page.orientation === "landscape" ? baseHeightMm : baseWidthMm;
  const displayHeightMm = page.orientation === "landscape" ? baseWidthMm : baseHeightMm;

  return (
    <div
      data-page={pageNumber}
      className={cn("relative bg-background text-foreground", mode === "builder" && "shadow-2xl")}
      style={{
        fontFamily: "var(--font-family)",
        width: `${displayWidthMm * MM_TO_PX}px`,
        // 维持页面视觉高度（考虑自定义尺寸与横竖方向）
        minHeight: `${displayHeightMm * MM_TO_PX}px`,
      }}
    >
      {mode === "builder" && page.options.pageNumbers && (
        <div className={cn("absolute -top-7 left-0 font-bold", isDarkMode && "text-white")}>
          Page {pageNumber}
        </div>
      )}

      {children}

      {mode === "builder" && page.options.breakLine && (
        <div
          className="absolute inset-x-0 border-b border-dashed"
          style={{ top: `${displayHeightMm * MM_TO_PX}px` }}
        />
      )}
    </div>
  );
};
