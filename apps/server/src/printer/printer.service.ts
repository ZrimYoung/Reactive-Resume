import { HttpService } from "@nestjs/axios";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResumeDto } from "@reactive-resume/dto";
import type { ResumeData } from "@reactive-resume/schema";
import { ErrorMessage } from "@reactive-resume/utils";
import retry from "async-retry";
import { PDFDocument } from "pdf-lib";
import type { Browser, BrowserContext, Page } from "puppeteer";
import { launch } from "puppeteer";

import { Config } from "../config/schema";
import { FontService } from "../font/font.service";
import { StorageService } from "../storage/storage.service";
import { getPrintDimensions, preparePrintData } from "./print-data";

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  private browser: Browser | null = null;
  private browserLaunch: Promise<Browser> | null = null;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService<Config>,
    private readonly storageService: StorageService,
    private readonly httpService: HttpService,
    private readonly fontService: FontService,
  ) {}

  private async getBrowser(): Promise<Browser> {
    if (this.shuttingDown) throw new Error("The printer is shutting down");
    if (this.browser?.connected) return this.browser;
    if (!this.browserLaunch) {
      this.browserLaunch = this.launchBrowser().finally(() => {
        this.browserLaunch = null;
      });
    }
    return this.browserLaunch;
  }

  private async launchBrowser(): Promise<Browser> {
    try {
      // If browser instance doesn't exist or is disconnected, create a new one
      if (!this.browser?.connected) {
        this.logger.log("Starting local Puppeteer browser instance...");

        const chromePath =
          process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_PATH ?? undefined;
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

        this.browser = await launch({ ...launchOptions, timeout: 30_000 });
        const browser = this.browser;
        browser.once("disconnected", () => {
          if (this.browser === browser) this.browser = null;
        });

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

  // Start Chrome only when printing. A missing browser must not prevent the app opening.

  private async waitForArtboard(page: Page) {
    await page.waitForSelector('[data-page="1"]', { timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.artboardReady === "true", {
      timeout: 30_000,
    });
  }

  private async prepareResources(page: Page) {
    await page.waitForFunction(
      () => {
        const state = document.documentElement.dataset.resumeFonts;
        return Boolean(state && state !== "loading");
      },
      { timeout: 20_000 },
    );
    const fontState = await page.evaluate(() => document.documentElement.dataset.resumeFonts);
    if (fontState !== "ready") {
      this.logger.warn(`Using fallback fonts for export: ${fontState}`);
    }
    try {
      await page.waitForFunction(
        () =>
          document.fonts.status === "loaded" &&
          // The server's DOM-only tsconfig does not provide iterable HTMLCollection types.
          // eslint-disable-next-line unicorn/prefer-spread
          Array.from(document.images).every((image) => image.complete),
        { timeout: 10_000 },
      );
    } catch {
      this.logger.warn("Some optional images or fonts did not finish loading before export");
    }
    await page.evaluate(() => {
      document.documentElement.style.overflow = "visible";
      document.body.style.overflow = "visible";
      document.documentElement.style.height = "auto";
      document.body.style.height = "auto";
    });
  }

  private async closeContext(context?: BrowserContext) {
    if (!context) return;
    try {
      await context.close();
    } catch (error) {
      this.logger.warn(`Unable to close print context: ${(error as Error).message}`);
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
    let context: BrowserContext | undefined;
    try {
      const browser = await this.getBrowser();
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      // First navigation can be slow on cold start; increase default timeouts
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(120_000);

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // No host.docker.internal conversion needed in local mode
      const url = publicUrl;

      // Set the data of the resume to be printed in the browser's session storage
      const numberPages = resume.data.metadata?.layout?.length || 1;

      const resumeDataForPrint = preparePrintData(resume.data as ResumeData, publicUrl);

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
      await this.waitForArtboard(page);
      // Use print media for consistent PDF rendering
      await page.emulateMediaType("print");

      await this.prepareResources(page);

      // Fallback styles moved to frontend (artboard); avoid injecting overriding styles here

      const pagesBuffer: Buffer[] = [];

      const dimensions = getPrintDimensions(resumeDataForPrint.metadata.page);
      const processPage = async (index: number) => {
        const pageElement = await page.$(`[data-page="${index}"]`);
        if (!pageElement) throw new Error(`[data-page="${index}"] not found`);

        // Isolate current page: show only target page to avoid resource/layout loss
        // Use a style tag with id and remove it later to keep CSS order
        await page.evaluate(
          ({ index: i, width, height }) => {
            const style = document.createElement("style");
            style.id = "puppeteer-page-isolation";
            style.textContent = `
            [data-page] { display: none !important; }
            [data-page="${i}"] {
              display: block !important;
              width: ${width}mm !important;
              min-height: ${height}mm !important;
              height: auto !important;
              overflow: visible !important;
            }
          `;
            document.head.append(style);

            // Move custom CSS (if any) to the end to ensure it stays last in head
            const custom = document.querySelector("#custom-css");
            if (custom) document.head.append(custom);
          },
          { index, ...dimensions },
        );

        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  resolve();
                }),
              ),
            ),
        );

        // Preserve overflowing content: Chrome may produce multiple physical pages for one layout page.
        // Cropping a scaled wrapper here silently discarded long resumes.
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
        resume.id,
      );

      return resumeUrl;
    } catch (error) {
      this.logger.error("Error generating PDF:", error);

      throw new InternalServerErrorException(
        ErrorMessage.ResumePrinterError,
        (error as Error).message,
      );
    } finally {
      await this.closeContext(context);
    }
  }

  async generatePreview(resume: ResumeDto) {
    let context: BrowserContext | undefined;
    try {
      const browser = await this.getBrowser();
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      // First navigation can be slow on cold start; increase default timeouts
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(120_000);

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // No host.docker.internal conversion needed in local mode
      const url = publicUrl;

      const resumeDataForPrint = preparePrintData(resume.data as ResumeData, publicUrl);

      // Set the data of the resume to be printed in the browser's session storage
      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
      }, resumeDataForPrint);

      const dimensions = getPrintDimensions(resumeDataForPrint.metadata.page);
      await page.setViewport({
        width: Math.ceil((dimensions.width * 96) / 25.4),
        height: Math.ceil((dimensions.height * 96) / 25.4),
      });

      await page.goto(`${url}/artboard/preview`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await this.waitForArtboard(page);

      await this.prepareResources(page);

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

      return previewUrl;
    } catch (error) {
      this.logger.error("Error generating preview:", error);

      throw new InternalServerErrorException(
        ErrorMessage.ResumePrinterError,
        (error as Error).message,
      );
    } finally {
      await this.closeContext(context);
    }
  }

  // Cleanup resources
  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.browserLaunch) {
      try {
        await this.browserLaunch;
      } catch {
        this.browser = null;
      }
    }
    if (this.browser) {
      await this.browser.close();
      this.logger.log("Puppeteer browser instance closed");
    }
  }
}
