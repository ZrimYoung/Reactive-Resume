import { HttpService } from "@nestjs/axios";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData, type ResumeData } from "@reactive-resume/schema";
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

      // 1) 显式对象合并：与 Artboard Providers 一致（数组覆盖不拼接）
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

      this.logger.debug(`PDF生成 - CSS状态: ${resumeDataForPrint.metadata.css.visible}`);
      this.logger.debug(`PDF生成 - CSS内容长度: ${resumeDataForPrint.metadata.css.value.length}`);
      this.logger.debug(`PDF生成 - 简历ID: ${resume.id}`);

      await page.evaluateOnNewDocument((data) => {
        window.localStorage.setItem("resume", JSON.stringify(data));
      }, resumeDataForPrint);

      await page.goto(`${url}/artboard/preview`, { waitUntil: "networkidle0" });
      await page.emulateMediaType("screen");

      // 等待所有字体与图片资源加载完成，确保与 Artboard 视觉一致
      await page.evaluate(async () => {
        // 1) 等待字体就绪
        await (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready;

        // 2) 等待所有图片（包括头像、自定义图像）加载完成
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

        // 3) 移除预览样式里的 body 溢出裁剪，避免 PDF 高度被剪切
        document.documentElement.style.overflow = "visible";
        document.body.style.overflow = "visible";
        document.documentElement.style.height = "auto";
        document.body.style.height = "auto";

        // 4) 给予少量缓冲，保证脚本驱动的图标/样式完成绘制
        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      // 追加仅用于打印的兜底样式，尽量避免内容被裁剪
      await page.addStyleTag({
        content: `
          html, body { overflow: visible !important; height: auto !important; }
          [data-page] { height: auto !important; min-height: auto !important; overflow: visible !important; }
          [data-page] * { overflow: visible !important; }
        `,
      });

      const pagesBuffer: Buffer[] = [];

      const processPage = async (index: number) => {
        const pageElement = await page.$(`[data-page="${index}"]`);
        if (!pageElement) throw new Error(`[data-page="${index}"] not found`);

        // 隔离当前页：仅显示目标页，隐藏其它页，避免资源与布局丢失
        await page.addStyleTag({
          content: `
            [data-page] { display: none !important; }
            [data-page="${index}"] { display: block !important; }
          `,
        });

        // 稍作等待，确保样式生效与布局稳定
        await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

        // 精确测量尺寸（包含文档层面的溢出高度，避免底部被裁剪）
        const { width, height } = await page.evaluate(
          (element: HTMLDivElement) => {
            const rect = element.getBoundingClientRect();
            const w = Math.ceil(
              Math.max(
                rect.width,
                element.scrollWidth,
                document.documentElement.scrollWidth,
                document.body.scrollWidth,
              ),
            );
            const h = Math.ceil(
              Math.max(
                rect.height,
                element.scrollHeight,
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
              ) + 2,
            );
            return { width: w, height: h };
          },
          pageElement as unknown as HTMLDivElement,
        );

        // 使用 Puppeteer 原生 PDF（矢量），以像素单位设定页面尺寸
        const uint8array = await page.pdf({
          width: `${width}px`,
          height: `${height}px`,
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        });
        const buffer = Buffer.from(uint8array);
        pagesBuffer.push(buffer);

        // 还原：移除隔离样式（移除最后一个 addStyleTag 注入的 <style>）
        await page.evaluate(() => {
          const styles = Array.prototype.slice.call(
            document.querySelectorAll("style"),
          ) as HTMLStyleElement[];
          const last = styles.at(-1);
          if (last) last.remove();
        });
      };

      // Loop through all the pages and print them, by first displaying them, printing the PDF and then hiding them back
      for (let index = 1; index <= numberPages; index++) {
        await processPage(index);
      }

      // 合并各页 PDF（保持矢量）
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

      // 对齐前端数据合并，规范化 CSS 字段（数组覆盖）
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

      await page.goto(`${url}/artboard/preview`, { waitUntil: "networkidle0" });

      // 等待字体与图片资源，并移除 body 溢出裁剪
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
