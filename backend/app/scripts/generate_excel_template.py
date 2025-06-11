"""
交易歷史記錄匯入模板生成器 - 48欄位完整版
"""
import io
import pandas as pd
from typing import List, Dict, Any


def get_field_definitions() -> List[Dict[str, Any]]:
    """獲取48個欄位的完整定義"""
    return [
        # 必填欄位 (7個)
        {"name": "trade_name", "required": "✅", "category": "必填",
         "description": "交易名稱 (或填寫long_symbol和short_symbol由系統自動生成)", "example": "BTC/ETH", "auto_calc": "自動轉大寫，btc/eth → BTC/ETH"},
        {"name": "created_at", "required": "✅", "category": "必填",
         "description": "開倉時間 (台北時間)", "example": "2024-01-15 14:30 或 2024-01-15 14:30:25", "auto_calc": ""},
        {"name": "closed_at", "required": "✅", "category": "必填",
         "description": "平倉時間 (台北時間)", "example": "2024-01-15 16:45 或 2024-01-15 16:45:30", "auto_calc": ""},
        {"name": "total_pnl", "required": "✅", "category": "必填",
         "description": "總盈虧 (未扣手續費)", "example": "125.50", "auto_calc": ""},
        {"name": "close_reason", "required": "✅", "category": "必填",
         "description": "平倉原因", "example": "take_profit", "auto_calc": ""},
        {"name": "max_loss", "required": "✅", "category": "必填",
         "description": "1R金額 (最大虧損額度)", "example": "100.00", "auto_calc": ""},
        {"name": "total_fee", "required": "✅", "category": "必填",
         "description": "總手續費", "example": "2.50", "auto_calc": ""},

        # 基本選填欄位 (9個)
        {"name": "stop_loss", "required": "⭕", "category": "基本選填",
         "description": "止損百分比", "example": "5.0", "auto_calc": ""},
        {"name": "take_profit", "required": "⭕", "category": "基本選填",
         "description": "止盈百分比", "example": "15.0", "auto_calc": ""},
        {"name": "total_ratio_percent", "required": "⭕", "category": "基本選填",
         "description": "出場百分比", "example": "0.42",
         "auto_calc": ""},
        {"name": "long_symbol", "required": "⭕", "category": "基本選填",
         "description": "多單交易對 (可用於自動生成trade_name)", "example": "BTC 或 BTCUSDT", "auto_calc": "自動轉大寫，BTC→BTCUSDT"},
        {"name": "short_symbol", "required": "⭕", "category": "基本選填",
         "description": "空單交易對 (可用於自動生成trade_name)", "example": "ETH 或 ETHUSDT", "auto_calc": "自動轉大寫，ETH→ETHUSDT"},
        {"name": "long_pnl", "required": "⭕", "category": "基本選填",
         "description": "多單盈虧", "example": "80.00", "auto_calc": ""},
        {"name": "short_pnl", "required": "⭕", "category": "基本選填",
         "description": "空單盈虧", "example": "45.50", "auto_calc": ""},
        {"name": "mae", "required": "⭕", "category": "基本選填",
         "description": "最大不利變動 (%)", "example": "2.5", "auto_calc": ""},
        {"name": "mfe", "required": "⭕", "category": "基本選填",
         "description": "最大有利變動 (%)", "example": "18.2", "auto_calc": ""},

        # 高級選填欄位 - 交易持倉詳細資訊 (14個)
        {"name": "long_quantity", "required": "🌟", "category": "高級選填",
         "description": "多單數量", "example": "0.5", "auto_calc": ""},
        {"name": "long_entry_price", "required": "🌟", "category": "高級選填",
         "description": "多單入場價格", "example": "45000.00", "auto_calc": ""},
        {"name": "long_current_price", "required": "🌟", "category": "高級選填",
         "description": "多單當前市場價格", "example": "46200.00", "auto_calc": ""},
        {"name": "long_exit_price", "required": "🌟", "category": "高級選填",
         "description": "多單出場價格", "example": "46500.00", "auto_calc": ""},
        {"name": "long_entry_order_id", "required": "🌟", "category": "高級選填",
         "description": "多單開倉訂單ID", "example": "12345678", "auto_calc": ""},
        {"name": "long_exit_order_id", "required": "🌟", "category": "高級選填",
         "description": "多單平倉訂單ID", "example": "12345679", "auto_calc": ""},
        {"name": "long_leverage", "required": "🌟", "category": "高級選填",
         "description": "多單槓桿倍數", "example": "10", "auto_calc": ""},
        {"name": "short_quantity", "required": "🌟", "category": "高級選填",
         "description": "空單數量", "example": "15.0", "auto_calc": ""},
        {"name": "short_entry_price", "required": "🌟", "category": "高級選填",
         "description": "空單入場價格", "example": "3000.00", "auto_calc": ""},
        {"name": "short_current_price", "required": "🌟", "category": "高級選填",
         "description": "空單當前市場價格", "example": "2980.00", "auto_calc": ""},
        {"name": "short_exit_price", "required": "🌟", "category": "高級選填",
         "description": "空單出場價格", "example": "2950.00", "auto_calc": ""},
        {"name": "short_entry_order_id", "required": "🌟", "category": "高級選填",
         "description": "空單開倉訂單ID", "example": "12345680", "auto_calc": ""},
        {"name": "short_exit_order_id", "required": "🌟", "category": "高級選填",
         "description": "空單平倉訂單ID", "example": "12345681", "auto_calc": ""},
        {"name": "short_leverage", "required": "🌟", "category": "高級選填",
         "description": "空單槓桿倍數", "example": "10", "auto_calc": ""},

        # 高級選填欄位 - 風險指標 (2個)
        {"name": "max_ratio", "required": "🌟", "category": "高級選填",
         "description": "最高多空價格比率", "example": "15.2", "auto_calc": ""},
        {"name": "min_ratio", "required": "🌟", "category": "高級選填",
         "description": "最低多空價格比率", "example": "14.8", "auto_calc": ""},

        # 高級選填欄位 - 交易類型 (1個)
        {"name": "trade_type", "required": "🌟", "category": "高級選填",
         "description": "交易類型", "example": "pair_trade", "auto_calc": "預設值: pair_trade"},

        # 自動計算欄位 - 詳細手續費資訊 (6個)
        {"name": "total_entry_fee", "required": "🤖", "category": "自動計算",
         "description": "總開倉手續費", "example": "2.50", "auto_calc": "total_fee / 2"},
        {"name": "total_exit_fee", "required": "🤖", "category": "自動計算",
         "description": "總平倉手續費", "example": "2.18", "auto_calc": "total_fee / 2"},
        {"name": "long_entry_fee", "required": "🤖", "category": "自動計算",
         "description": "多單開倉手續費", "example": "1.25", "auto_calc": "total_entry_fee / 2"},
        {"name": "long_exit_fee", "required": "🤖", "category": "自動計算",
         "description": "多單平倉手續費", "example": "1.30", "auto_calc": "total_exit_fee / 2"},
        {"name": "short_entry_fee", "required": "🤖", "category": "自動計算",
         "description": "空單開倉手續費", "example": "0.90", "auto_calc": "total_entry_fee / 2"},
        {"name": "short_exit_fee", "required": "🤖", "category": "自動計算",
         "description": "空單平倉手續費", "example": "0.88", "auto_calc": "total_exit_fee / 2"},

        # 自動計算欄位 - 盈虧詳細資訊 (4個)
        {"name": "long_pnl_percent", "required": "🤖", "category": "自動計算",
         "description": "多單盈虧百分比", "example": "3.33", "auto_calc": "(long_exit_price - long_entry_price) / long_entry_price × 100"},
        {"name": "short_pnl_percent", "required": "🤖", "category": "自動計算",
         "description": "空單盈虧百分比", "example": "1.67", "auto_calc": "(short_exit_price - short_entry_price) / short_entry_price × 100"},
        {"name": "long_notional_value", "required": "🤖", "category": "自動計算",
         "description": "多單名義價值", "example": "22500.00", "auto_calc": "long_quantity × long_entry_price"},
        {"name": "short_notional_value", "required": "🤖", "category": "自動計算",
         "description": "空單名義價值", "example": "45000.00", "auto_calc": "short_quantity × short_entry_price"},


        # 自動計算欄位 - 時間和其他資訊 (5個)
        {"name": "net_pnl", "required": "🤖", "category": "自動計算",
         "description": "淨盈虧 (扣除手續費)", "example": "123.00", "auto_calc": "total_pnl - total_fee"},
        {"name": "risk_reward_ratio", "required": "🤖", "category": "自動計算",
         "description": "風險收益比", "example": "1.25", "auto_calc": "total_pnl / max_loss"},
        {"name": "net_risk_reward_ratio", "required": "🤖", "category": "自動計算",
         "description": "淨風險收益比", "example": "1.23", "auto_calc": "net_pnl / max_loss"},
        {"name": "duration_seconds", "required": "🤖", "category": "自動計算",
         "description": "交易持續時間(秒)", "example": "8100", "auto_calc": "closed_at - created_at"},
        {"name": "leverage", "required": "🤖", "category": "自動計算",
         "description": "整體槓桿倍數", "example": "10", "auto_calc": "long_leverage or short_leverage"},
    ]


