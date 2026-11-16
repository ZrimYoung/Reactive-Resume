import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import { Check, DownloadSimple } from "@phosphor-icons/react";
import {
  JsonResumeParser,
  LinkedInParser,
  ReactiveResumeParser,
  ReactiveResumeV3Parser,
} from "@reactive-resume/parser";
import type { ResumeData } from "@reactive-resume/schema";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reactive-resume/ui";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z, ZodError } from "zod";

import { useToast } from "@/client/hooks/use-toast";
import type { ExtractedPdf } from "@/client/libs/pdf";
import { convertPdfImport } from "@/client/libs/pdf/import";
import { useImportResume } from "@/client/services/resume/import";
import { useDialog } from "@/client/stores/dialog";

enum ImportType {
  "reactive-resume-json" = "reactive-resume-json",
  "reactive-resume-v3-json" = "reactive-resume-v3-json",
  "json-resume-json" = "json-resume-json",
  "linkedin-data-export-zip" = "linkedin-data-export-zip",
  "pdf" = "pdf",
}

const formSchema = z.object({
  file: z.instanceof(File),
  type: z.nativeEnum(ImportType),
});

type FormValues = z.infer<typeof formSchema>;

const reviewSections = (data: ResumeData) => {
  const { custom, ...sections } = data.sections;
  return [...Object.values(sections), ...Object.values(custom)];
};

const previewSection = (section: ReturnType<typeof reviewSections>[number]) => {
  if ("content" in section) return section.content;
  return section.items
    .map((item) =>
      Object.entries(item)
        .filter(([key, value]) => !["id", "visible"].includes(key) && value !== "")
        .map(([, value]) =>
          value && typeof value === "object" ? Object.values(value).join(" ") : String(value),
        )
        .join(" · "),
    )
    .join("\n");
};

type ValidationResult =
  | {
      isValid: false;
      errors: string;
    }
  | {
      isValid: true;
      type: ImportType;
      file: File;
      generation: number;
      result: ResumeData;
      warnings?: string[];
      sourceText?: string;
    };

