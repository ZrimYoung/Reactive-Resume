import { defaultResumeData } from "@reactive-resume/schema";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Outlet } from "react-router";

import { ErrorBoundary } from "../components/error-boundary";
import { helmetContext } from "../constants/helmet";
import { useArtboardStore } from "../store/artboard";

export const Providers = () => {
  const resume = useArtboardStore((state) => state.resume);
  const setResume = useArtboardStore((state) => state.setResume);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === "SET_RESUME") {
        console.log("🔄 Artboard: 接收到新的简历数据", event.data.payload);

        // Check if payload has required structure
        if (!event.data.payload) {
          console.error("❌ Artboard: payload 为空");
          setResume(defaultResumeData);
          return;
        }

        // Merge with default data to ensure all required fields exist
        const mergedData = { ...defaultResumeData, ...event.data.payload };

        // Deep merge metadata to ensure all nested properties exist
        if (event.data.payload.metadata) {
          mergedData.metadata = {
            ...defaultResumeData.metadata,
            ...event.data.payload.metadata,
            layout: event.data.payload.metadata?.layout || defaultResumeData.metadata.layout,
            page: {
              ...defaultResumeData.metadata.page,
              ...event.data.payload.metadata.page,
            },
            theme: {
              ...defaultResumeData.metadata.theme,
              ...event.data.payload.metadata.theme,
            },
            css: {
              value: event.data.payload.metadata?.css?.value || "",
              visible: event.data.payload.metadata?.css?.visible === true,
            },
            typography: {
              ...defaultResumeData.metadata.typography,
              ...event.data.payload.metadata.typography,
              font: {
                ...defaultResumeData.metadata.typography.font,
                ...event.data.payload.metadata.typography?.font,
              },
            },
          };
        }

        // Deep merge basics
        if (event.data.payload.basics) {
          mergedData.basics = {
            ...defaultResumeData.basics,
            ...event.data.payload.basics,
            picture: {
              ...defaultResumeData.basics.picture,
              ...event.data.payload.basics.picture,
            },
          };
        }

        console.log("✅ Artboard: 合并后的数据", JSON.stringify(mergedData, null, 2));
        console.log("📊 Artboard: Layout 数据", mergedData.metadata.layout);

        setResume(mergedData);
      }
    };

    window.addEventListener("message", handleMessage, false);

    return () => {
      window.removeEventListener("message", handleMessage, false);
    };
  }, []);

  useEffect(() => {
    const resumeData = window.localStorage.getItem("resume");

    if (resumeData) {
      try {
        const parsedData = JSON.parse(resumeData);
        console.log("🔄 Artboard: 从 localStorage 加载数据", parsedData);
        console.log("🔍 Artboard: CSS状态检查", {
          hasCss: !!parsedData.metadata?.css,
          cssVisible: parsedData.metadata?.css?.visible,
          cssValue: (parsedData.metadata?.css?.value || "").slice(0, 100) + "...",
        });

        // Deep merge with default data to ensure all required fields exist
        const mergedData = { ...defaultResumeData, ...parsedData };

        // Ensure metadata exists and has all required properties
        if (parsedData.metadata) {
          mergedData.metadata = {
            ...defaultResumeData.metadata,
            ...parsedData.metadata,
            layout: parsedData.metadata?.layout || defaultResumeData.metadata.layout,
            page: {
              ...defaultResumeData.metadata.page,
              ...parsedData.metadata.page,
            },
            theme: {
              ...defaultResumeData.metadata.theme,
              ...parsedData.metadata.theme,
            },
            css: {
              value: parsedData.metadata?.css?.value || "",
              visible: parsedData.metadata?.css?.visible === true,
            },
            typography: {
              ...defaultResumeData.metadata.typography,
              ...parsedData.metadata?.typography,
              font: {
                ...defaultResumeData.metadata.typography.font,
                ...parsedData.metadata?.typography?.font,
              },
            },
          } as typeof defaultResumeData.metadata;
        }

        // Ensure basics exists
        if (parsedData.basics) {
          mergedData.basics = {
            ...defaultResumeData.basics,
            ...parsedData.basics,
          };
        }

        console.log("✅ Artboard: localStorage 合并后的数据", mergedData);
        console.log("🎨 Artboard: 最终CSS状态", {
          visible: mergedData.metadata.css.visible,
          valueLength: mergedData.metadata.css.value.length
        });
        setResume(mergedData);
      } catch (error) {
        console.error("❌ Artboard: Failed to parse resume data from localStorage:", error);
        setResume(defaultResumeData);
      }
    } else {
      console.log("📝 Artboard: localStorage 中没有简历数据，使用默认数据");
      setResume(defaultResumeData);
    }
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider context={helmetContext}>
        <Outlet />
      </HelmetProvider>
    </ErrorBoundary>
  );
};
