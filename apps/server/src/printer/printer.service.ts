import { HttpService } from "@nestjs/axios";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData, type ResumeData } from "@reactive-resume/schema";
import { ErrorMessage, pageSizeMap } from "@reactive-resume/utils";
import retry from "async-retry";
import { PDFDocument } from "pdf-lib";
import { Browser, launch } from "puppeteer";

import { Config } from "../config/schema";
import { FontService } from "../font/font.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  private browser: Browser | null = null;

  constructor(
    private readonly configService: ConfigService<Config>,
    private readonly storageService: StorageService,
    private readonly httpService: HttpService,
    private readonly fontService: FontService,
  ) {}

  private async getBrowser() {
    try {
      // If browser instance doesn't exist or is disconnected, create a new one
      if (!this.browser?.connected) {
        this.logger.log("Starting local Puppeteer browser instance...");

        const chromePath =
          process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined;
        const launchOptions: Parameters<typeof launch>[0] = {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI",
            "--disable-ipc-flooding-protection",
          ],
        };

        if (chromePath) {
          this.logger.log(`Using specified Chrome executable: ${chromePath}`);
          (launchOptions as { executablePath?: string }).executablePath = chromePath;
        }

        this.browser = await launch(launchOptions);

        this.logger.log("Puppeteer browser instance started");
      }

      return this.browser;
    } catch (error) {
      this.logger.error("Failed to start Puppeteer browser:", error);
      throw new InternalServerErrorException(
        ErrorMessage.InvalidBrowserConnection,
        (error as Error).message,
      );
    }
  }

  async getVersion() {
    const browser = await this.getBrowser();
    const version = await browser.version();
    return version;
  }

  // Warm up the browser to reduce initial print timeouts
  async onModuleInit() {
    try {
      await this.getBrowser();
      this.logger.log("Puppeteer warmup completed");
    } catch {
      // Warmup failure shouldn't block startup; subsequent calls will retry
    }
  }

  async printResume(resume: ResumeDto) {
    const start = performance.now();

    const url = await retry<string | undefined>(() => this.generateResume(resume), {
      retries: 3,
      randomize: true,
      onRetry: (_, attempt) => {
        this.logger.log(`Retry printing resume #${resume.id}, attempt ${attempt}`);
      },
    });

    const duration = Number(performance.now() - start).toFixed(0);
    const numberPages = resume.data.metadata?.layout?.length || 1;

    this.logger.debug(`PDF generated in ${duration}ms, total ${numberPages} pages`);

    return url;
  }

  async printPreview(resume: ResumeDto) {
    const start = performance.now();

    const url = await retry(() => this.generatePreview(resume), {
      retries: 3,
      randomize: true,
      onRetry: (_, attempt) => {
        this.logger.log(`Retry generating preview #${resume.id}, attempt ${attempt}`);
      },
    });

    const duration = Number(performance.now() - start).toFixed(0);

    this.logger.debug(`Preview generated in ${duration}ms`);

    return url;
  }

  async generateResume(resume: ResumeDto) {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      // First navigation can be slow on cold start; increase default timeouts
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(120_000);

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // No host.docker.internal conversion needed in local mode
      const url = publicUrl;

      // Set the data of the resume to be printed in the browser's session storage
      const numberPages = resume.data.metadata?.layout?.length || 1;

      // 1) Explicit object merge: align with Artboard Providers (arrays overwrite)
      const input = resume.data as ResumeData;
      const resumeDataForPrint: ResumeData = {
        basics: {
          ...defaultResumeData.basics,
          ...input.basics,
          picture: {
            ...defaultResumeData.basics.picture,
            ...input.basics.picture,
          },
        },
        sections: {
          ...defaultResumeData.sections,
          ...input.sections,
        },
        metadata: {
          ...defaultResumeData.metadata,
          ...input.metadata,
          layout:
            input.metadata.layout.length > 0
              ? input.metadata.layout
              : defaultResumeData.metadata.layout,
          page: {
            ...defaultResumeData.metadata.page,
            ...input.metadata.page,
            options: {
              ...defaultResumeData.metadata.page.options,
              ...input.metadata.page.options,
            },
          },
          theme: {
            ...defaultResumeData.metadata.theme,
            ...input.metadata.theme,
          },
          css: {
            value: input.metadata.css.value || "",
            visible: input.metadata.css.visible,
          },
          typography: {
            ...defaultResumeData.metadata.typography,
            ...input.metadata.typography,
            font: {
              ...defaultResumeData.metadata.typography.font,
              ...input.metadata.typography.font,
            },
          },
        },
      } as ResumeData;

      this.logger.debug(`PDF - CSS visible: ${resumeDataForPrint.metadata.css.visible}`);
      this.logger.debug(`PDF - CSS length: ${resumeDataForPrint.metadata.css.value.length}`);
      this.logger.debug(`PDF - Resume ID: ${resume.id}`);

      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
      }, resumeDataForPrint);

      // Use domcontentloaded, then explicitly wait for fonts and images
      await page.goto(`${url}/artboard/preview`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      // Use print media for consistent PDF rendering
      await page.emulateMediaType("print");

      // Wait for all fonts and images to load to match Artboard visuals
      await page.evaluate(async () => {
        // 1) Wait for fonts
        await (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready;

        // 2) Wait for all images (including avatars and custom images)
        // eslint-disable-next-line unicorn/prefer-spread
        const images: HTMLImageElement[] = Array.from(document.images);
        await Promise.all(
          images.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  const done = () => {
                    resolve();
                  };
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                }),
          ),
        );

        // 3) Remove body overflow clipping in preview styles to avoid PDF cut-off
        document.documentElement.style.overflow = "visible";
        document.body.style.overflow = "visible";
        document.documentElement.style.height = "auto";
        document.body.style.height = "auto";

        // 4) Small buffer to ensure script-driven icons/styles finish rendering
        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      // Fallback styles moved to frontend (artboard); avoid injecting overriding styles here

      const pagesBuffer: Buffer[] = [];

      const processPage = async (index: number) => {
        const pageElement = await page.$(`[data-page="${index}"]`);
        if (!pageElement) throw new Error(`[data-page="${index}"] not found`);

        // Isolate current page: show only target page to avoid resource/layout loss
        // Use a style tag with id and remove it later to keep CSS order
        await page.evaluate((i) => {
          const style = document.createElement("style");
          style.id = "puppeteer-page-isolation";
          style.textContent = `
            [data-page] { display: none !important; }
            [data-page="${i}"] { display: block !important; }
          `;
          document.head.append(style);

          // Move custom CSS (if any) to the end to ensure it stays last in head
          const custom = document.querySelector("#custom-css");
          if (custom) document.head.append(custom);
        }, index);

        // Wait briefly to ensure styles take effect; also wait for fonts and images
        await page.evaluate(async () => {
          await (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready;
          // eslint-disable-next-line unicorn/prefer-spread
          const images: HTMLImageElement[] = Array.from(document.images);
          await Promise.all(
            images.map((img) => {
              if (img.complete) {
                return Promise.resolve();
              }
              return new Promise<void>((resolve) => {
                const done = () => {
                  resolve();
                };
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              });
            }),
          );
          await new Promise((r) => setTimeout(r, 100));
        });

        // Calculate if scaling is needed to fit content in one page (only when overflow)
        const contentHeightPx = await page.evaluate((i) => {
          const el = document.querySelector(`[data-page="${i}"]`);
          if (!el) return 0;
          // Use scrollHeight to get full content height
          return (el as HTMLElement).scrollHeight || 0;
        }, index);

        const orientation = resumeDataForPrint.metadata.page.orientation;
        const format = resumeDataForPrint.metadata.page.format;
        const mmHeightBase = resumeDataForPrint.metadata.page.custom.enabled
          ? resumeDataForPrint.metadata.page.custom.height
          : pageSizeMap[format].height;
        const targetMmHeight =
          orientation === "landscape" ? pageSizeMap[format].width : mmHeightBase;
        const MM_TO_PX = 3.78; // Approximate conversion same as frontend
        const targetPxHeight = targetMmHeight * MM_TO_PX;
        const fitScaleRaw =
          targetPxHeight > 0 && contentHeightPx > 0 ? targetPxHeight / contentHeightPx : 1;
        // Clamp scale range; only shrink when content overflows (<=1)
        const fitScale = Math.max(0.5, Math.min(1, fitScaleRaw));

        // If needed, wrap page content and scale via CSS to fit into a single page
        if (fitScale < 1) {
          await page.evaluate(
            (i, scale, targetPxHeight) => {
              const pageEl = document.querySelector(`[data-page="${i}"]`);
              if (!pageEl) return;

              // Wrap once
              const pageElHtml: HTMLElement = pageEl as HTMLElement;
              let wrapper = pageElHtml.querySelector<HTMLElement>(":scope > .__fit_wrapper__");
              if (!wrapper) {
                wrapper = document.createElement("div");
                wrapper.className = "__fit_wrapper__";
                // Move existing children into wrapper
                while (pageEl.firstChild) wrapper.append(pageEl.firstChild as Node);
                pageElHtml.append(wrapper);
              }

              // Limit printable height; use absolute positioning + transform scale
              pageElHtml.style.position = "relative";
              pageElHtml.style.height = `${targetPxHeight}px`;
              pageElHtml.style.overflow = "hidden";

              wrapper.style.position = "absolute";
              wrapper.style.top = "0";
              wrapper.style.left = "0";
              wrapper.style.width = "100%";
              wrapper.style.transformOrigin = "top left";
              wrapper.style.transform = `scale(${scale})`;
            },
            index,
            fitScale,
            targetPxHeight,
          );
        }

        // Let the browser paginate using @page; content is now within page height
        const uint8array = await page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        });
        const buffer = Buffer.from(uint8array);
        pagesBuffer.push(buffer);

        // Restore: precisely remove isolation style to avoid deleting custom CSS
        await page.evaluate(() => {
          const iso = document.querySelector("#puppeteer-page-isolation");
          if (iso) iso.remove();
        });
      };

      // Loop through all the pages and print them, by first displaying them, printing the PDF and then hiding them back
      for (let index = 1; index <= numberPages; index++) {
        await processPage(index);
      }

      // Merge all page PDFs (keep vector) and copy all pages each time
      const pdf = await PDFDocument.create();
      for (const element of pagesBuffer) {
        const doc = await PDFDocument.load(element);
        const total = doc.getPageCount();
        const indices = Array.from({ length: total }, (_, i) => i);
        const copiedPages = await pdf.copyPages(doc, indices);
        for (const p of copiedPages) pdf.addPage(p);
      }

      // Save the PDF to storage and return the URL; cache under generated hash
      const buffer = Buffer.from(await pdf.save());

      // This step will also save the resume URL in cache
      const resumeUrl = await this.storageService.uploadObject(
        resume.userId,
        "resumes",
        buffer,
        resume.title,
      );

      // Close the page but keep browser instance for reuse
      await page.close();

      return resumeUrl;
    } catch (error) {
      this.logger.error("Error generating PDF:", error);

      throw new InternalServerErrorException(
        ErrorMessage.ResumePrinterError,
        (error as Error).message,
      );
    }
  }

  async generatePreview(resume: ResumeDto) {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      // First navigation can be slow on cold start; increase default timeouts
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(120_000);

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // No host.docker.internal conversion needed in local mode
      const url = publicUrl;

      // Align with frontend data merge; normalize CSS fields (arrays overwrite)
      const input = resume.data as ResumeData;
      const resumeDataForPrint: ResumeData = {
        basics: {
          ...defaultResumeData.basics,
          ...input.basics,
          picture: {
            ...defaultResumeData.basics.picture,
            ...input.basics.picture,
          },
        },
        sections: {
          ...defaultResumeData.sections,
          ...input.sections,
        },
        metadata: {
          ...defaultResumeData.metadata,
          ...input.metadata,
          layout:
            input.metadata.layout.length > 0
              ? input.metadata.layout
              : defaultResumeData.metadata.layout,
          page: {
            ...defaultResumeData.metadata.page,
            ...input.metadata.page,
            options: {
              ...defaultResumeData.metadata.page.options,
              ...input.metadata.page.options,
            },
          },
          theme: {
            ...defaultResumeData.metadata.theme,
            ...input.metadata.theme,
          },
          css: {
            value: input.metadata.css.value || "",
            visible: input.metadata.css.visible,
          },
          typography: {
            ...defaultResumeData.metadata.typography,
            ...input.metadata.typography,
            font: {
              ...defaultResumeData.metadata.typography.font,
              ...input.metadata.typography.font,
            },
          },
        },
      } as ResumeData;

      // Set the data of the resume to be printed in the browser's session storage
      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
      }, resumeDataForPrint);

      await page.setViewport({ width: 794, height: 1123 });

      await page.goto(`${url}/artboard/preview`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });

      // Wait for fonts and images; remove body overflow clipping
      await page.evaluate(async () => {
        await (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready;
        // eslint-disable-next-line unicorn/prefer-spread
        const images: HTMLImageElement[] = Array.from(document.images);
        await Promise.all(
          images.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  const done = () => {
                    resolve();
                  };
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                }),
          ),
        );
        document.documentElement.style.overflow = "visible";
        document.body.style.overflow = "visible";
        document.documentElement.style.height = "auto";
        document.body.style.height = "auto";
        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      // Save the JPEG to storage and return the URL
      // Store the URL in cache for future requests, under the previously generated hash digest
      const uint8array = await page.screenshot({ quality: 80, type: "jpeg" });
      const buffer = Buffer.from(uint8array);

      // Generate a hash digest of the resume data, this hash will be used to check if the resume has been updated
      const previewUrl = await this.storageService.uploadObject(
        resume.userId,
        "previews",
        buffer,
        resume.id,
      );

      // Close the page but keep browser instance for reuse
      await page.close();

      return previewUrl;
    } catch (error) {
      this.logger.error("Error generating preview:", error);

      throw new InternalServerErrorException(
        ErrorMessage.ResumePrinterError,
        (error as Error).message,
      );
    }
  }

  // Cleanup resources
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log("Puppeteer browser instance closed");
    }
  }
}
