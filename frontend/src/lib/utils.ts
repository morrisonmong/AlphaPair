import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from 'uuid';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化日期時間
 * @param date 日期對象（UTC時間）
 * @param timezone 可選的時區參數（為了向後兼容，但不再使用）
 * @returns 格式化後的日期時間字符串
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatDateTime(date: Date, timezone?: string): string {
  try {
    // 確保日期對象是有效的
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.error('無效的日期對象:', date);
      return '無效日期';
    }
    
    // 獲取UTC時間的各個部分
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    // 獲取本地時區偏移（分鐘）
    const timezoneOffset = new Date().getTimezoneOffset();
    
    // 計算本地時間（UTC時間 - 時區偏移）
    // 注意：getTimezoneOffset返回的是本地時間與UTC的差異（分鐘），西區為正，東區為負
    // 所以我們需要減去這個值來得到本地時間
    const localDate = new Date(Date.UTC(
      parseInt(year.toString()),
      parseInt(month.toString()) - 1,
      parseInt(day.toString()),
      parseInt(hours.toString()),
      parseInt(minutes.toString()) + (-timezoneOffset), // 減去負值等於加
      parseInt(seconds.toString())
    ));
    
    // 格式化本地時間
    const localYear = localDate.getFullYear();
    const localMonth = String(localDate.getMonth() + 1).padStart(2, '0');
    const localDay = String(localDate.getDate()).padStart(2, '0');
    const localHours = String(localDate.getHours()).padStart(2, '0');
    const localMinutes = String(localDate.getMinutes()).padStart(2, '0');
    const localSeconds = String(localDate.getSeconds()).padStart(2, '0');
    
    // 返回格式化的本地時間
    return `${localYear}/${localMonth}/${localDay} ${localHours}:${localMinutes}:${localSeconds}`;
  } catch (error) {
    console.error('時間格式化錯誤:', error);
    // 提供一個基本的回退格式
    return date.toString();
  }
}

/**
 * 格式化持倉時間（秒）為可讀格式
 * @param seconds 持倉時間（秒）
 * @returns 格式化後的持倉時間字符串
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m${remainingSeconds > 0 ? remainingSeconds + 's' : ''}`;
  }
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes > 0 ? remainingMinutes + 'm' : ''}`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d${remainingHours > 0 ? remainingHours + 'h' : ''}`;
}

/**
 * 計算運行時間（從創建時間到現在或平倉時間）
 * @param createdAt 創建時間字符串（UTC時間）
 * @param closedAt 平倉時間字符串（UTC時間），如果未提供則計算到當前時間
 * @returns 格式化後的運行時間字符串
 */
export function calculateRunningTime(createdAt: string, closedAt?: string | null): string {
  if (!createdAt) return '未知';
  
  try {
    // 解析創建時間
    let startTime: Date;
    if (createdAt.includes('$date')) {
      // 處理 MongoDB 格式：{"$date": "2025-05-29T02:48:35.432Z"}
      const dateStr = createdAt.replace(/.*"([^"]+)".*/, '$1');
      startTime = new Date(dateStr);
    } else {
      // 處理標準 ISO 字符串（前端 API 返回的格式）
      // 如果沒有 Z 後綴，添加 Z 表示 UTC 時間
      const isoString = createdAt.endsWith('Z') ? createdAt : createdAt + 'Z';
      startTime = new Date(isoString);
    }
    
    // 檢查日期是否有效
    if (isNaN(startTime.getTime())) {
      console.error('無效的創建時間:', createdAt);
      return '未知';
    }
    
    // 結束時間（平倉時間或當前時間）
    let endTime: Date;
    if (closedAt) {
      if (closedAt.includes('$date')) {
        // 處理 MongoDB 格式
        const dateStr = closedAt.replace(/.*"([^"]+)".*/, '$1');
        endTime = new Date(dateStr);
      } else {
        // 處理標準 ISO 字符串
        const isoString = closedAt.endsWith('Z') ? closedAt : closedAt + 'Z';
        endTime = new Date(isoString);
      }
      
      if (isNaN(endTime.getTime())) {
        console.error('無效的平倉時間:', closedAt);
        endTime = new Date();
      }
    } else {
      // 使用當前時間（UTC）
      endTime = new Date();
    }
    
    // 計算時間差（毫秒）- 兩個時間都是 UTC 時間，直接相減
    const diff = endTime.getTime() - startTime.getTime();
    
    // 如果時間差為負數，說明數據有問題
    if (diff < 0) {
      console.warn('計算出負的時間差:', { 
        createdAt, 
        closedAt, 
        startTime: startTime.toISOString(), 
        endTime: endTime.toISOString(), 
        diff 
      });
      return '未知';
    }
    
    // 轉換為秒
    const seconds = Math.floor(diff / 1000);
    
    // 調試信息
    // console.log('持倉時間計算:', {
    //   createdAt,
    //   startTime: startTime.toISOString(),
    //   endTime: endTime.toISOString(),
    //   diffMs: diff,
    //   seconds,
    //   formatted: formatDuration(seconds)
    // });
    
    // 使用 formatDuration 格式化
    return formatDuration(seconds);
  } catch (error) {
    console.error('計算運行時間錯誤:', error);
    return '未知';
  }
}

/**
 * 使用後端API轉換時間
 * @param dateTimeStr 時間字符串
 * @param sourceTimezone 源時區，默認為 UTC
 * @param targetTimezone 目標時區，默認為 Asia/Taipei
 * @returns 轉換後的時間信息
 */
export async function convertTimeWithAPI(
  dateTimeStr: string,
  sourceTimezone: string = 'UTC',
  targetTimezone: string = 'Asia/Taipei'
): Promise<{
  original: { datetime: string; timezone: string };
  converted: { datetime: string; timezone: string; formatted: string };
}> {
  try {
    // 獲取 token
    const token = localStorage.getItem('token');
    
    const response = await fetch('/api/user/convert_time', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        datetime_str: dateTimeStr,
        source_timezone: sourceTimezone,
        target_timezone: targetTimezone
      })
    });
    
    if (!response.ok) {
      throw new Error('時間轉換請求失敗');
    }
    
    return await response.json();
  } catch (error) {
    console.error('時間轉換錯誤:', error);
    throw error;
  }
}

/**
 * 生成一個簡單的唯一 ID
 * 不依賴 uuid 庫，使用時間戳和隨機數組合
 * 
 * @returns 格式為 'timestamp-randomStr' 的唯一 ID
 */
export function generateSimpleId(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
}

/**
 * 生成一個 UUID
 * 使用 uuid 庫或作為備用生成簡單 ID
 * 
 * @returns UUID 字符串
 */
export function generateUUID(): string {
  try {
    // 嘗試使用 uuid 庫
    return uuidv4();
  } catch (error) {
    console.warn('UUID 生成錯誤，使用簡單 ID 作為備用', error);
    // 備用方案：使用簡單 ID
    return generateSimpleId();
  }
}

/**
 * 生成確定性的 ID
 * 使用輸入參數創建可預測的唯一標識符
 * 比 UUID 更高效，特別適用於圖表資料點
 * 
 * @param prefix 前綴字串（如元件名稱）
 * @param identifiers 可變數量的識別值（日期、索引等）
 * @returns 確定性 ID 字符串
 */
export function generateDeterministicId(prefix: string, ...identifiers: (string | number)[]): string {
  return `${prefix}-${identifiers.join('-')}`;
}
