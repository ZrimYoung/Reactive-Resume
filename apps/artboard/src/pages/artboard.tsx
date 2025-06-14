import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Outlet } from "react-router";
import webfontloader from "webfontloader";

import { useArtboardStore } from "../store/artboard";

export const ArtboardPage = () => {
  const name = useArtboardStore((state) => state.resume.basics.name || "");
  const metadata = useArtboardStore((state) => state.resume.metadata || {});

  const fontString = useMemo(() => {
    const family = metadata.typography.font.family || "IBM Plex Serif";
    const variants = metadata.typography.font.variants.join(",") || "regular";
    const subset = metadata.typography.font.subset || "latin";

    return `${family}:${variants}:${subset}`;
  }, [metadata.typography.font]);

  useEffect(() => {
    webfontloader.load({
      google: { families: [fontString] },
      active: () => {
        const width = window.document.body.offsetWidth;
        const height = window.document.body.offsetHeight;
        const message = { type: "PAGE_LOADED", payload: { width, height } };
        window.postMessage(message, "*");
      },
    });
  }, [fontString]);

  // Font Size & Line Height
  useEffect(() => {
    const fontSize = metadata.typography.font.size || 14;
    const lineHeight = metadata.typography.lineHeight || 1.5;
    const pageMargin = metadata.page.margin || 18;
    const themeText = metadata.theme.text || "#000000";
    const themePrimary = metadata.theme.primary || "#dc2626";
    const themeBackground = metadata.theme.background || "#ffffff";

    document.documentElement.style.setProperty("font-size", `${fontSize}px`);
    document.documentElement.style.setProperty("line-height", `${lineHeight}`);

    document.documentElement.style.setProperty("--margin", `${pageMargin}px`);
    document.documentElement.style.setProperty("--font-size", `${fontSize}px`);
    document.documentElement.style.setProperty("--line-height", `${lineHeight}`);

    document.documentElement.style.setProperty("--color-foreground", themeText);
    document.documentElement.style.setProperty("--color-primary", themePrimary);
    document.documentElement.style.setProperty("--color-background", themeBackground);
  }, [metadata]);

  // Typography Options
  useEffect(() => {
    // eslint-disable-next-line unicorn/prefer-spread
    const elements = Array.from(document.querySelectorAll(`[data-page]`));

    const hideIcons = metadata.typography.hideIcons || false;
    const underlineLinks = metadata.typography.underlineLinks || true;

    for (const el of elements) {
      el.classList.toggle("hide-icons", hideIcons);
      el.classList.toggle("underline-links", underlineLinks);
    }
  }, [metadata]);

  return (
    <>
      <Helmet>
        <title>{name} | Reactive Resume</title>
        {metadata.css.visible && (
          <style id="custom-css" lang="css">
            {metadata.css.value}
          </style>
        )}
      </Helmet>

      <Outlet />
    </>
  );
};
