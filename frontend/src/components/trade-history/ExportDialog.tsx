"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Download, 
  FileText,
  FileSpreadsheet,
  Loader2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { exportTradeHistory, type ExportTradeHistoryParams } from '@/lib/api/trade-history';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // 當前篩選條件
  startDate?: string;
  endDate?: string;
  totalRecords: number;
  dateRangeText: string;
}

export function ExportDialog({ 
  isOpen, 
  onClose, 
  startDate, 
  endDate, 
  totalRecords,
  dateRangeText 
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel'>('excel');
  const [isExporting, setIsExporting] = useState(false);

  // 重置狀態
  const resetState = () => {
    setSelectedFormat('excel');
    setIsExporting(false);
  };

  // 處理對話框關閉
  const handleClose = () => {
    if (!isExporting) {
      resetState();
      onClose();
    }
  };

  // 處理匯出
  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const params: ExportTradeHistoryParams = {
        start_date: startDate,
        end_date: endDate,
        format: selectedFormat
      };
      
      await exportTradeHistory(params);
      
      toast.success('匯出成功！檔案已開始下載');
      handleClose();
    } catch (error) {
      console.error('匯出失敗:', error);
      
      // 處理錯誤信息
      let errorMessage = '匯出失敗，請稍後再試';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { detail?: string; message?: string } } };
        if (axiosError.response?.data) {
          errorMessage = axiosError.response.data.detail || axiosError.response.data.message || errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            匯出交易歷史
          </DialogTitle>
          <DialogDescription>
            匯出當前篩選條件下的交易記錄，格式與匯入模板完全相容
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 匯出範圍信息 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">匯出範圍</span>
              <Badge variant="outline" className="text-xs">
                {dateRangeText}
              </Badge>
            </div>
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                將匯出 <span className="font-semibold text-primary">{totalRecords}</span> 筆交易記錄
                {totalRecords === 0 && (
                  <span className="text-destructive">（無法匯出空資料）</span>
                )}
              </AlertDescription>
            </Alert>
          </div>

          <Separator />

          {/* 格式選擇 */}
          <div className="space-y-3">
            <span className="text-sm font-medium">匯出格式</span>
            <Select 
              value={selectedFormat} 
              onValueChange={(value: 'csv' | 'excel') => setSelectedFormat(value)}
              disabled={isExporting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>CSV 格式 (.csv)</span>
                  </div>
                </SelectItem>
                <SelectItem value="excel">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Excel 格式 (.xlsx)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 格式說明 */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• 匯出的檔案包含所有必填和選填欄位</p>
            <p>• 時間格式為台北時間 (UTC+8)</p>
            <p>• 匯出的檔案可直接用於重新匯入</p>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-end gap-2 pt-4">
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={isExporting}
          >
            取消
          </Button>
          <Button 
            onClick={handleExport}
            disabled={isExporting || totalRecords === 0}
            className="min-w-[120px]"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                匯出中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                匯出 {selectedFormat === 'excel' ? 'Excel' : 'CSV'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 