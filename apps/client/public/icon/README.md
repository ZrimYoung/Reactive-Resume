# 应用图标说明

本目录包含 Reactive Resume Local 桌面应用的图标文件。

## 现有文件
- `light.svg` - 浅色主题下的应用图标
- `dark.svg` - 深色主题下的应用图标

## 需要的图标格式

为了完整支持 Electron 应用构建，需要以下格式的图标：

### Windows (.ico)
- `icon.ico` - Windows 应用图标（建议尺寸：16x16, 32x32, 48x48, 64x64, 128x128, 256x256）

### macOS (.icns) 
- `icon.icns` - macOS 应用图标（建议尺寸：16x16 到 1024x1024）

### Linux (.png)
- `icon.png` - Linux 应用图标（建议尺寸：512x512 或 1024x1024）

## 生成图标建议

可以使用在线工具或以下命令生成不同格式的图标：

1. **从 SVG 生成 PNG**：
   ```bash
   # 使用 Inkscape 或 ImageMagick
   inkscape --export-png=icon.png --export-width=512 --export-height=512 light.svg
   ```

2. **生成 .ico 文件**：
   ```bash
   # 使用 ImageMagick
   convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
   ```

3. **生成 .icns 文件**：
   ```bash
   # 在 macOS 上使用 iconutil
   mkdir icon.iconset
   # 创建不同尺寸的 PNG 文件...
   iconutil -c icns icon.iconset
   ```

## 在线工具

也可以使用在线图标生成工具：
- https://www.icoconverter.com/
- https://convertio.co/svg-ico/
- https://favicon.io/

## 临时解决方案

当前配置中的图标路径指向 `icon.png`，如果暂时没有合适的图标文件，Electron 会使用默认图标。 