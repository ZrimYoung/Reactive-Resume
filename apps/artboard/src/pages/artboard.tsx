import type { CustomFont } from "@reactive-resume/utils";
import { fonts as googleFonts } from "@reactive-resume/utils";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Outlet } from "react-router";
import webfontloader from "webfontloader";

import { useArtboardStore } from "../store/artboard";

export const ArtboardPage = () => {
  const name = useArtboardStore((state) => state.resume.basics.name);
  const metadata = useArtboardStore((state) => state.resume.metadata);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  const fetchCustomFonts = async () => {
    try {
      const response = await fetch("/api/fonts/user/local-user-id");
      if (response.ok) {
        const fonts = (await response.json()) as CustomFont[];
        setCustomFonts(fonts);
      }
    } catch {
      // Artboard: Error fetching custom fonts
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "REFETCH_FONTS") {
        void fetchCustomFonts();
      }
    };

    window.addEventListener("message", handleMessage);

    // Initial fetch
    void fetchCustomFonts();

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    const family = metadata.typography.font.family;
    const isGoogleFont = googleFonts.some((font) => font.family === family);

    if (isGoogleFont) {
      const fontString = `${family}:wght@100;200;300;400;500;600;700;800;900`;
      webfontloader.load({ google: { families: [fontString] } });
    }
  }, [metadata.typography.font.family]);

  const customFontCSS = useMemo(() => {
    if (customFonts.length === 0) return "";

    type FontAny = { fontFamily?: string; family?: string; url: string; format: string };
    const fontCSS = customFonts
      .map((font) => {
        const { fontFamily, family, url, format } = font as FontAny;
        const familyName = fontFamily ?? family ?? "";

        if (!familyName || !url) return "";

        return `
@font-face {
  font-family: '${familyName}';
  src: url('${url}') format('${format}');
  font-display: swap;
  font-weight: normal;
  font-style: normal;
}`;
      })
      .filter(Boolean)
      .join("\n");

    return fontCSS;
  }, [customFonts]);

  // 动态字体等级映射，确保面板字号控制对 Tailwind 文本类生效
  const dynamicFontScale = useMemo(() => {
    const base = metadata.typography.font.size;
    // 近似 Tailwind 比例：xs 0.75, sm 0.875, base 1, lg 1.125, xl 1.25, 2xl 1.5
    return `
    :root { --font-size: ${base}px; }
    .text-xs { font-size: calc(var(--font-size) * 0.75) !important; }
    .text-sm { font-size: calc(var(--font-size) * 0.875) !important; }
    .text-base { font-size: var(--font-size) !important; }
    .text-lg { font-size: calc(var(--font-size) * 1.125) !important; }
    .text-xl { font-size: calc(var(--font-size) * 1.25) !important; }
    .text-2xl { font-size: calc(var(--font-size) * 1.5) !important; }
    `;
  }, [metadata.typography.font.size]);

  useEffect(() => {
    const fontSize = metadata.typography.font.size;
    const lineHeight = metadata.typography.lineHeight;
    const pageMargin = metadata.page.margin;
    const themeText = metadata.theme.text;
    const themePrimary = metadata.theme.primary;
    const themeBackground = metadata.theme.background;

    document.documentElement.style.setProperty("font-size", `${fontSize}px`);
    document.documentElement.style.setProperty("line-height", `${lineHeight}`);
    document.documentElement.style.setProperty("--margin", `${pageMargin}px`);
    document.documentElement.style.setProperty("--font-size", `${fontSize}px`);
    document.documentElement.style.setProperty("--line-height", `${lineHeight}`);
    document.documentElement.style.setProperty("--color-foreground", themeText);
    document.documentElement.style.setProperty("--color-primary", themePrimary);
    document.documentElement.style.setProperty("--color-background", themeBackground);
  }, [metadata]);

  // 确保自定义 CSS 始终位于 <head> 最后，获得最高覆盖优先级
  useEffect(() => {
    const moveCustomCssToTail = () => {
      const styleEl = document.querySelector("#custom-css");
      if (styleEl && styleEl.parentElement) {
        document.head.append(styleEl);
      }
    };
    moveCustomCssToTail();
  }, [metadata.css.value, metadata.css.visible]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const elements = [...document.querySelectorAll(`[data-page]`)];
    const hideIcons = metadata.typography.hideIcons;
    const underlineLinks = metadata.typography.underlineLinks;

    for (const el of elements) {
      el.classList.toggle("hide-icons", hideIcons);
      el.classList.toggle("underline-links", underlineLinks);
    }
  }, [metadata]);

  return (
    <>
      <Helmet>
        <title>{name} | Reactive Resume</title>
        {/* 先注入动态字体映射，再注入自定义 CSS（自定义 CSS 仍可用 !important 覆盖） */}
        <style id="dynamic-font-scale">{dynamicFontScale}</style>
        {customFontCSS && <style id="custom-font-css">{customFontCSS}</style>}
        <style id="main-font-family">
          {`:root { --font-family: "${metadata.typography.font.family}"; }`}
        </style>
        {metadata.css.visible && <style id="custom-css">{metadata.css.value}</style>}
      </Helmet>

      <Outlet />
    </>
  );
};
