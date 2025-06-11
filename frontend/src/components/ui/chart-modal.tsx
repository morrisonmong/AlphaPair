'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';

interface ChartModalProps {
  title: string;
  children: React.ReactNode;
  detailedView?: React.ReactNode;
}

export const ChartModal: React.FC<ChartModalProps> = ({ 
  title, 
  children, 
  detailedView
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 展開按鈕 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/10"
        onClick={() => setIsOpen(true)}
      >
        <Maximize2 className="h-3 w-3" />
      </Button>

      {/* 全螢幕模態 - 修復高度問題 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[98vw] max-h-[98vh] w-full h-[98vh] p-0 flex flex-col overflow-hidden sm:max-w-[98vw]">
          <DialogHeader className="p-3 sm:p-4 pb-2 sm:pb-3 border-b flex-shrink-0 bg-background relative">
            <DialogTitle className="text-base sm:text-lg font-semibold pr-8">{title}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 p-3 sm:p-4 overflow-hidden min-h-0 bg-background">
            <div className="h-full w-full overflow-hidden">
              {detailedView || children}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// 包裝組件，為圖表添加懸停組和全螢幕功能
interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  detailedView?: React.ReactNode;
  className?: string;
}

export const ChartWrapper: React.FC<ChartWrapperProps> = ({ 
  title, 
  children, 
  detailedView,
  className = "" 
}) => {
  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* 將展開按鈕移到容器層級的右上角，避免與圖表重疊 */}
      <div className="absolute top-2 right-2 z-20">
        <ChartModal title={title} detailedView={detailedView}>
          {children}
        </ChartModal>
      </div>
      <div className="group h-full w-full">
        {children}
      </div>
    </div>
  );
};

// 新的包裝組件，將放大按鈕放在標題區域
interface ChartWrapperWithTitleProps {
  title: string;
  children: React.ReactNode;
  detailedView?: React.ReactNode;
  className?: string;
  helpTooltip?: React.ReactNode;
  statisticsInfo?: React.ReactNode;
}

export const ChartWrapperWithTitle: React.FC<ChartWrapperWithTitleProps> = ({ 
  title, 
  children, 
  detailedView,
  className = "",
  helpTooltip,
  statisticsInfo
}) => {
  return (
    <div className={`h-full w-full ${className}`}>
      {/* 標題區域，包含標題、幫助提示和放大按鈕 */}
      <div className="flex items-center justify-between h-6 mb-2">
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold">{title}</span>
          {helpTooltip}
        </div>
        <div className="flex items-center gap-1">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ChartModal title={title} detailedView={detailedView}>
              {children}
            </ChartModal>
          </div>
        </div>
      </div>
      
      {/* 統計信息區域 - 如果有統計信息，顯示在標題下方 */}
      {statisticsInfo && (
        <div className="mb-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 border border-border/50">
          {statisticsInfo}
        </div>
      )}
      
      {/* 圖表內容區域 - 根據是否有統計信息調整高度 */}
      <div className="group flex-1 w-full relative" style={{ height: statisticsInfo ? 'calc(100% - 3.5rem)' : 'calc(100% - 1.5rem)' }}>
        {children}
      </div>
    </div>
  );
}; 