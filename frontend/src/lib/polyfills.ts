import { v4 as uuidv4 } from 'uuid';

/**
 * 緊急修復：確保 polyfill 最早執行
 * 這個函數將立即自動執行
 */
(function() {
  try {
    // 立即為全局命名空間提供 UUID 生成函數
    if (typeof window !== 'undefined') {
      // @ts-expect-error - 忽略類型錯誤
      window.__generateUUID = uuidv4;
    }

    // 確保 crypto 對象存在
    if (typeof window !== 'undefined') {
      if (!window.crypto) {

        // @ts-expect-error - 忽略類型錯誤
        window.crypto = {};
      }
      
      if (!window.crypto.randomUUID) {

        
        // 定義一個穩定的函數
        const stableRandomUUID = function() {
          return uuidv4();
        };
        
        // 定義不可枚舉的屬性（避免某些庫的檢測）
        try {
          Object.defineProperty(window.crypto, 'randomUUID', {
            value: stableRandomUUID,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          console.warn('使用 defineProperty 失敗，嘗試直接賦值', e);
          // @ts-expect-error - 忽略類型錯誤
          window.crypto.randomUUID = stableRandomUUID;
        }
        
        // 修補可能的原型問題
        if (window.crypto.constructor && window.crypto.constructor.prototype) {
          try {
            if (!window.crypto.constructor.prototype.randomUUID) {
              window.crypto.constructor.prototype.randomUUID = stableRandomUUID;
            }
          } catch (e) {
            console.warn('修補原型失敗', e);
          }
        }
        
        // 測試是否成功
        try {
          const testUUID = window.crypto.randomUUID();

        } catch (e) {
          console.error('polyfill 測試失敗:', e);
        }
      }
    }
  } catch (e) {
    console.error('crypto polyfill 初始化失敗:', e);
  }
})();

// 修復可能的消息通道問題
if (typeof window !== 'undefined') {
  // 確保 window.addEventListener 和 window.removeEventListener 正常工作
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  
  // 替換 addEventListener 以捕獲事件監聽器
  window.addEventListener = function(
    type: string, 
    listener: EventListenerOrEventListenerObject, 
    options?: boolean | AddEventListenerOptions
  ) {
    try {
      return originalAddEventListener.call(this, type, listener, options);
    } catch (e) {
      console.warn('添加事件監聽器失敗:', e);
      return false;
    }
  };
  
  // 替換 removeEventListener 以安全移除事件監聽器
  window.removeEventListener = function(
    type: string, 
    listener: EventListenerOrEventListenerObject, 
    options?: boolean | EventListenerOptions
  ) {
    try {
      return originalRemoveEventListener.call(this, type, listener, options);
    } catch (e) {
      console.warn('移除事件監聽器失敗:', e);
      return false;
    }
  };
}

// 添加一個初始化完成的標記
if (typeof window !== 'undefined') {
  // @ts-expect-error - 全局擴展
  window.__POLYFILLS_INITIALIZED__ = true;

}

export {}; 