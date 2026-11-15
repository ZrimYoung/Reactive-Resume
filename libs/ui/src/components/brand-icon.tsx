import type { Icon } from "@phosphor-icons/react";
import {
  BehanceLogo,
  DribbbleLogo,
  FacebookLogo,
  GithubLogo,
  GitlabLogo,
  Globe,
  InstagramLogo,
  LinkedinLogo,
  MediumLogo,
  StackOverflowLogo,
  TwitterLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import type { SVGProps } from "react";
import { forwardRef, useEffect, useState } from "react";

type BrandIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  slug: string;
  debounce?: number;
  size?: number | string;
};

const localBrands: Record<string, Icon> = {
  linkedin: LinkedinLogo,
  github: GithubLogo,
  gitlab: GitlabLogo,
  twitter: TwitterLogo,
  x: XLogo,
  facebook: FacebookLogo,
  instagram: InstagramLogo,
  youtube: YoutubeLogo,
  dribbble: DribbbleLogo,
  behance: BehanceLogo,
  medium: MediumLogo,
  stackoverflow: StackOverflowLogo,
};

/** Brand glyphs ship with the application, so opening or printing never waits for a CDN. */
export const BrandIcon = forwardRef<SVGSVGElement, BrandIconProps>(function BrandIconImpl(
  { slug, debounce = 0, size = "size-4", className, ...props },
  ref,
) {
  const [currentSlug, setCurrentSlug] = useState(slug);
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentSlug(slug);
    }, debounce);
    return () => {
      clearTimeout(timer);
    };
  }, [slug, debounce]);
  const normalized = currentSlug
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const Logo = localBrands[normalized] ?? Globe;
  return (
    <Logo
      {...props}
      ref={ref}
      weight="fill"
      size={typeof size === "number" ? size : 16}
      className={["ph shrink-0", typeof size === "string" ? size : "", className]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={currentSlug || "brand"}
    />
  );
});
BrandIcon.displayName = "BrandIcon";
