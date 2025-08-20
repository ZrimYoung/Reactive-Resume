/* eslint-disable lingui/no-unlocalized-strings */

import { t } from "@lingui/macro";
import { Plus } from "@phosphor-icons/react";
import type { ComboboxOption } from "@reactive-resume/ui";
import { Button, Combobox, Label, Slider, Switch } from "@reactive-resume/ui";
import { cn, fonts } from "@reactive-resume/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import webfontloader from "webfontloader";

import { FontUploadDialog } from "@/client/components/font-upload-dialog";
import { useResumeStore } from "@/client/stores/resume";

import { SectionIcon } from "../shared/section-icon";

const localFonts = ["Arial", "Cambria", "Garamond", "Times New Roman"];

const getfontSuggestions = (customFonts: string[]) => [
  ...localFonts,
  ...customFonts,
  "IBM Plex Sans",
  "IBM Plex Serif",
  "Lato",
  "Lora",
  "Merriweather",
  "Open Sans",
  "Playfair Display",
  "PT Sans",
  "PT Serif",
  "Roboto Condensed",
];

export const TypographySection = () => {
  const [subsets, setSubsets] = useState<ComboboxOption[]>([]);
  const [variants, setVariants] = useState<ComboboxOption[]>([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);

  // 使用 ref 来避免重复加载
  const hasLoadedCustomFonts = useRef(false);

  const setValue = useResumeStore((state) => state.setValue);
  const typography = useResumeStore(
    (state) =>
      state.resume.data.metadata.typography || {
        font: { family: "IBM Plex Serif", subset: "latin", variants: ["regular"], size: 14 },
        lineHeight: 1.5,
        hideIcons: false,
        underlineLinks: true,
      },
  );

  const handleFamilyChange = useCallback(
    (family: string | null) => {
      if (!family) return;

      const isGoogleFont = fonts.some((font) => font.family === family);
      const currentFont = typography.font;

      if (isGoogleFont) {
        const fontInfo = fonts.find((f) => f.family === family);
        const defaultVariant = fontInfo?.variants.includes("regular")
          ? "regular"
          : (fontInfo?.variants[0] ?? "");
        const defaultSubset = fontInfo?.subsets.includes("latin")
          ? "latin"
          : (fontInfo?.subsets[0] ?? "");
        setValue("metadata.typography.font", {
          ...currentFont,
          family,
          subset: defaultSubset,
          variants: defaultVariant ? [defaultVariant] : [],
        });
      } else {
        // For custom or local fonts, reset subset and variants
        setValue("metadata.typography.font", {
          ...currentFont,
          family,
          subset: "",
          variants: [],
        });
      }
    },
    [setValue, typography.font],
  );

  const families: ComboboxOption[] = useMemo(() => {
    const googleFonts = fonts.map((font) => ({
      label: font.family,
      value: font.family,
    }));

    const customFontOptions = customFonts.map((font) => ({
      label: font,
      value: font,
    }));

    // 合并并去重，如果名称冲突，优先使用自定义字体
    const combined = [...customFontOptions, ...googleFonts];
    const uniqueFamilies = [...new Map(combined.map((item) => [item.value, item])).values()];

    return uniqueFamilies;
  }, [customFonts]);

  // 加载用户自定义字体（只加载一次）
  const loadCustomFonts = useCallback(async () => {
    if (hasLoadedCustomFonts.current || isLoadingFonts) {
      return;
    }

    setIsLoadingFonts(true);
    hasLoadedCustomFonts.current = true;

    try {
      const response = await fetch("/api/fonts/user/local-user-id");
      if (response.ok) {
        const fonts = await response.json();
        const fontFamilies = fonts.map((font: any) => font.fontFamily || font.family);
        setCustomFonts(fontFamilies);
      }
    } catch (error) {
      console.warn("加载自定义字体失败:", error);
    } finally {
      setIsLoadingFonts(false);
    }
  }, [isLoadingFonts]);

  // 稳定的字体建议列表
  const fontSuggestions = getfontSuggestions(customFonts);

  const loadFontSuggestions = useCallback(() => {
    for (const font of fontSuggestions) {
      if (localFonts.includes(font) || customFonts.includes(font)) continue;

      webfontloader.load({
        events: false,
        classes: false,
        google: { families: [font], text: font },
      });
    }
  }, [fontSuggestions]);

  const handleUploadSuccess = useCallback(
    (fontFamily: string) => {
      // 直接更新本地状态，避免重新请求API
      setCustomFonts((prev) => {
        if (!prev.includes(fontFamily)) {
          return [...prev, fontFamily];
        }
        return prev;
      });

      handleFamilyChange(fontFamily);
    },
    [handleFamilyChange],
  );

  // 只在组件首次加载时执行
  useEffect(() => {
    loadCustomFonts();
  }, [loadCustomFonts]);

  // 字体建议更新时加载字体
  useEffect(() => {
    loadFontSuggestions();
  }, [loadFontSuggestions]);

  useEffect(() => {
    const family = typography.font.family;
    const fontInfo = fonts.find((font) => font.family === family);

    const subsets = fontInfo?.subsets ?? [];
    if (subsets.length > 0) {
      setSubsets(subsets.map((subset) => ({ value: subset, label: subset })));
    } else {
      setSubsets([]);
    }

    const variants = fontInfo?.variants ?? [];
    if (variants.length > 0) {
      setVariants(variants.map((variant) => ({ value: variant, label: variant })));
    } else {
      setVariants([]);
    }
  }, [typography.font.family]);

  const isGoogleFont = useMemo(
    () => fonts.some((font) => font.family === typography.font.family),
    [typography.font.family],
  );

  return (
    <section id="typography" className="grid gap-y-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <SectionIcon id="typography" size={18} name={t`Typography`} />
          <h2 className="line-clamp-1 text-2xl font-bold lg:text-3xl">{t`Typography`}</h2>
        </div>
      </header>

      <main className="grid gap-y-6">
        <div className="space-y-1.5">
          <Label>{t`Font Family`}</Label>
          <Combobox
            options={families.sort((a, b) => {
              const labelA = a.label?.toString() ?? "";
              const labelB = b.label?.toString() ?? "";
              return labelA.localeCompare(labelB);
            })}
            value={typography.font.family}
            onValueChange={handleFamilyChange}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Upload custom font button */}
          <Button
            variant="outline"
            className="flex h-12 items-center justify-center gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => {
              setIsUploadDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t`Upload Font`}
          </Button>

          {fontSuggestions
            .sort((a: string, b: string) => a.localeCompare(b))
            .map((font: string) => (
              <Button
                key={font}
                variant="outline"
                style={{ fontFamily: font }}
                disabled={typography.font.family === font}
                className={cn(
                  "flex h-12 items-center justify-center overflow-hidden rounded border text-center text-xs ring-primary transition-colors hover:bg-secondary-accent focus:outline-none focus:ring-1 disabled:opacity-100 lg:text-sm",
                  typography.font.family === font && "ring-1",
                )}
                onClick={() => {
                  handleFamilyChange(font);
                }}
              >
                {font}
              </Button>
            ))}
        </div>

        {isGoogleFont && (
          <div className="grid grid-cols-2 gap-x-4">
            <div className="space-y-1.5">
              <Label>{t`Font Subset`}</Label>
              <Combobox
                options={subsets}
                value={typography.font.subset}
                onValueChange={(value) => {
                  setValue("metadata.typography.font.subset", value);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t`Font Variants`}</Label>
              <Combobox
                options={variants}
                value={typography.font.variants[0]}
                onValueChange={(value) => {
                  setValue("metadata.typography.font.variants", [value]);
                }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t`Font Size`}</Label>
          <div className="flex items-center gap-x-4 py-1">
            <Slider
              min={6}
              max={18}
              step={0.05}
              value={[typography.font.size]}
              onValueChange={([value]) => {
                setValue("metadata.typography.font.size", value);
              }}
            />
            <span className="text-sm font-medium leading-none">{typography.font.size}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t`Line Height`}</Label>
          <div className="flex items-center gap-x-4 py-1">
            <Slider
              min={1}
              max={2}
              step={0.05}
              value={[typography.lineHeight]}
              onValueChange={([value]) => {
                setValue("metadata.typography.lineHeight", value);
              }}
            />
            <span className="text-sm font-medium leading-none">{typography.lineHeight}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="hide-icons" className="cursor-pointer">
            {t`Hide Icons`}
          </Label>
          <Switch
            id="hide-icons"
            checked={typography.hideIcons}
            onCheckedChange={(checked) => {
              setValue("metadata.typography.hideIcons", checked);
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="underline-links" className="cursor-pointer">
            {t`Underline Links`}
          </Label>
          <Switch
            id="underline-links"
            checked={typography.underlineLinks}
            onCheckedChange={(checked) => {
              setValue("metadata.typography.underlineLinks", checked);
            }}
          />
        </div>
      </main>

      <FontUploadDialog
        isOpen={isUploadDialogOpen}
        onClose={() => {
          setIsUploadDialogOpen(false);
        }}
        onSuccess={handleUploadSuccess}
      />
    </section>
  );
};
