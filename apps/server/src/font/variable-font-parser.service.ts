import { Injectable } from "@nestjs/common";
import type { FontAxis, VariableFontInfo } from "@reactive-resume/utils";

@Injectable()
export class VariableFontParserService {
  /**
   * 解析字体文件，检测是否为可变字体并提取轴参数
   */
  parseFont(buffer: Buffer, _fileName: string): VariableFontInfo {
    try {
      // 基础检测：检查文件中是否包含 FVAR 表的标志
      const isVariable = this.hasVariableFontTable(buffer);

      if (!isVariable) {
        return {
          isVariable: false,
          axes: [],
        };
      }

      // 如果是可变字体，返回默认轴配置
      const axes = this.getDefaultAxes();

      return {
        isVariable: true,
        axes,
        namedInstances: [],
      };
    } catch {
      return {
        isVariable: false,
        axes: [],
      };
    }
  }

  /**
   * 基础检测：检查字体文件是否包含可变字体表
   */
  private hasVariableFontTable(buffer: Buffer): boolean {
    try {
      // 检查 FVAR 表（Variable Font 标志）
      const fvarSignature = Buffer.from("fvar", "ascii");
      return buffer.includes(fvarSignature);
    } catch {
      return false;
    }
  }

  /**
   * 获取默认的字体轴配置
   */
  private getDefaultAxes(): FontAxis[] {
    return [
      {
        tag: "wght",
        name: "Weight",
        min: 100,
        max: 900,
        default: 400,
        step: 1,
      },
      {
        tag: "wdth",
        name: "Width",
        min: 75,
        max: 125,
        default: 100,
        step: 1,
      },
    ];
  }

  /**
   * 生成可变字体的 CSS
   */
  generateVariableFontCSS(
    customFont: { family: string; url: string; format: string; variableFont?: VariableFontInfo },
    coordinates?: Record<string, number>,
  ): string {
    let css = `
@font-face {
  font-family: '${customFont.family}';
  src: url('${customFont.url}') format('${customFont.format}');
  font-display: swap;`;

    if (customFont.variableFont?.isVariable && coordinates) {
      const settings = Object.entries(coordinates)
        .map(([tag, value]) => `"${tag}" ${value}`)
        .join(", ");

      css += `
  font-variation-settings: ${settings};`;
    }

    css += `
}`;

    return css;
  }

  /**
   * 生成字体变体 CSS 类
   */
  generateVariantClasses(customFont: { family: string; variableFont?: VariableFontInfo }): string {
    if (!customFont.variableFont?.isVariable) {
      return "";
    }

    let css = "";
    const familyClass = customFont.family.replace(/\s+/g, "-").toLowerCase();

    // 为权重轴生成便捷类
    const weightAxis = customFont.variableFont.axes.find((axis) => axis.tag === "wght");
    if (weightAxis) {
      const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
      for (const weight of weights) {
        if (weight >= weightAxis.min && weight <= weightAxis.max) {
          css += `
.font-${familyClass}-${weight} {
  font-family: '${customFont.family}';
  font-variation-settings: "wght" ${weight};
}`;
        }
      }
    }

    // 为宽度轴生成便捷类
    const widthAxis = customFont.variableFont.axes.find((axis) => axis.tag === "wdth");
    if (widthAxis) {
      const widths = [
        { value: 75, class: "condensed" },
        { value: 87.5, class: "semi-condensed" },
        { value: 100, class: "normal" },
        { value: 112.5, class: "semi-expanded" },
        { value: 125, class: "expanded" },
      ];

      for (const { value: width, class: widthClass } of widths) {
        if (width >= widthAxis.min && width <= widthAxis.max) {
          css += `
.font-${familyClass}-${widthClass} {
  font-family: '${customFont.family}';
  font-variation-settings: "wdth" ${width};
}`;
        }
      }
    }

    return css;
  }
}
