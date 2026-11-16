import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import { Check, DownloadSimple } from "@phosphor-icons/react";
import type { JsonResume, LinkedIn, ReactiveResumeV3 } from "@reactive-resume/parser";
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
import { useImportResume } from "@/client/services/resume/import";
import { useDialog } from "@/client/stores/dialog";

enum ImportType {
  "reactive-resume-json" = "reactive-resume-json",
  "reactive-resume-v3-json" = "reactive-resume-v3-json",
  "json-resume-json" = "json-resume-json",
  "linkedin-data-export-zip" = "linkedin-data-export-zip",
}

const formSchema = z.object({
  file: z.instanceof(File),
  type: z.nativeEnum(ImportType),
});

type FormValues = z.infer<typeof formSchema>;

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
      result: ResumeData | ReactiveResumeV3 | LinkedIn | JsonResume;
    };

export const ImportDialog = () => {
  const { toast } = useToast();
  const { isOpen, close } = useDialog("import");
  const { importResume, loading } = useImportResume();

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const open = useRef(isOpen);
  open.current = isOpen;
  const invalidateValidation = useCallback(() => {
    generation.current++;
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
    return "";
  }, [filetype]);

  const onValidate = async () => {
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
          setValidationResult({ isValid: true, type, file, generation: request, result });
      }

      if (type === ImportType["reactive-resume-v3-json"]) {
        const parser = new ReactiveResumeV3Parser();
        const data = await parser.readFile(file);
        const result = parser.validate(data);

        if (current())
          setValidationResult({ isValid: true, type, file, generation: request, result });
      }

      if (type === ImportType["json-resume-json"]) {
        const parser = new JsonResumeParser();
        const data = await parser.readFile(file);
        const result = parser.validate(data);

        if (current())
          setValidationResult({ isValid: true, type, file, generation: request, result });
      }

      if (type === ImportType["linkedin-data-export-zip"]) {
        const parser = new LinkedInParser();
        const data = await parser.readFile(file);
        const result = await parser.validate(data);

        if (current())
          setValidationResult({ isValid: true, type, file, generation: request, result });
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
      const current = () =>
        open.current &&
        generation.current === request &&
        form.getValues("file") === file &&
        form.getValues("type") === type;
      if (type === ImportType["reactive-resume-json"]) {
        const parser = new ReactiveResumeParser();
        const data = parser.convert(validationResult.result as ResumeData);

        await importResume({ data });
      }

      if (type === ImportType["reactive-resume-v3-json"]) {
        const parser = new ReactiveResumeV3Parser();
        const data = parser.convert(validationResult.result as ReactiveResumeV3);

        await importResume({ data });
      }

      if (type === ImportType["json-resume-json"]) {
        const parser = new JsonResumeParser();
        const data = parser.convert(validationResult.result as JsonResume);

        await importResume({ data });
      }

      if (type === ImportType["linkedin-data-export-zip"]) {
        const parser = new LinkedInParser();
        const data = parser.convert(validationResult.result as LinkedIn);

        await importResume({ data });
      }

      if (current()) onClose();
    } catch (error: unknown) {
      toast({
        variant: "error",
        title: t`Oops, the server returned an error.`,
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const onReset = () => {
    invalidateValidation();
    form.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
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
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {"electron" in window && filetype.includes("json") && (
              <div className="flex flex-col gap-y-2">
                <Label>{t`Local JSON file`}</Label>
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
