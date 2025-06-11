import { format, subDays, startOfDay, startOfMonth, startOfQuarter } from 'date-fns';

// 格式化日期為 YYYY-MM-DD 格式
export const formatDateToYYYYMMDD = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

// 根據時間範圍獲取開始日期
export const getStartDateByTimeRange = (currentDate: Date, timeRange: string): Date | undefined => {
  const today = startOfDay(currentDate);
  
  switch (timeRange) {
    case 'today':
      return today;
    case '7d': // 保留對 dashboard 的兼容
    case '7days':
      return subDays(today, 7);
    case '30d': // 保留對 dashboard 的兼容
    case '30days':
      return subDays(today, 30);
    case '90d': // 保留對 dashboard 的兼容
    case '90days':
      return subDays(today, 90);
    case '180d': // 保留對 dashboard 的兼容
    case '180days':
      return subDays(today, 180);
    case '1y': // 保留對 dashboard 的兼容 (如果 dashboard 仍在使用)
      return subDays(today, 365);
    case 'month':
      return startOfMonth(today);
    case 'quarter':
      return startOfQuarter(today);
    case 'all':
      return undefined; //獲取所有數據時，不定義開始日期
    default:
      console.warn(`[getStartDateByTimeRange] Unknown timeRange: "${timeRange}", defaulting to undefined (all data).`);
      return undefined;
  }
}; 