def generate_template() -> io.BytesIO:
    """生成48欄位完整版Excel模板"""
    fields = get_field_definitions()

    # 創建示例數據
    sample_data = {}

    # 添加標題行
    headers = [field["name"] for field in fields]
    example_row = [field["example"] for field in fields]

    # 寫入數據 - 使用 headers 和 example_row 為所有欄位提供範例
    for i, header in enumerate(headers):
        sample_data[header] = [example_row[i]]

    # 創建DataFrame
    df = pd.DataFrame(sample_data)

    # 創建Excel文件
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        # 寫入數據工作表
        df.to_excel(writer, index=False, sheet_name='交易記錄')

        # 獲取工作表和工作簿對象
        workbook = writer.book
        worksheet = writer.sheets['交易記錄']

        # 定義字體格式 - 統一設定為13號字體
        cell_format = workbook.add_format({'font_size': 13})

        # 定義不同類型欄位的標題格式
        required_header_format = workbook.add_format({
            'font_size': 14,
            'bold': True,
            'bg_color': '#DC3545',  # 紅色 - 必填欄位
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })

        optional_header_format = workbook.add_format({
            'font_size': 14,
            'bold': True,
            'bg_color': '#366092',  # 藍色 - 基本選填
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })

        advanced_header_format = workbook.add_format({
            'font_size': 14,
            'bold': True,
            'bg_color': '#FD7E14',  # 橙色 - 高級選填
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })

        auto_calc_header_format = workbook.add_format({
            'font_size': 14,
            'bold': True,
            'bg_color': '#198754',  # 綠色 - 自動計算
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })

        # 設置列寬和字體格式
        worksheet.set_column('A:AX', 20, cell_format)  # 48個欄位，設定字體大小13

        # 設置標題行格式 - 根據欄位類型使用不同顏色
        for col, field in enumerate(fields):
            header_name = field["name"]
            required_status = field["required"]

            if required_status == '✅':
                header_format = required_header_format
            elif required_status == '⭕':
                header_format = optional_header_format
            elif required_status == '🌟':
                header_format = advanced_header_format
            elif required_status == '🤖':
                header_format = auto_calc_header_format
            else:
                header_format = optional_header_format  # 預設使用藍色

            worksheet.write(0, col, header_name, header_format)

        # 定義通用標題格式（用於說明工作表）
        general_header_format = workbook.add_format({
            'font_size': 14,
            'bold': True,
            'bg_color': '#366092',
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })

        # 添加欄位說明工作表
        instructions_sheet = workbook.add_worksheet('欄位說明')

        # 寫入欄位說明標題
        instructions_sheet.write(0, 0, "欄位名稱", general_header_format)
        instructions_sheet.write(0, 1, "必填狀態", general_header_format)
        instructions_sheet.write(0, 2, "分類", general_header_format)
        instructions_sheet.write(0, 3, "說明", general_header_format)
        instructions_sheet.write(0, 4, "範例", general_header_format)
        instructions_sheet.write(0, 5, "自動計算", general_header_format)

        # 寫入欄位詳細說明
        for i, field in enumerate(fields, 1):
            instructions_sheet.write(i, 0, field["name"], cell_format)
            instructions_sheet.write(i, 1, field["required"], cell_format)
            instructions_sheet.write(i, 2, field["category"], cell_format)
            instructions_sheet.write(i, 3, field["description"], cell_format)
            instructions_sheet.write(i, 4, field["example"], cell_format)
            instructions_sheet.write(i, 5, field["auto_calc"], cell_format)

        # 設置欄位說明工作表的列寬和字體格式
        instructions_sheet.set_column('A:A', 20, cell_format)  # 欄位名稱
        instructions_sheet.set_column('B:B', 10, cell_format)  # 必填狀態
        instructions_sheet.set_column('C:C', 12, cell_format)  # 分類
        instructions_sheet.set_column('D:D', 40, cell_format)  # 說明
        instructions_sheet.set_column('E:E', 20, cell_format)  # 範例
        instructions_sheet.set_column('F:F', 30, cell_format)  # 自動計算

        # 添加使用說明工作表
        usage_sheet = workbook.add_worksheet('使用說明')
        usage_instructions = [
            ["項目", "說明", "", "", "", "範例"],
            ["", "", "", "", "", ""],
            ["✅ 必填欄位", "必須填寫的欄位，否則匯入會失敗", "", "", "", ""],
            ["⭕ 選填", "可以留空或填入 \"-\" 的欄位", "", "", "", ""],
            ["🌟 高級選填", "高級選填的欄位，可以留空或填入 \"-\" 的欄位", "", "", "", ""],
            ["🤖 自動計算", "系統會自動計算，也可手動填寫覆蓋", "", "", "", ""],
            ["", "", "", "", "", ""],
            ["", "", "", "", "", ""],
            ["格式要求", "", "", "", "", ""],
            ["時間格式", "YYYY-MM-DD HH:MM 或 YYYY-MM-DD HH:MM:SS (台北時間)", "", "", "", "2024-01-15 14:30 或 2024-01-15 14:30:25"],
            ["交易對格式", "完整格式或簡寫，自動轉大寫", "", "", "", "btc→BTCUSDT, ETHUSDT→ETHUSDT"],
            ["平倉原因", "take_profit=止盈, stop_loss=止損, trailing_stop=停利, manual=手動", "", "", "", "take_profit"],
            ["", "", "", "", "", ""],
            ["智能填寫說明", "", "", "", "", ""],
            ["trade_name", "可直接填寫，或留空讓系統從long_symbol/short_symbol自動生成", "", "", "", "直接填: btc/eth→BTC/ETH 或 自動生成: btc+eth→BTC/ETH"],
            ["symbol補全", "簡寫會自動補全為完整交易對並轉大寫", "", "", "", "btc→BTCUSDT, eth→ETHUSDT"],
            ["", "", "", "", "", ""],
            ["自動計算功能", "", "", "", "", ""],
            ["net_pnl", "如果未填寫，系統會自動計算：總盈虧 - 總手續費", "", "", "", "123.00"],
            ["risk_reward_ratio", "如果未填寫，系統會自動計算：總盈虧 / 最大虧損", "", "", "", "1.25"],
            ["duration_seconds", "如果未填寫，系統會自動計算：平倉時間 - 開倉時間", "", "", "", "8100"],
            ["", "", "", "", "", ""],
            ["注意事項", "", "", "", "", ""],
            ["1", "🤖標記的欄位可以自動計算，也可以手動填寫", "", "", "", ""],
            ["2", "手動填寫的值會覆蓋自動計算的結果", "", "", "", ""],
            ["3", "選填欄位可以留空，系統會智能處理", "", "", "", ""],
        ]

        for i, row in enumerate(usage_instructions):
            for j, cell in enumerate(row):
                if i == 0:  # 標題行
                    usage_sheet.write(i, j, cell, general_header_format)
                else:
                    usage_sheet.write(i, j, cell, cell_format)

        # 設置使用說明工作表的列寬和字體格式
        usage_sheet.set_column('A:A', 20, cell_format)
        usage_sheet.set_column('B:B', 50, cell_format)
        usage_sheet.set_column('C:E', 10, cell_format)
        usage_sheet.set_column('F:F', 40, cell_format)

    output.seek(0)
    return output


if __name__ == "__main__":
    # 直接執行時生成模板文件
    template = generate_template()
    with open("trade_history_template.xlsx", "wb") as f:
        f.write(template.getvalue())
    print("✅ 模板已生成：trade_history_template.xlsx")
