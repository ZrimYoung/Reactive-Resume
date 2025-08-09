import { t } from "@lingui/macro";
import { Info, Upload, X } from "@phosphor-icons/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@reactive-resume/ui";
import { customFontUtils } from "@reactive-resume/utils";
import { useCallback, useRef, useState } from "react";

import { useBuilderStore } from "@/client/stores/builder";

type FontUploadDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (fontFamily: string, fontData?: Record<string, unknown>) => void;
};

type UploadState = {
  uploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
};

export const FontUploadDialog = ({ isOpen, onClose, onSuccess }: FontUploadDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fontFamily, setFontFamily] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useBuilderStore((state) => state.frame.ref);

  // 重置状态
  const resetState = useCallback(() => {
    setSelectedFile(null);
    setFontFamily("");
    setUploadState({
      uploading: false,
      progress: 0,
      error: null,
      success: false,
    });
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback((file: File) => {
    setUploadState((prev) => ({ ...prev, error: null }));

    // 验证文件
    const validation = customFontUtils.validateFontFile(file);
    if (!validation.valid) {
      setUploadState((prev) => ({ ...prev, error: validation.error ?? "文件验证失败" }));
      return;
    }

    setSelectedFile(file);

    // 自动提取字体家族名
    const extractedFamily = customFontUtils.extractFontFamily(file.name);
    setFontFamily(extractedFamily);
  }, []);

  // 处理拖拽上传
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      // 使用扩展运算符将 FileList 转为数组，避免迭代器类型告警
      const files = [...(e.dataTransfer.files as unknown as File[])];
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // 处理文件输入
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  // 上传字体
  const handleUpload = useCallback(async () => {
    if (!selectedFile || !fontFamily.trim()) {
      setUploadState((prev) => ({ ...prev, error: "请选择文件并输入字体名称" }));
      return;
    }

    setUploadState((prev) => ({ ...prev, uploading: true, progress: 0, error: null }));

    try {
      const formData = new FormData();
      formData.append("font", selectedFile);
      formData.append("fontFamily", fontFamily.trim());
      formData.append("category", "custom");

      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadState((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + Math.random() * 30, 90),
        }));
      }, 200);

      const response = await fetch("/api/fonts/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`上传失败: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setUploadState((prev) => ({ ...prev, progress: 100, success: true, uploading: false }));

        // 通知 artboard 刷新字体
        frameRef?.contentWindow?.postMessage({ type: "REFETCH_FONTS" }, "*");

        // 等待一下让用户看到成功状态
        setTimeout(() => {
          onSuccess(fontFamily.trim(), result.data);
          resetState();
          onClose();
        }, 1000);
      } else {
        throw new Error(result.message || "上传失败");
      }
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        uploading: false,
        error: error instanceof Error ? error.message : "上传失败",
      }));
    }
  }, [selectedFile, fontFamily, onSuccess, onClose, resetState, frameRef]);

  // 关闭对话框
  const handleClose = useCallback(() => {
    if (!uploadState.uploading) {
      resetState();
      onClose();
    }
  }, [uploadState.uploading, resetState, onClose]);

  // 移除选中的文件
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFontFamily("");
    setUploadState((prev) => ({ ...prev, error: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`上传自定义字体`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <Info className="size-4" />
            <AlertTitle>{t`提示`}</AlertTitle>
            <AlertDescription>
              {t`当前系统对可变字体（Variable Fonts）支持最佳。为确保所有字重和样式能正常工作，建议优先上传VF字体。`}
            </AlertDescription>
          </Alert>

          {/* 文件上传区域 */}
          <div className="space-y-4">
            <Label htmlFor="fontFile">{t`选择字体文件`}</Label>

            {selectedFile ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Upload className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={uploadState.uploading}
                    onClick={handleRemoveFile}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-primary/50"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto mb-4 size-12 text-gray-400" />
                <p className="mb-2 text-gray-600">{t`点击选择或拖拽字体文件到此处`}</p>
                <p className="text-sm text-gray-500">
                  {t`支持 TTF, OTF, WOFF, WOFF2 格式，最大 50MB`}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  id="fontFile"
                  aria-label={t`选择字体文件`}
                  title={t`选择字体文件`}
                  onChange={handleFileInput}
                />
              </div>
            )}
          </div>

          {/* 字体名称输入 */}
          {selectedFile && (
            <div className="space-y-2">
              <Label htmlFor="fontFamily">{t`字体名称`}</Label>
              <Input
                id="fontFamily"
                value={fontFamily}
                placeholder={t`请输入字体名称`}
                disabled={uploadState.uploading}
                onChange={(e) => {
                  setFontFamily(e.target.value);
                }}
              />
            </div>
          )}

          {/* 上传进度 */}
          {uploadState.uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t`上传中...`}</span>
                <span>{Math.round(uploadState.progress)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {uploadState.error && <Alert variant="error">{uploadState.error}</Alert>}

          {/* 成功信息 */}
          {uploadState.success && <Alert>{t`字体上传成功！`}</Alert>}

          {/* 操作按钮 */}
          <div className="flex justify-end space-x-3">
            <Button variant="outline" disabled={uploadState.uploading} onClick={handleClose}>
              {t`取消`}
            </Button>
            <Button
              disabled={!selectedFile || !fontFamily.trim() || uploadState.uploading}
              onClick={handleUpload}
            >
              {uploadState.uploading ? t`上传中...` : t`上传字体`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
