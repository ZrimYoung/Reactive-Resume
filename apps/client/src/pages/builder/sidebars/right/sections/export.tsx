import { t } from "@lingui/macro";
import { CircleNotch, FileJs, FileMd, FilePdf } from "@phosphor-icons/react";
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  ToastAction,
} from "@reactive-resume/ui";
import { buildResumeMarkdown, cn } from "@reactive-resume/utils";
import { saveAs } from "file-saver";
import { useRef, useState } from "react";

import { toast } from "@/client/hooks/use-toast";
import { printResume } from "@/client/services/resume/print";
import { flushResumeSaves } from "@/client/services/resume/update";
import { useResumeStore } from "@/client/stores/resume";

import { SectionIcon } from "../shared/section-icon";

type ExportFormat = "json" | "md" | "pdf";

const getDesktopDownload = () =>
  "electron" in window ? window.electron.downloadAndSave : undefined;

const saveTextFile = async (content: string, filename: string, mimeType: string) => {
  const desktopDownload = getDesktopDownload();
  if (desktopDownload) {
    await desktopDownload(
      `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`,
      filename,
    );
    return;
  }
  saveAs(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
};

export const ExportSection = () => {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const exportingRef = useRef(false);

  const onExport = async (format: ExportFormat) => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(format);
    const id = useResumeStore.getState().resume.id;

    try {
      let saved = false;
      try {
        saved = await flushResumeSaves(id);
      } catch {
        // JSON and Markdown remain available as local backups if saving fails.
      }

      const { resume } = useResumeStore.getState();
      if (resume.id !== id) {
        toast({
          variant: "warning",
          title: t`The open resume changed.`,
          description: t`Export again from the resume you want to download.`,
        });
        return;
      }
      if (!saved) {
        if (format === "pdf") {
          toast({
            variant: "error",
            title: t`Save your changes before exporting PDF.`,
            description: t`Saving failed. Retry saving, then export the PDF again.`,
          });
          return;
        }
        toast({
          variant: "warning",
          title: t`Exporting a local backup.`,
          description: t`Your changes could not be saved. This download is a backup of the latest content on this device.`,
        });
      }

      const filename = `reactive_resume-${id}.${format}`;
      if (format === "json") {
        await saveTextFile(JSON.stringify(resume.data, null, 2), filename, "application/json");
      } else if (format === "md") {
        await saveTextFile(buildResumeMarkdown(resume.data), filename, "text/markdown");
      } else {
        const { url } = await printResume({ id });
        const desktopDownload = getDesktopDownload();
        if (desktopDownload) {
          await desktopDownload(url, filename);
        } else {
          const win = window.open(url, "_blank");
          if (win) win.focus();
          else {
            toast({
              title: t`Your PDF is ready.`,
              description: t`Open the PDF to download or print it.`,
              action: (
                <ToastAction asChild altText={t`Open PDF`}>
                  <a href={url} target="_blank" rel="noreferrer noopener">{t`Open PDF`}</a>
                </ToastAction>
              ),
            });
          }
        }
      }
    } catch (error) {
      toast({
        variant: "error",
        title: t`Export failed.`,
        description: error instanceof Error ? error.message : t`Please try again.`,
      });
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  };

  const cardClassName = cn(
    buttonVariants({ variant: "ghost" }),
    "h-auto cursor-pointer flex-row items-center gap-x-5 px-4 pb-3 pt-1",
    exporting !== null && "pointer-events-none cursor-progress opacity-75",
  );
  const exportKeyDown = (event: React.KeyboardEvent, format: ExportFormat) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void onExport(format);
  };

  return (
    <section id="export" className="grid gap-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <SectionIcon id="export" size={18} name={t`Export`} />
          <h2 className="line-clamp-1 text-2xl font-bold lg:text-3xl">{t`Export`}</h2>
        </div>
      </header>

      <main className="grid gap-y-4">
        <Card
          className={cardClassName}
          role="button"
          tabIndex={0}
          aria-disabled={exporting !== null}
          onClick={() => {
            void onExport("json");
          }}
          onKeyDown={(event) => {
            exportKeyDown(event, "json");
          }}
        >
          {exporting === "json" ? (
            <CircleNotch size={22} className="animate-spin" />
          ) : (
            <FileJs size={22} />
          )}
          <CardContent className="flex-1">
            <CardTitle className="text-sm">{t`JSON`}</CardTitle>
            <CardDescription className="font-normal">
              {t`Download a JSON snapshot of your resume. This file can be used to import your resume in the future, or can even be shared with others to collaborate.`}
            </CardDescription>
          </CardContent>
        </Card>

        <Card
          className={cardClassName}
          role="button"
          tabIndex={0}
          aria-disabled={exporting !== null}
          onClick={() => {
            void onExport("md");
          }}
          onKeyDown={(event) => {
            exportKeyDown(event, "md");
          }}
        >
          {exporting === "md" ? (
            <CircleNotch size={22} className="animate-spin" />
          ) : (
            <FileMd size={22} />
          )}
          <CardContent className="flex-1">
            <CardTitle className="text-sm">{t`Markdown`}</CardTitle>
            <CardDescription className="font-normal">
              {t`Download the visible resume content as Markdown, preserving section order, links and lists.`}
            </CardDescription>
          </CardContent>
        </Card>

        <Card
          className={cardClassName}
          role="button"
          tabIndex={0}
          aria-disabled={exporting !== null}
          onClick={() => {
            void onExport("pdf");
          }}
          onKeyDown={(event) => {
            exportKeyDown(event, "pdf");
          }}
        >
          {exporting === "pdf" ? (
            <CircleNotch size={22} className="animate-spin" />
          ) : (
            <FilePdf size={22} />
          )}

          <CardContent className="flex-1">
            <CardTitle className="text-sm">{t`PDF`}</CardTitle>
            <CardDescription className="font-normal">
              {t`Download a PDF of your resume. This file can be used to print your resume, send it to recruiters, or upload on job portals.`}
            </CardDescription>
          </CardContent>
        </Card>
      </main>
    </section>
  );
};
