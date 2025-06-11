'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 錯誤邊界組件，用於捕獲子組件中的 JavaScript 錯誤
 * 並顯示備用 UI，防止整個應用崩潰
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 更新 state，下次渲染時顯示備用 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 可以在這裡記錄錯誤信息
    console.error('錯誤邊界捕獲到錯誤:', error, errorInfo);
    
    // 如果提供了 onError 回調，則調用它
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // 顯示自定義備用 UI 或默認錯誤信息
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">組件載入錯誤</h3>
          <p className="text-sm text-red-600 dark:text-red-400">
            {this.state.error?.message || '發生未知錯誤'}
          </p>
          <button 
            className="mt-3 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重試
          </button>
        </div>
      );
    }

    return this.props.children;
  }
} 