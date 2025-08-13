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
      // 如果浏览器实例不存在或已断开连接，则创建新实例
      if (!this.browser?.connected) {
        this.logger.log("启动本地 Puppeteer 浏览器实例...");

        const chromePath =
          process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
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
          this.logger.log(`使用指定的 Chrome 可执行文件: ${chromePath}`);
          (launchOptions as any).executablePath = chromePath;
        }

        this.browser = await launch(launchOptions);

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
      // 使用打印媒体，保证与 PDF 渲染一致
      await page.emulateMediaType("print");

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

      // 兜底样式已前移到前端（artboard），这里不再注入覆盖性样式，避免与用户自定义 CSS 冲突

      const pagesBuffer: Buffer[] = [];

      const processPage = async (index: number) => {
        const pageElement = await page.$(`[data-page="${index}"]`);
        if (!pageElement) throw new Error(`[data-page="${index}"] not found`);

        // 隔离当前页：仅显示目标页，隐藏其它页，避免资源与布局丢失
        // 使用带 id 的 <style>，并在稍后精确移除，避免影响自定义 CSS 的注入顺序
        await page.evaluate((i) => {
          const style = document.createElement("style");
          style.id = "puppeteer-page-isolation";
          style.textContent = `
            [data-page] { display: none !important; }
            [data-page="${i}"] { display: block !important; }
          `;
          document.head.append(style);

          // 再次将自定义 CSS（如存在）移动到末尾，确保其仍在 head 最后
          const custom = document.querySelector("#custom-css");
          if (custom) document.head.append(custom);
        }, index);

        // 稍作等待，确保样式生效与布局稳定；并等待字体与图片加载
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

        // 计算是否需要缩放以“单页适配”（仅当内容超过目标纸张高度时生效）
        const contentHeightPx = await page.evaluate((i) => {
          const el = document.querySelector(`[data-page="${i}"]`);
          if (!el) return 0;
          // 使用 scrollHeight 以获得完整内容高度
          return (el as HTMLElement).scrollHeight || 0;
        }, index);

        const orientation = resumeDataForPrint.metadata.page.orientation;
        const format = resumeDataForPrint.metadata.page.format;
        const mmHeightBase = resumeDataForPrint.metadata.page.custom.enabled
          ? resumeDataForPrint.metadata.page.custom.height
          : pageSizeMap[format].height;
        const targetMmHeight =
          orientation === "landscape" ? pageSizeMap[format].width : mmHeightBase;
        const MM_TO_PX = 3.78; // 与前端一致的近似换算
        const targetPxHeight = targetMmHeight * MM_TO_PX;
        const fitScaleRaw =
          targetPxHeight > 0 && contentHeightPx > 0 ? targetPxHeight / contentHeightPx : 1;
        // 限定缩放区间，避免异常值；只在内容超出时缩小（<=1）
        const fitScale = Math.max(0.5, Math.min(1, fitScaleRaw));

        // 若需要，将当前页内容包裹并以 CSS 方式缩放到一页内，避免分页算法将整块推到下一页
        if (fitScale < 1) {
          await page.evaluate(
            (i, scale, targetPxHeight) => {
              const pageEl = document.querySelector(`[data-page="${i}"]`);
              if (!pageEl) return;

              // 仅包一次
              const pageElHtml: HTMLElement = pageEl as HTMLElement;
              let wrapper = pageElHtml.querySelector<HTMLElement>(":scope > .__fit_wrapper__");
              if (!wrapper) {
                wrapper = document.createElement("div");
                wrapper.className = "__fit_wrapper__";
                // 将现有子节点移动进 wrapper
                while (pageEl.firstChild) wrapper.append(pageEl.firstChild as Node);
                pageElHtml.append(wrapper);
              }

              // 限制可打印高度，绝对定位 + transform 缩放
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

        // 允许浏览器按 @page 自动分页；此时我们已将内容缩放进纸张高度
        const uint8array = await page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        });
        const buffer = Buffer.from(uint8array);
        pagesBuffer.push(buffer);

        // 还原：精准移除隔离样式，避免误删自定义 CSS
        await page.evaluate(() => {
          const iso = document.querySelector("#puppeteer-page-isolation");
          if (iso) iso.remove();
        });
      };

      // Loop through all the pages and print them, by first displaying them, printing the PDF and then hiding them back
      for (let index = 1; index <= numberPages; index++) {
        await processPage(index);
      }

      // 合并各页 PDF（保持矢量），并复制每次生成 PDF 的全部页
      const pdf = await PDFDocument.create();
      for (const element of pagesBuffer) {
        const doc = await PDFDocument.load(element);
        const total = doc.getPageCount();
        const indices = Array.from({ length: total }, (_, i) => i);
        const copiedPages = await pdf.copyPages(doc, indices);
        for (const p of copiedPages) pdf.addPage(p);
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
