/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Older imported JSON can omit fields required by current DTO types. */

import { defaultResumeData, type ResumeData } from "@reactive-resume/schema";
import { pageSizeMap } from "@reactive-resume/utils";

/** Asset URLs from an earlier desktop launch must follow the current loopback port. */
export function refreshLocalAssetUrls<T>(data: T, publicUrl: string): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value: unknown) => {
      if (typeof value !== "string") return value;
      return value.replace(
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1])(?::\d+)?(\/api\/storage\/[^\s"')<>]*)/gi,
        (_match, assetPath: string) => new URL(assetPath, publicUrl).href,
      );
    }),
  ) as T;
}

export function getPrintDimensions(page: ResumeData["metadata"]["page"]) {
  const custom = page.custom;
  const size = custom?.enabled ? custom : pageSizeMap[page.format];
  const width = size.width;
  const height = size.height;
  return page.orientation === "landscape" ? { width: height, height: width } : { width, height };
}

export function preparePrintData(input: ResumeData, publicUrl: string): ResumeData {
  return refreshLocalAssetUrls(
    {
      ...defaultResumeData,
      ...input,
      basics: {
        ...defaultResumeData.basics,
        ...input.basics,
        picture: { ...defaultResumeData.basics.picture, ...input.basics?.picture },
      },
      sections: { ...defaultResumeData.sections, ...input.sections },
      metadata: {
        ...defaultResumeData.metadata,
        ...input.metadata,
        layout: input.metadata?.layout?.length
          ? input.metadata.layout
          : defaultResumeData.metadata.layout,
        page: {
          ...defaultResumeData.metadata.page,
          ...input.metadata?.page,
          custom: { ...defaultResumeData.metadata.page.custom, ...input.metadata?.page?.custom },
          options: { ...defaultResumeData.metadata.page.options, ...input.metadata?.page?.options },
        },
        theme: { ...defaultResumeData.metadata.theme, ...input.metadata?.theme },
        css: { ...defaultResumeData.metadata.css, ...input.metadata?.css },
        typography: {
          ...defaultResumeData.metadata.typography,
          ...input.metadata?.typography,
          font: {
            ...defaultResumeData.metadata.typography.font,
            ...input.metadata?.typography?.font,
          },
        },
      },
    },
    publicUrl,
  );
}
