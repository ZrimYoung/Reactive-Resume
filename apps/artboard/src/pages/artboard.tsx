import type { CustomFont } from "@reactive-resume/utils";
import { fonts as googleFonts } from "@reactive-resume/utils";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Outlet } from "react-router";

import { fontCssString, selectedFontStyle, uploadedFontCss } from "../fonts/local-fonts";
import { useArtboardStore } from "../store/artboard";
import { getPageDimensions } from "../utils/resume";

export const ArtboardPage = () => {
  const resume = useArtboardStore((state) => state.resume);
  const name = resume.basics.name;
  const metadata = useArtboardStore((state) => state.resume.metadata);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  const [fontsSettled, setFontsSettled] = useState(false);
  const [cacheSettled, setCacheSettled] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [cachedFontCSS, setCachedFontCSS] = useState("");
  const [fontRevision, setFontRevision] = useState(0);
  const variantKey = metadata.typography.font.variants.join(",");
  const isCatalogFont =
    googleFonts.some((font) => font.family === metadata.typography.font.family) &&
    !customFonts.some(
      (font) =>
        (font as CustomFont & { fontFamily?: string }).fontFamily ===
          metadata.typography.font.family || font.family === metadata.typography.font.family,
    );

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const fetchFonts = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      setFontsSettled(false);
      const timeout = setTimeout(() => {
        request.abort();
      }, 5000);
      try {
        const response = await fetch("/api/fonts/user/local-user-id", { signal: request.signal });
        if (response.ok && active && !request.signal.aborted) {
          const fonts = (await response.json()) as CustomFont[];
          setCustomFonts(fonts);
        }
      } catch {
        // System and bundled fonts remain available if the local font service is unavailable.
      } finally {
        clearTimeout(timeout);
        if (active && controller === request) setFontsSettled(true);
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === window.parent &&
        event.data?.type === "REFETCH_FONTS"
      ) {
        setFontRevision((value) => value + 1);
        void fetchFonts();
      }
    };
    window.addEventListener("message", onMessage);
    void fetchFonts();
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!isCatalogFont) {
      setCacheSettled(true);
      setCacheStatus("ready");
      setCachedFontCSS("");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);
    setCacheSettled(false);
    setCacheStatus("loading");
    setCachedFontCSS("");
    const query = new URLSearchParams({
      family: metadata.typography.font.family,
      variants: variantKey,
      subset: metadata.typography.font.subset,
    });
    void fetch(`/api/fonts/offline/style.css?${query}&revision=${fontRevision}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) {
          const css = await response.text();
          if (!controller.signal.aborted) {
            setCachedFontCSS(css);
            setCacheStatus(
              response.headers.get("X-Offline-Font-Status") === "ready" ? "ready" : "missing",
            );
          }
        } else if (!controller.signal.aborted) {
          setCacheStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCacheStatus("error");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setCacheSettled(true);
      });
    // A timed-out optional font request must not leave the canvas permanently unready.
    const onAbort = () => {
      setCacheStatus("error");
      setCacheSettled(true);
    };
    controller.signal.addEventListener("abort", onAbort);
    return () => {
      controller.signal.removeEventListener("abort", onAbort);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    metadata.typography.font.family,
    variantKey,
    metadata.typography.font.subset,
    fontRevision,
    isCatalogFont,
  ]);

  const customFontCSS = useMemo(
    () => uploadedFontCss(customFonts, window.location.origin),
    [customFonts],
  );

  // 动态生成 CSS 变量，替代 useEffect 的行内样式设置，允许 Custom CSS 覆盖
  const themeVariablesCSS = useMemo(() => {
    const fontSize = metadata.typography.font.size;
    const lineHeight = metadata.typography.lineHeight;
    const pageMargin = metadata.page.margin;
    const themeText = metadata.theme.text;
    const themePrimary = metadata.theme.primary;
    const themeBackground = metadata.theme.background;

    return `
      :root {
        font-size: ${fontSize}px;
        line-height: ${lineHeight};
        --font-size: ${fontSize}px;
        --line-height: ${lineHeight};
        --margin: ${pageMargin}px;
        --color-foreground: ${themeText};
        --color-primary: ${themePrimary};
        --color-background: ${themeBackground};
      }
    `;
  }, [metadata]);

  // 动态字体等级映射，确保面板字号控制对 Tailwind 文本类生效
  const dynamicFontScale = useMemo(() => {
    // 近似 Tailwind 比例：xs 0.75, sm 0.875, base 1, lg 1.125, xl 1.25, 2xl 1.5
    // 使用 !important 确保覆盖 Tailwind 默认样式；Custom CSS 需同样使用 !important 才能覆盖此设置
    return `
    .text-xs { font-size: calc(var(--font-size) * 0.75) !important; }
    .text-sm { font-size: calc(var(--font-size) * 0.875) !important; }
    .text-base { font-size: var(--font-size) !important; }
    .text-lg { font-size: calc(var(--font-size) * 1.125) !important; }
    .text-xl { font-size: calc(var(--font-size) * 1.25) !important; }
    .text-2xl { font-size: calc(var(--font-size) * 1.5) !important; }
    `;
  }, [metadata.typography.font.size]);

  // 为打印注入 @page 规则，允许浏览器自动分页并使用与设置一致的纸张尺寸
  const printPageSizeCSS = useMemo(() => {
    const page = metadata.page;
    const { width: widthMm, height: heightMm } = getPageDimensions(page);

    return `
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
@media print { html, body { margin: 0; } }
`;
  }, [metadata.page]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.artboardReady = "false";
    root.dataset.resumeFonts = "loading";
    root.dataset.resumeFontFamily = metadata.typography.font.family;
    if (!fontsSettled || !cacheSettled) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve();
        }),
      );
    const ready = async () => {
      await frame();
      const fonts = document.fonts;
      let fontStatus = cacheStatus === "loading" ? "error" : cacheStatus;
      // Older embedded browsers and DOM test environments may not expose the Font Loading API.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (fonts) {
        const font = `${metadata.typography.font.size}px ${JSON.stringify(metadata.typography.font.family)}`;
        await Promise.race([
          Promise.all([
            fonts.load(font, "Resume 简历"),
            fonts.load(`700 ${font}`, "Resume 简历"),
            fonts.load(`italic ${font}`, "Resume 简历"),
            fonts.load(`italic 700 ${font}`, "Resume 简历"),
            fonts.ready,
          ]).catch(() => {
            fontStatus = "error";
          }),
          new Promise<void>((resolve) => {
            timeout = setTimeout(() => {
              fontStatus = "error";
              resolve();
            }, 5000);
          }),
        ]);
        clearTimeout(timeout);
      }
      await frame();
      await frame();
      if (active) root.dataset.resumeFonts = fontStatus;
      if (active && document.querySelector('[data-page="1"]')) root.dataset.artboardReady = "true";
    };
    void ready();
    return () => {
      active = false;
      clearTimeout(timeout);
      root.dataset.artboardReady = "false";
    };
  }, [
    resume,
    fontsSettled,
    cacheSettled,
    cacheStatus,
    customFontCSS,
    cachedFontCSS,
    metadata.typography.font,
  ]);

  // 确保自定义 CSS 始终位于 <head> 最后，获得最高覆盖优先级
  useEffect(() => {
    const moveCustomCssToTail = () => {
      const styleEl = document.querySelector("#custom-css");
      if (styleEl?.parentElement) {
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
      <Helmet defer={false}>
        <title>{name} | Reactive Resume</title>
        {/* 基础 CSS 变量定义，优先级最低 */}
        <style id="theme-variables">{themeVariablesCSS}</style>
        {/* 动态字体类定义 */}
        <style id="dynamic-font-scale">{dynamicFontScale}</style>
        {/* 打印页面尺寸定义 */}
        <style id="print-page-size">{printPageSizeCSS}</style>
        {customFontCSS && <style id="custom-font-css">{customFontCSS}</style>}
        {cachedFontCSS && <style id="cached-font-css">{cachedFontCSS}</style>}
        <style id="main-font-family">
          {`:root { --font-family: ${fontCssString(metadata.typography.font.family)}, "IBM Plex Sans", Arial, "Microsoft YaHei", sans-serif; }
          [data-page] { font-weight: ${selectedFontStyle(metadata.typography.font.variants).weight}; font-style: ${selectedFontStyle(metadata.typography.font.variants).style}; }`}
        </style>
        {metadata.css.visible && <style id="custom-css">{metadata.css.value}</style>}
      </Helmet>

      <Outlet />
    </>
  );
};
