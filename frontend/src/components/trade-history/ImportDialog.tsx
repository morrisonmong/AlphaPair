"use client";

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Upload, 
  Download, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { 
  importTradeHistory, 
  downloadImportTemplate, 
  validateImportFile,
  rollbackImportSession,
  type ProcessedImportResult 
} from '@/lib/api/trade-history';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

// 導入步驟枚舉
enum ImportStep {
  SELECT_FILE = 'select_file',
  PREVIEW_FILE = 'preview_file',
  UPLOADING = 'uploading',
  RESULT = 'result'
}

// 文件預覽數據接口
interface FilePreview {
  fileName: string;
  fileSize: string;
  fileType: string;
  rowCount: number;
  preview: Array<Record<string, string | number>>;
  headers: string[];
}

export function ImportDialog({ isOpen, onClose, onImportSuccess }: ImportDialogProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep>(ImportStep.SELECT_FILE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<ProcessedImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 重置狀態
  const resetState = () => {
    setCurrentStep(ImportStep.SELECT_FILE);
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 處理對話框關閉
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 解析文件並生成預覽
  const parseFileForPreview = async (file: File): Promise<FilePreview> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
                      const data: Array<Record<string, string | number>> = [];
            let headers: string[] = [];
            let rowCount = 0;
          
          if (file.name.endsWith('.csv')) {
            // 解析CSV
            const textContent = content as string;
            const lines = textContent.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              rowCount = lines.length - 1; // 減去標題行
              
              for (let i = 1; i < Math.min(lines.length, 6); i++) { // 最多預覽5行數據
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const row: Record<string, string | number> = {};
                headers.forEach((header, index) => {
                  row[header] = values[index] || '';
                });
                data.push(row);
              }
            }
          } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // 解析Excel
            const arrayBuffer = content as ArrayBuffer;
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // 轉換為JSON格式
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
            
            if (jsonData.length > 0) {
              // 第一行作為標題
              headers = jsonData[0].map((h: unknown) => String(h || '').trim());
              rowCount = jsonData.length - 1; // 減去標題行
              
              // 預覽前5行數據
              for (let i = 1; i < Math.min(jsonData.length, 6); i++) {
                const row: Record<string, string | number> = {};
                headers.forEach((header, index) => {
                  const value = jsonData[i][index];
                  row[header] = value !== undefined && value !== null ? String(value) : '';
                });
                data.push(row);
              }
            }
          } else {
            throw new Error('不支援的文件格式');
          }
          
          resolve({
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            fileType: file.name.split('.').pop()?.toUpperCase() || 'Unknown',
            rowCount,
            preview: data,
            headers
          });
        } catch (error) {
          reject(new Error(`文件解析失敗: ${error instanceof Error ? error.message : '未知錯誤'}`));
        }
      };
      
      reader.onerror = () => reject(new Error('文件讀取失敗'));
      
      // 根據文件類型選擇讀取方式
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file, 'utf-8');
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  };

  // 處理文件選擇（現在只是預覽，不立即上傳）
  const handleFileSelect = async (file: File) => {
    // 驗證文件
    const validation = validateImportFile(file);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }

    try {
      // 解析文件並生成預覽
      const preview = await parseFileForPreview(file);
      setSelectedFile(file);
      setFilePreview(preview);
      setCurrentStep(ImportStep.PREVIEW_FILE);
      toast.success('文件解析成功，請確認內容後上傳');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件解析失敗';
      toast.error(errorMessage);
    }
  };

  // 確認上傳文件
  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    setCurrentStep(ImportStep.UPLOADING);
    setUploadProgress(0);
    setImportResult(null);

    try {
      // 設置初始進度
      setUploadProgress(10);
      
      // 調用真實的API
      const result = await importTradeHistory(selectedFile);
      
      // 完成進度
      setUploadProgress(100);
      setImportResult(result);
      setCurrentStep(ImportStep.RESULT);

      if (result.success) {
        toast.success(`成功導入 ${result.successful_imports} 筆交易記錄`);
        onImportSuccess?.();
      } else {
        toast.warning(`導入完成，但有 ${result.failed_imports} 筆記錄失敗`);
      }
    } catch (error) {
      setUploadProgress(0);
      const errorMessage = error instanceof Error ? error.message : '導入失敗';
      toast.error(errorMessage);
      
      // 設置錯誤結果
      setImportResult({
        success: false,
        message: errorMessage,
        total_processed: 0,
        successful_imports: 0,
        failed_imports: 0,
        errors: [],
        successful_trades: []
      });
      setCurrentStep(ImportStep.RESULT);
    } finally {
      // 上傳完成，狀態已在try/catch中設置
    }
  };

  // 返回文件選擇步驟
  const handleBackToSelect = () => {
    setCurrentStep(ImportStep.SELECT_FILE);
    setSelectedFile(null);
    setFilePreview(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 處理文件輸入變化
  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // 處理拖拽
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // 觸發文件選擇
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // 下載模板
  const handleDownloadTemplate = () => {
    try {
      downloadImportTemplate();
      toast.success('模板下載已開始');
    } catch {
      toast.error('模板下載失敗');
    }
  };

  // 撤銷導入
  const handleRollbackImport = async (importSessionId: string) => {
    try {
      const result = await rollbackImportSession(importSessionId);
      toast.success(`成功撤銷導入，刪除了 ${result.deleted_count} 筆記錄`);
      
      // 重新獲取數據
      onImportSuccess?.();
      
      // 關閉對話框
      handleClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '撤銷導入失敗';
      toast.error(errorMessage);
    }
  };

  // 渲染文件選擇步驟
  const renderSelectFileStep = () => (
    <div className="space-y-6">
      {/* 下載模板區域 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">1. 下載導入模板</h3>
        <Button 
          variant="outline" 
          onClick={handleDownloadTemplate}
          className="w-full justify-start"
        >
          <Download className="h-4 w-4 mr-2" />
          下載 Excel 模板
        </Button>
        
        {/* 自動計算功能說明 */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <div className="space-y-1">
              <p className="font-medium">🤖 智能功能說明：</p>
              <ul className="text-xs space-y-0.5 ml-4">
                <li>• 交易名稱：可填寫完整名稱，或僅填多空標的讓系統自動生成</li>
                <li>• 自動計算：淨盈虧、風險收益比、持倉時間等欄位會自動計算</li>
                <li>• 標的補全：支援簡寫（如 btc → BTCUSDT）和自動轉大寫</li>
                <li>• 時間格式：支援 &quot;2024-01-15 14:30&quot; 或 &quot;2024-01-15 14:30:25&quot;</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                詳細說明請參考模板中的🤖標記欄位和註釋
              </p>
            </div>
          </AlertDescription>
        </Alert>
      </div>

      <Separator />

      {/* 文件上傳區域 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">2. 選擇文件</h3>
        
        {/* 拖拽上傳區域 */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileInputChange}
            className="hidden"
          />
          
          <div className="space-y-4">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                拖拽文件到此處，或{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-primary"
                  onClick={triggerFileSelect}
                >
                  點擊選擇文件
                </Button>
              </p>
              <p className="text-xs text-muted-foreground">
                支持 CSV、Excel 格式，文件大小限制 10MB
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染文件預覽步驟
  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">3. 確認文件內容</h3>
        
        {filePreview && (
          <div className="space-y-4">
            {/* 文件信息 */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{filePreview.fileName}</span>
                <Badge variant="outline">{filePreview.fileType}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                文件大小: {filePreview.fileSize} | 數據行數: {filePreview.rowCount}
              </div>
            </div>

            {/* 數據預覽 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">數據預覽 (前5行)</h4>
              <div className="border rounded-lg w-full">
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="overflow-x-auto w-full table-scrollbar">
                    <table className="text-sm" style={{ minWidth: 'max-content' }}>
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          {filePreview.headers.map((header, index) => (
                            <th key={index} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filePreview.preview.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t">
                            {filePreview.headers.map((header, colIndex) => (
                              <td key={colIndex} className="px-3 py-2 whitespace-nowrap">
                                {row[header] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                💡 提示：如果表格內容較寬，可以在表格區域內水平滾動查看所有欄位
              </div>
            </div>

            {/* 提示信息 */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                請確認數據格式正確。如果發現問題，請返回重新選擇文件。
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );

  // 渲染上傳進度步驟
  const renderUploadingStep = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">4. 正在導入</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-center">正在處理文件...</p>
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染結果步驟
  const renderResultStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">導入結果</h3>
        
        {importResult && (
          <>
            {/* 結果摘要 */}
            <Alert className={importResult.success ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'}>
              <div className="flex items-center gap-2">
                {importResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                )}
                <AlertDescription className="font-medium">
                  {importResult.message}
                </AlertDescription>
              </div>
            </Alert>

            {/* 統計數據 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center space-y-1">
                <div className="text-lg font-semibold">{importResult.total_processed}</div>
                <div className="text-xs text-muted-foreground">總處理</div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-lg font-semibold text-green-600">{importResult.successful_imports}</div>
                <div className="text-xs text-muted-foreground">成功</div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-lg font-semibold text-red-600">{importResult.failed_imports}</div>
                <div className="text-xs text-muted-foreground">失敗</div>
              </div>
            </div>

            {/* 詳細結果表格 */}
            {(importResult.successful_trades && importResult.successful_trades.length > 0) || 
             (importResult.errors && importResult.errors.length > 0) ? (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">詳細結果</h4>
                
                <div className="border rounded-lg">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium w-16">行號</th>
                          <th className="px-3 py-2 text-left font-medium w-20">狀態</th>
                          <th className="px-3 py-2 text-left font-medium">交易名稱/錯誤原因</th>
                          <th className="px-3 py-2 text-left font-medium w-24">欄位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 成功的記錄 */}
                        {importResult.successful_trades?.map((trade, index) => (
                          <tr key={`success-${index}`} className="border-t">
                            <td className="px-3 py-2">{trade.row}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                成功
                              </Badge>
                            </td>
                            <td className="px-3 py-2">{trade.trade_name}</td>
                            <td className="px-3 py-2 text-muted-foreground">-</td>
                          </tr>
                        ))}
                        
                        {/* 失敗的記錄 */}
                        {importResult.errors?.map((error, index) => (
                          <tr key={`error-${index}`} className="border-t">
                            <td className="px-3 py-2">{error.row}</td>
                            <td className="px-3 py-2">
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                失敗
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-red-600">{error.message}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {error.field || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  💡 提示：表格可滾動查看所有結果。失敗的記錄不會影響成功導入的數據。
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  // 渲染底部按鈕
  const renderFooterButtons = () => {
    switch (currentStep) {
      case ImportStep.SELECT_FILE:
        return (
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
          </div>
        );
      case ImportStep.PREVIEW_FILE:
        return (
          <div className="flex justify-start gap-2">
            <Button variant="outline" onClick={handleBackToSelect}>
              重新選擇
            </Button>
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
            <Button onClick={handleConfirmUpload}>
              確認導入
            </Button>
          </div>
        );
      case ImportStep.UPLOADING:
        return (
          <div className="flex justify-end">
            <Button variant="outline" disabled>
              處理中...
            </Button>
          </div>
        );
      case ImportStep.RESULT:
        return (
          <div className="flex justify-start gap-2">
            <Button variant="outline" onClick={handleBackToSelect}>
              導入更多
            </Button>
            {importResult?.import_session_id && importResult.successful_imports > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => handleRollbackImport(importResult.import_session_id!)}
                className="bg-red-600 hover:bg-red-700"
              >
                撤銷此次導入
              </Button>
            )}
            <Button onClick={handleClose}>
              完成
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            導入交易歷史
          </DialogTitle>
          <DialogDescription>
            {currentStep === ImportStep.SELECT_FILE && "選擇 CSV 或 Excel 文件來導入您的交易記錄"}
            {currentStep === ImportStep.PREVIEW_FILE && "確認文件內容後開始導入"}
            {currentStep === ImportStep.UPLOADING && "正在處理您的文件，請稍候..."}
            {currentStep === ImportStep.RESULT && "導入完成，查看結果詳情"}
          </DialogDescription>
        </DialogHeader>

        {/* 主要內容區域 */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {currentStep === ImportStep.SELECT_FILE && renderSelectFileStep()}
          {currentStep === ImportStep.PREVIEW_FILE && renderPreviewStep()}
          {currentStep === ImportStep.UPLOADING && renderUploadingStep()}
          {currentStep === ImportStep.RESULT && renderResultStep()}
        </div>

        {/* 底部按鈕 */}
        <div className="flex-shrink-0 pt-4 border-t">
          {renderFooterButtons()}
        </div>
      </DialogContent>
    </Dialog>
  );
} 