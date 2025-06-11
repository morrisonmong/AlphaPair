"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { createPairTrade } from '../services/api';
import { InfoIcon } from 'lucide-react';

interface PairTradeFormProps {
  onSuccess: () => void;
}

const PairTradeForm: React.FC<PairTradeFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [longSymbol, setLongSymbol] = useState('');
  const [shortSymbol, setShortSymbol] = useState('');
  const [maxLoss, setMaxLoss] = useState(100);
  const [stopLoss, setStopLoss] = useState(5);
  const [takeProfit, setTakeProfit] = useState(10);
  const [longLeverage, setLongLeverage] = useState(1);
  const [shortLeverage, setShortLeverage] = useState(1);
  const [marginType, setMarginType] = useState('ISOLATED');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 自動生成交易名稱
  useEffect(() => {
    if (longSymbol && shortSymbol) {
      // 去除USDT後綴
      const longBase = longSymbol.replace('USDT', '');
      const shortBase = shortSymbol.replace('USDT', '');
      setName(`${longBase}/${shortBase}`);
    }
  }, [longSymbol, shortSymbol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await createPairTrade({
        name,
        longSymbol,
        shortSymbol,
        maxLoss,
        stopLoss,
        takeProfit,
        longLeverage,
        shortLeverage,
        marginType
      });

      toast.success('配對交易已創建', {
        description: '您的配對交易已成功創建',
        duration: 5000,
      });

      // 重置表單
      setName('');
      setLongSymbol('');
      setShortSymbol('');
      setMaxLoss(100);
      setStopLoss(5);
      setTakeProfit(10);
      setLongLeverage(1);
      setShortLeverage(1);
      setMarginType('ISOLATED');

      // 通知父組件成功
      onSuccess();
    } catch (error) {
      console.error('創建配對交易失敗:', error);
      let errorMessage = '創建配對交易時發生未知的錯誤'; 

      if (error instanceof Error) {
        errorMessage = error.message; 
      }
      
      toast.error('創建失敗', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col space-y-4">
        <h2 className="text-xl font-bold">創建配對交易</h2>
        
        <Separator className="my-2" />
        
        <h3 className="text-md font-semibold">交易對設置</h3>
        
        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            多單交易對
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                輸入幣種名稱，例如 BTC、ETH，系統會自動添加USDT後綴
              </div>
            </div>
          </label>
          <div className="flex">
            <Input
              value={longSymbol}
              onChange={(e) => setLongSymbol(e.target.value.toUpperCase())}
              placeholder="例如: BTC"
              required
              className="flex-grow"
            />
            <div className="flex items-center justify-center bg-gray-700 px-3 rounded-r-md">
              USDT
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            空單交易對
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                輸入幣種名稱，例如 BTC、ETH，系統會自動添加USDT後綴
              </div>
            </div>
          </label>
          <div className="flex">
            <Input
              value={shortSymbol}
              onChange={(e) => setShortSymbol(e.target.value.toUpperCase())}
              placeholder="例如: ETH"
              required
              className="flex-grow"
            />
            <div className="flex items-center justify-center bg-gray-700 px-3 rounded-r-md">
              USDT
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            交易名稱 (可選)
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                如果留空，系統會自動生成交易名稱
              </div>
            </div>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: BTC/ETH"
          />
        </div>
        
        <Separator className="my-2" />
        
        <h3 className="text-md font-semibold">風險管理</h3>

        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            最大虧損 (USDT)
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                設置此交易的最大虧損金額，系統會根據此金額和止損百分比計算交易數量
              </div>
            </div>
          </label>
          <Input
            type="number"
            value={maxLoss}
            onChange={(e) => setMaxLoss(Number(e.target.value))}
            min={1}
            max={10000}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            止損百分比 (%)
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                當總虧損達到此百分比時，系統會自動平倉
              </div>
            </div>
          </label>
          <Input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(Number(e.target.value))}
            min={0.1}
            max={100}
            step={0.1}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            止盈百分比 (%)
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                當總盈利達到此百分比時，系統會自動平倉
              </div>
            </div>
          </label>
          <Input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(Number(e.target.value))}
            min={0.1}
            max={1000}
            step={0.1}
            required
          />
        </div>
        
        <Separator className="my-2" />
        
        <h3 className="text-md font-semibold">槓桿設置</h3>
        
        <div className="space-y-2">
          <label className="flex items-center text-sm font-medium">
            保證金類型
            <div className="relative ml-2 group">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                逐倉(ISOLATED)：每個倉位獨立計算風險；全倉(CROSSED)：所有倉位共享保證金
              </div>
            </div>
          </label>
          <select
            value={marginType}
            onChange={(e) => setMarginType(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="ISOLATED">逐倉 (ISOLATED)</option>
            <option value="CROSSED">全倉 (CROSSED)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center text-sm font-medium">
              多單槓桿倍數
              <div className="relative ml-2 group">
                <InfoIcon className="h-4 w-4 text-gray-400" />
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                  設置多單的槓桿倍數，範圍1-125倍
                </div>
              </div>
            </label>
            <Input
              type="number"
              value={longLeverage}
              onChange={(e) => setLongLeverage(Number(e.target.value))}
              min={1}
              max={125}
              step={1}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center text-sm font-medium">
              空單槓桿倍數
              <div className="relative ml-2 group">
                <InfoIcon className="h-4 w-4 text-gray-400" />
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-xs p-2 rounded shadow-lg w-64">
                  設置空單的槓桿倍數，範圍1-125倍
                </div>
              </div>
            </label>
            <Input
              type="number"
              value={shortLeverage}
              onChange={(e) => setShortLeverage(Number(e.target.value))}
              min={1}
              max={125}
              step={1}
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSubmitting ? '處理中...' : '創建配對交易'}
        </Button>
      </div>
    </form>
  );
};

export default PairTradeForm; 