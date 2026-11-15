import { useTheme } from "@reactive-resume/hooks";
import { cn } from "@reactive-resume/utils";

import { useArtboardStore } from "../store/artboard";
import { getPageDimensions } from "../utils/resume";

type Props = {
  mode?: "preview" | "builder";
  pageNumber: number;
  children: React.ReactNode;
};

export const MM_TO_PX = 3.78;

export const Page = ({ mode = "preview", pageNumber, children }: Props) => {
  const { isDarkMode } = useTheme();

  const page = useArtboardStore((state) => state.resume.metadata.page);

  // 计算页面显示尺寸（考虑自定义尺寸与横/竖方向）
  const { width: displayWidthMm, height: displayHeightMm } = getPageDimensions(page);

  return (
    <div
      data-page={pageNumber}
      data-mode={mode}
      className={cn("relative bg-background text-foreground", mode === "builder" && "shadow-2xl")}
      style={{
        fontFamily: "var(--font-family)",
        width: `${displayWidthMm * MM_TO_PX}px`,
        // 维持页面视觉最小高度（考虑自定义尺寸与横竖方向）；允许内容在预览时自然溢出，避免被裁剪
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
