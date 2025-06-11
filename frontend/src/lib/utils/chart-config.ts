// 統一的圖表配置
export const CHART_MARGINS = {
  // 統一邊距 - 所有圖表使用相同設定確保對齊
  default: {
    top: 15,
    right: 15,
    left: 15,
    bottom: 15  // 減少底部邊距
  },
  // 小屏幕邊距 - 進一步減少邊距
  small: {
    top: 10,
    right: 10,
    left: 10,
    bottom: 10
  }
} as const;

// 統一的軸設置
export const CHART_AXIS_CONFIG = {
  tickLine: false,
  axisLine: false,
  tickMargin: 6,
  style: { fontSize: '10px', fontWeight: 500 }
} as const;

// 統一的 Y 軸設置
export const CHART_Y_AXIS_CONFIG = {
  ...CHART_AXIS_CONFIG,
  tickCount: 5,
  width: 50
} as const;

// 統一的顏色配置
export const CHART_COLORS = {
  profit: '#22c55e',
  loss: '#ef4444',
  neutral: '#64748b',
  primary: '#5d6d9e',
  secondary: '#8b5cf6',
  accent: '#beb287'
} as const;

// 統一的 Tooltip 標題高度
export const CHART_TOOLTIP_HEADER_HEIGHT = 'h-6';
export const CHART_CONTENT_HEIGHT = 'h-[calc(100%-1.5rem)]'; 