export const ImportDialog = () => {
  const { toast } = useToast();
  const { isOpen, close } = useDialog("import");
  const { importResume, loading } = useImportResume();

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const generation = useRef(0);
  const pdfTask = useRef<AbortController>();
  const submitting = useRef(false);
  const mounted = useRef(false);
  const open = useRef(isOpen);
  open.current = isOpen;
  const invalidateValidation = useCallback(() => {
    generation.current++;
    pdfTask.current?.abort();
    setValidationResult(null);
  }, []);

  const onClose = () => {
    invalidateValidation();
    close();
  };

  const onElectronImport = async () => {
    if (!("electron" in window)) return;
    const request = ++generation.current;
    setValidationResult(null);
    const { file, type } = form.getValues();
    const current = () =>
      mounted.current &&
      open.current &&
      request === generation.current &&
      form.getValues("type") === type &&
      form.getValues("file") === file;
    try {
      if (type === ImportType.pdf) {
        const result = await window.electron.openPdf();
        if (!current() || result.canceled || !result.bytes) return;
        form.setValue(
          "file",
          new File([new Uint8Array(result.bytes)], result.name ?? "resume.pdf", {
            type: "application/pdf",
          }),
        );
        await onValidate();
        return;
      }
      const result = await window.electron.openJson();
      if (!current()) return;
      if (!result.canceled && result.content) {
        // Use the selected parser for native and browser imports alike.
        // Retain a real File so the validated import also passes the form schema.
        form.setValue(
          "file",
          new File([JSON.stringify(result.content)], "resume.json", { type: "application/json" }),
        );
        await onValidate();
      }
    } catch (error) {
      if (!current()) return;
      toast({
        variant: "error",
        title: t`Import Failed`,
        description: error instanceof Error ? error.message : t`Unknown error occurred`,
      });
    }
  };

  const form = useForm<FormValues>({
    defaultValues: {
      type: ImportType["reactive-resume-json"],
    },
    resolver: zodResolver(formSchema),
  });
  const filetype = form.watch("type");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      pdfTask.current?.abort();
    };
  }, []);

  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name === "file" || name === "type") invalidateValidation();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form, invalidateValidation]);

  useEffect(() => {
    if (isOpen) onReset();
    else invalidateValidation();
  }, [isOpen]);

  useEffect(() => {
    form.reset({ file: undefined, type: filetype });
    invalidateValidation();
  }, [filetype]);

  const accept = useMemo(() => {
    if (filetype.includes("json")) return ".json";
    if (filetype.includes("zip")) return ".zip";
    if (filetype === ImportType.pdf) return ".pdf";
    return "";
  }, [filetype]);

  const onValidate = async () => {
    pdfTask.current?.abort();
    const request = ++generation.current;
    const { file: selectedFile, type: selectedType } = form.getValues();
    const current = () =>
      mounted.current &&
      open.current &&
      request === generation.current &&
      form.getValues("file") === selectedFile &&
      form.getValues("type") === selectedType;
    setValidationResult(null);
    try {
      const { file, type } = formSchema.parse(form.getValues());

      if (type === ImportType["reactive-resume-json"]) {
        const parser = new ReactiveResumeParser();
        const data = await parser.readFile(file);
        const result = parser.validate(data);

        if (current())
          setValidationResult({
            isValid: true,
            type,
            file,
            generation: request,
            result: parser.convert(result),
          });
      }

      if (type === ImportType["reactive-resume-v3-json"]) {
        const parser = new ReactiveResumeV3Parser();
        const data = await parser.readFile(file);
        const result = parser.validate(data);

        if (current())
          setValidationResult({
            isValid: true,
            type,
            file,
            generation: request,
            result: parser.convert(result),
          });
      }

      if (type === ImportType["json-resume-json"]) {
        const parser = new JsonResumeParser();
        const data = await parser.readFile(file);
        const result = parser.validate(data);

        if (current())
          setValidationResult({
            isValid: true,
            type,
            file,
            generation: request,
            result: parser.convert(result),
          });
      }

      if (type === ImportType["linkedin-data-export-zip"]) {
        const parser = new LinkedInParser();
        const data = await parser.readFile(file);
        const result = await parser.validate(data);

        if (current())
          setValidationResult({
            isValid: true,
            type,
            file,
            generation: request,
            result: parser.convert(result),
          });
      }
      if (type === ImportType.pdf) {
        const controller = new AbortController();
        pdfTask.current = controller;
        const { extractPdf } = await import("@/client/libs/pdf");
        if (!current()) return;
        const extracted: ExtractedPdf = await extractPdf(file, { signal: controller.signal });
        const converted = convertPdfImport(extracted);
        if (current())
          setValidationResult({
            isValid: true,
            type,
            file,
            generation: request,
            result: converted.data,
            warnings: converted.warnings,
            sourceText: converted.text,
          });
      }
    } catch (error) {
      if (!current()) return;
      setValidationResult({
        isValid: false,
        errors: JSON.stringify(
          error instanceof ZodError
            ? error.issues
            : [{ message: error instanceof Error ? error.message : t`Unknown error occurred` }],
        ),
      });
      toast({ variant: "error", title: t`An error occurred while validating the file.` });
    }
  };

  const onImport = async () => {
    if (submitting.current) return;
    try {
      const { file, type } = formSchema.parse(form.getValues());
      if (
        !validationResult?.isValid ||
        validationResult.type !== type ||
        validationResult.file !== file ||
        validationResult.generation !== generation.current ||
        !open.current
      )
        return;
      const request = generation.current;
      submitting.current = true;
      const current = () =>
        open.current &&
        generation.current === request &&
        form.getValues("file") === file &&
        form.getValues("type") === type;
      await importResume({ data: validationResult.result });

      if (current()) onClose();
    } catch (error: unknown) {
      toast({
        variant: "error",
        title: t`Oops, the server returned an error.`,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      submitting.current = false;
    }
  };

  const onReset = () => {
    invalidateValidation();
    form.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <Form {...form}>
          <form className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                <div className="flex items-center space-x-2.5">
                  <DownloadSimple />
                  <h2>{t`Import an existing resume`}</h2>
                </div>
              </DialogTitle>
              <DialogDescription>
                {t`Upload a file from one of the accepted sources to parse existing data and import it into Reactive Resume for easier editing.`}
              </DialogDescription>
            </DialogHeader>

            <FormField
              name="type"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t`Filetype`}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t`Please select a file type`} />
                      </SelectTrigger>
                      <SelectContent>
                        {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
                        <SelectItem value="reactive-resume-json">
                          Reactive Resume (.json)
                        </SelectItem>
                        {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
                        <SelectItem value="reactive-resume-v3-json">
                          Reactive Resume v3 (.json)
                        </SelectItem>
                        {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
                        <SelectItem value="json-resume-json">JSON Resume (.json)</SelectItem>
                        {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
                        <SelectItem value="linkedin-data-export-zip">
                          LinkedIn Data Export (.zip)
                        </SelectItem>
                        <SelectItem value="pdf">{t`PDF with readable text (.pdf)`}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {"electron" in window && (filetype.includes("json") || filetype === ImportType.pdf) && (
              <div className="flex flex-col gap-y-2">
                <Label>{t`Local file`}</Label>
                <Button type="button" variant="outline" onClick={onElectronImport}>
                  <DownloadSimple className="mr-2" />
                  {t`Open Local File`}
                </Button>
                {validationResult?.isValid && (
                  <p className="mt-1 flex items-center text-xs text-green-600">
                    <Check className="mr-1" size={12} /> {t`File loaded and validated`}
                  </p>
                )}
              </div>
            )}

            <FormField
              name="file"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t`File`}</FormLabel>
                  <FormControl>
                    <Input
                      key={`${accept}-${filetype}`}
                      type="file"
                      accept={accept}
                      onChange={(event) => {
                        if (!event.target.files?.length) return;
                        field.onChange(event.target.files[0]);
                        invalidateValidation();
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                  {accept && (
                    <FormDescription>
                      {t({
                        message: `Accepts only ${accept} files`,
                        comment:
                          "Helper text to let the user know what filetypes are accepted. {accept} can be .pdf or .json.",
                      })}
                    </FormDescription>
                  )}
                </FormItem>
              )}
            />

            {validationResult?.isValid === false && (
              <div className="space-y-2">
                <Label className="text-error">{t`Errors`}</Label>
                <ScrollArea orientation="vertical" className="h-[180px]">
                  <div className="whitespace-pre-wrap rounded bg-secondary-accent p-4 font-mono text-xs leading-relaxed">
                    {JSON.stringify(JSON.parse(validationResult.errors), null, 4)}
                  </div>
                </ScrollArea>
              </div>
            )}

            {validationResult?.isValid && (
              <div className="space-y-3 rounded border p-3" data-testid="import-review">
                <h3 className="font-semibold">{t`Review before importing`}</h3>
                <p className="text-xs opacity-70">{t`This creates a new resume. Review the parsed content below; you can correct it in the editor after importing.`}</p>
                <p className="break-words font-medium">
                  {validationResult.result.basics.name || t`Unnamed resume`}
                </p>
                <p className="break-words text-sm">
                  {[
                    validationResult.result.basics.headline,
                    validationResult.result.basics.email,
                    validationResult.result.basics.phone,
                    validationResult.result.basics.location,
                    validationResult.result.basics.url.href,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {validationResult.warnings?.map((warning) => (
                  <p key={warning} className="text-xs text-warning">
                    {warning}
                  </p>
                ))}
                <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {reviewSections(validationResult.result).map((section) => {
                    const content = previewSection(section);
                    if (!content) return null;
                    return (
                      <details key={section.id}>
                        <summary className="cursor-pointer font-medium">
                          {section.name}
                          {section.visible ? "" : ` (${t`Hidden`})`}
                        </summary>
                        <pre className="whitespace-pre-wrap break-words font-sans text-xs">
                          {String(content)
                            .replace(/<[^>]*>/gu, " ")
                            .replace(/&lt;/gu, "<")
                            .replace(/&gt;/gu, ">")
                            .replace(/&quot;/gu, '"')
                            .replace(/&#39;/gu, "'")
                            .replace(/&amp;/gu, "&")}
                        </pre>
                      </details>
                    );
                  })}
                  {validationResult.sourceText && (
                    <details>
                      <summary className="cursor-pointer">{t`Extracted PDF text`}</summary>
                      <pre className="whitespace-pre-wrap break-words font-sans text-xs">
                        {validationResult.sourceText}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <AnimatePresence presenceAffectsLayout>
                {!validationResult && (
                  <Button type="button" onClick={onValidate}>
                    {t`Validate`}
                  </Button>
                )}

                {validationResult !== null && !validationResult.isValid && (
                  <Button type="button" variant="secondary" onClick={onReset}>
                    {t`Discard`}
                  </Button>
                )}

                {validationResult !== null && validationResult.isValid && (
                  <>
                    <Button type="button" disabled={loading} onClick={onImport}>
                      {t`Import`}
                    </Button>

                    <Button disabled type="button" variant="success">
                      <Check size={16} weight="bold" className="mr-2" />
                      {t`Validated`}
                    </Button>
                  </>
                )}
              </AnimatePresence>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
