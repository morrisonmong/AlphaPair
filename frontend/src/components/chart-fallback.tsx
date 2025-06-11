import React from 'react';

interface ChartFallbackProps {
  title: string;
}

export const ChartFallback: React.FC<ChartFallbackProps> = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-full p-4">
    <p className="text-sm text-muted-foreground mb-2">{title} 載入失敗</p>
    <p className="text-xs text-muted-foreground">請嘗試重新載入頁面</p>
  </div>
); 