'use client';

import React from 'react';

interface EnhancedTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  labelFormatter?: (label: string) => string;
  formatter?: (value: number, name: string) => string;
  currency?: string;
}

export const EnhancedTooltip: React.FC<EnhancedTooltipProps> = ({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  currency = ''
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label || '') : label;
  const total = payload.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border/80 rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-200 max-w-xs">
      {formattedLabel && (
        <p className="font-semibold text-sm text-foreground mb-2 border-b border-border/50 pb-1">
          {formattedLabel}
        </p>
      )}
      
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-foreground/90 truncate font-medium">
                {entry.name}
              </span>
            </div>
            <span className="text-xs font-bold text-foreground whitespace-nowrap">
              {formatter 
                ? formatter(entry.value, entry.name)
                : `${entry.value.toFixed(2)}${currency ? ` ${currency}` : ''}`
              }
            </span>
          </div>
        ))}
        
        {payload.length > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/50">
            <span className="text-xs text-foreground/80 font-medium">總計</span>
            <span className="text-xs font-bold text-foreground">
              {total.toFixed(2)}{currency ? ` ${currency}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// 專用於盈虧數據的 Tooltip
export const ProfitTooltip: React.FC<EnhancedTooltipProps> = ({
  active,
  payload,
  label,
  labelFormatter,
  currency = ''
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label || '') : label;
  const total = payload.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border/80 rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-200 max-w-xs">
      {formattedLabel && (
        <p className="font-semibold text-sm text-foreground mb-2 border-b border-border/50 pb-1">
          {formattedLabel}
        </p>
      )}
      
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const isProfit = entry.value >= 0;
          const colorClass = isProfit ? 'text-green-400' : 'text-red-400';
          const sign = isProfit ? '+' : '';
          
          return (
            <div key={index} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-foreground/90 truncate font-medium">
                  {entry.name}
                </span>
              </div>
              <span className={`text-xs font-bold whitespace-nowrap ${colorClass}`}>
                {sign}{entry.value.toFixed(2)}{currency ? ` ${currency}` : ''}
              </span>
            </div>
          );
        })}
        
        {payload.length > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/50">
            <span className="text-xs text-foreground/80 font-medium">總計</span>
            <span className={`text-xs font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {total >= 0 ? '+' : ''}{total.toFixed(2)}{currency ? ` ${currency}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// 專用於百分比數據的 Tooltip
export const PercentageTooltip: React.FC<EnhancedTooltipProps> = (props) => {
  return (
    <EnhancedTooltip
      {...props}
      formatter={(value) => `${value.toFixed(2)}%`}
    />
  );
}; 