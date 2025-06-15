import { HttpService } from "@nestjs/axios";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResumeDto } from "@reactive-resume/dto";
import { ErrorMessage } from "@reactive-resume/utils";
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
      // 如果浏览器实例不存在或已断开连接，则创建新实例
      if (!this.browser?.connected) {
        this.logger.log("启动本地 Puppeteer 浏览器实例...");

        this.browser = await launch({
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
        });

        this.logger.log("Puppeteer 浏览器实例已启动");
      }

      return this.browser;
    } catch (error) {
      this.logger.error("无法启动 Puppeteer 浏览器:", error);
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

  async printResume(resume: ResumeDto) {
    const start = performance.now();

    const url = await retry<string | undefined>(() => this.generateResume(resume), {
      retries: 3,
      randomize: true,
      onRetry: (_, attempt) => {
        this.logger.log(`重试打印简历 #${resume.id}，第 ${attempt} 次尝试`);
      },
    });

    const duration = Number(performance.now() - start).toFixed(0);
    const numberPages = resume.data.metadata?.layout?.length || 1;

    this.logger.debug(`PDF 生成耗时 ${duration}ms，共 ${numberPages} 页`);

    return url;
  }

  async printPreview(resume: ResumeDto) {
    const start = performance.now();

    const url = await retry(() => this.generatePreview(resume), {
      retries: 3,
      randomize: true,
      onRetry: (_, attempt) => {
        this.logger.log(`重试生成简历预览 #${resume.id}，第 ${attempt} 次尝试`);
      },
    });

    const duration = Number(performance.now() - start).toFixed(0);

    this.logger.debug(`预览生成耗时 ${duration}ms`);

    return url;
  }

  async generateResume(resume: ResumeDto) {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // 本地模式下不需要 host.docker.internal 转换
      const url = publicUrl;

      // Set the data of the resume to be printed in the browser's session storage
      const numberPages = resume.data.metadata?.layout?.length || 1;

      // 确保在传递数据时正确处理CSS状态
      const resumeDataForPrint = {
        ...resume.data,
        metadata: {
          ...resume.data.metadata,
          css: {
            value: resume.data.metadata?.css?.value || "",
            visible: resume.data.metadata?.css?.visible === true, // 明确转换为布尔值
          },
        },
      };

      this.logger.debug(`PDF生成 - CSS状态: ${resumeDataForPrint.metadata.css.visible}`);
      this.logger.debug(`PDF生成 - CSS内容长度: ${resumeDataForPrint.metadata.css.value.length}`);
      this.logger.debug(`PDF生成 - 简历ID: ${resume.id}`);

      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
        console.log("PDF生成 - 注入的简历数据", JSON.stringify(data, null, 2));
      }, resumeDataForPrint);

      await page.goto(`${url}/artboard/preview`, { waitUntil: "networkidle0" });

      // 等待所有字体加载完成，包括自定义字体
      await page.evaluate(async () => {
        // 等待document.fonts.ready
        await document.fonts.ready;

        // 额外等待以确保自定义字体完全加载
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });

      const pagesBuffer: Buffer[] = [];

      const processPage = async (index: number) => {
        const pageElement = await page.$(`[data-page="${index}"]`);
        // eslint-disable-next-line unicorn/no-await-expression-member
        const width = (await (await pageElement?.getProperty("scrollWidth"))?.jsonValue()) ?? 0;
        // eslint-disable-next-line unicorn/no-await-expression-member
        const height = (await (await pageElement?.getProperty("scrollHeight"))?.jsonValue()) ?? 0;

        const temporaryHtml = await page.evaluate((element: HTMLDivElement) => {
          const clonedElement = element.cloneNode(true) as HTMLDivElement;
          const temporaryHtml_ = document.body.innerHTML;
          document.body.innerHTML = clonedElement.outerHTML;
          return temporaryHtml_;
        }, pageElement);

        const uint8array = await page.pdf({ width, height, printBackground: true });
        const buffer = Buffer.from(uint8array);
        pagesBuffer.push(buffer);

        await page.evaluate((temporaryHtml_: string) => {
          document.body.innerHTML = temporaryHtml_;
        }, temporaryHtml);
      };

      // Loop through all the pages and print them, by first displaying them, printing the PDF and then hiding them back
      for (let index = 1; index <= numberPages; index++) {
        await processPage(index);
      }

      // Using 'pdf-lib', merge all the pages from their buffers into a single PDF
      const pdf = await PDFDocument.create();

      for (const element of pagesBuffer) {
        const page = await PDFDocument.load(element);
        const [copiedPage] = await pdf.copyPages(page, [0]);
        pdf.addPage(copiedPage);
      }

      // Save the PDF to storage and return the URL to download the resume
      // Store the URL in cache for future requests, under the previously generated hash digest
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
      this.logger.error("生成PDF时出错:", error);

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

      const publicUrl = this.configService.getOrThrow<string>("PUBLIC_URL");

      // 本地模式下不需要 host.docker.internal 转换
      const url = publicUrl;

      // Set the data of the resume to be printed in the browser's session storage
      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
      }, resume.data);

      await page.setViewport({ width: 794, height: 1123 });

      await page.goto(`${url}/artboard/preview`, { waitUntil: "networkidle0" });

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
      this.logger.error("生成预览时出错:", error);

      throw new InternalServerErrorException(
        ErrorMessage.ResumePrinterError,
        (error as Error).message,
      );
    }
  }

  // 清理资源的方法
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log("Puppeteer 浏览器实例已关闭");
    }
  }
}
