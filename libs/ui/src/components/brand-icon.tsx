import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";

type BrandIconProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  slug: string;
  /**
   * 控制去抖动时间（毫秒）。默认 0（不去抖）。
   */
  debounce?: number;
  /**
   * 尺寸配置：
   * - 传数字（如 20）则应用到 style.width/height（px）
   * - 传字符串（如 "size-5" 或 "w-5 h-5"）则拼接到 className
   */
  size?: number | string;
  className?: string;
};

function useDebouncedValue<T>(value: T, waitMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    if (!waitMs) {
      setDebounced(value);
      return;
    }
    const id = setTimeout(() => {
      setDebounced(value);
    }, waitMs);
    return () => {
      clearTimeout(id);
    };
  }, [value, waitMs]);
  return debounced;
}

export const BrandIcon = forwardRef<HTMLImageElement, BrandIconProps>(function BrandIconImpl(
  { slug, debounce = 0, size, className, onError, style, ...imgProps },
  ref,
) {
  const debouncedSlug = useDebouncedValue(slug, debounce);

  const triedFallbackRef = useRef(false);

  const isLinkedIn = debouncedSlug === "linkedin";

  const computedClassName = useMemo(() => {
    if (typeof size === "string" && size.trim().length > 0) {
      return [size, className].filter(Boolean).join(" ");
    }
    // 默认尺寸：更贴近 artboard 原实现（size-4）
    const defaultSize = "size-4";
    return [defaultSize, className].filter(Boolean).join(" ");
  }, [size, className]);

  const localLinkedInSrc = useMemo(() => {
    try {
      return `${window.location.origin}/support-logos/linkedin.svg`;
    } catch {
      return "/support-logos/linkedin.svg";
    }
  }, []);

  const cdnSrc = useMemo(() => `https://cdn.simpleicons.org/${debouncedSlug}`, [debouncedSlug]);

  const primarySrc = isLinkedIn ? localLinkedInSrc : cdnSrc;

  return (
    <img
      ref={ref}
      alt={debouncedSlug || "brand"}
      className={computedClassName}
      // 避免使用内联 style，使用 HTML 属性宽高
      {...(typeof size === "number" ? { width: size, height: size } : {})}
      // 仍允许外部传入 style（不建议）
      {...(style ? { style } : {})}
      src={primarySrc}
      onError={(e) => {
        // 如果本地 linkedin 资源加载失败，降级到 CDN；避免无限循环
        if (isLinkedIn && !triedFallbackRef.current) {
          triedFallbackRef.current = true;
          (e.currentTarget as HTMLImageElement).src = cdnSrc;
          return;
        }
        onError?.(e);
      }}
      {...imgProps}
    />
  );
});

BrandIcon.displayName = "BrandIcon";
