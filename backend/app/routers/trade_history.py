from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse, FileResponse
from typing import List, Optional
import logging
from datetime import datetime, timezone, timedelta
import io
import pandas as pd
import uuid
from pathlib import Path

from app.models.trade_history import TradeHistory
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.trade_history_service import trade_history_service
from app.auth.dependencies import get_current_user_id

router = APIRouter(prefix="/trade-history", tags=["trade-history"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[TradeHistory])
async def get_user_trade_history(
    start_date: Optional[datetime] = Query(None, description="查詢起始日期 (ISO 格式)"),
    end_date: Optional[datetime] = Query(None, description="查詢結束日期 (ISO 格式)"),
    user_id: str = Depends(get_current_user_id)
):
    """
    獲取用戶的交易歷史記錄
    """
    try:
        histories = await trade_history_service.get_user_trade_history(
            user_id,
            start_date=start_date,
            end_date=end_date
        )
        return histories
    except Exception as e:
        logger.error(f"獲取交易歷史記錄失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取交易歷史記錄失敗: {str(e)}"
        )


@router.get("/export")
async def export_trade_history(
    start_date: Optional[datetime] = Query(None, description="匯出起始日期 (ISO 格式)"),
    end_date: Optional[datetime] = Query(None, description="匯出結束日期 (ISO 格式)"),
    format: str = Query("csv", description="匯出格式 (csv 或 excel)"),
    user_id: str = Depends(get_current_user_id)
):
    """
    匯出交易歷史記錄為CSV或Excel格式
    匯出的格式與匯入模板完全相容
    """
    try:
        # 驗證格式參數
        if format not in ["csv", "excel"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="格式參數必須是 'csv' 或 'excel'"
            )

        # 獲取交易歷史記錄
        histories = await trade_history_service.get_user_trade_history(
            user_id,
            start_date=start_date,
            end_date=end_date
        )

        if not histories:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="在指定時間範圍內沒有找到交易記錄"
            )

        # 轉換為匯出格式
        export_data = await _convert_to_export_format(histories)

        # 創建DataFrame
        df = pd.DataFrame(export_data)

        # 生成檔案名稱
        filename = _generate_export_filename(start_date, end_date, format)

        if format == "csv":
            # 生成CSV
            output = io.StringIO()
            # 使用逗號作為分隔符，明確指定日期格式和浮點數精度
            df.to_csv(output, index=False, encoding='utf-8-sig', sep=',',
                      date_format='%Y-%m-%d %H:%M:%S',  # 明確指定日期格式
                      float_format='%.10g')  # 使用 10 位有效數字的浮點數格式

            return StreamingResponse(
                io.BytesIO(output.getvalue().encode('utf-8-sig')),
                media_type='text/csv; charset=utf-8',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
        else:
            # 生成Excel
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, index=False, sheet_name='交易記錄')

                # 獲取工作表和工作簿對象
                workbook = writer.book
                worksheet = writer.sheets['交易記錄']

                # 設置數字格式 - 保持高精度
                number_format = workbook.add_format({'num_format': '0.0000000000'})  # 10位小數

                # 設置列寬 - 48個欄位 (A到AV)
                worksheet.set_column('A:AV', 15)

                # 為所有欄位設置高精度格式（簡化處理）
                # 48個欄位，使用通用的高精度數字格式
                # A 到 AV (第48個欄位是 AV)
                for col_idx in range(len(df.columns)):
                    # 對於數值類型的欄位，使用高精度格式
                    col_name = df.columns[col_idx]
                    if any(keyword in col_name.lower() for keyword in [
                        'fee', 'price', 'quantity', 'pnl', 'ratio', 'value',
                        'leverage', 'mae', 'mfe', 'duration', 'loss'
                    ]):
                        # 為數值欄位設置高精度格式
                        worksheet.set_column(col_idx, col_idx, 18, number_format)
                    else:
                        # 為文字欄位設置一般格式
                        worksheet.set_column(col_idx, col_idx, 15)

            output.seek(0)

            return StreamingResponse(
                io.BytesIO(output.getvalue()),
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"匯出交易記錄失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"匯出失敗: {str(e)}"
        )


@router.get("/{trade_id}", response_model=TradeHistory)
async def get_trade_history(
    trade_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    獲取指定的已關閉交易記錄
    """
    try:
        # 獲取交易歷史記錄
        trade_history = await trade_history_service.get_trade_history(trade_id)

        if not trade_history:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="交易歷史記錄不存在"
            )

        # 檢查是否是當前用戶的交易
        if trade_history.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權訪問此交易歷史記錄"
            )

        return trade_history
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取交易歷史記錄失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取交易歷史記錄失敗: {str(e)}"
        )


@router.delete("/{history_id}")
async def delete_trade_history(history_id: str, user_id: str = Depends(get_current_user_id)):
    """
    刪除指定的交易歷史記錄
    """
    success = await trade_history_service.delete_trade_history(history_id, user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="無法刪除交易歷史記錄，可能是記錄不存在或不屬於當前用戶"
        )

    return {"message": "交易歷史記錄已成功刪除"}


@router.delete("/batch/delete")
async def batch_delete_trade_history(
    history_ids: List[str],
    user_id: str = Depends(get_current_user_id)
):
    """
    批量刪除交易歷史記錄
    """
    if not history_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請提供要刪除的記錄ID列表"
        )

    if len(history_ids) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="一次最多只能刪除100筆記錄"
        )

    try:
        result = await trade_history_service.batch_delete_trade_history(history_ids, user_id)
        return {
            "message": "批量刪除完成",
            "total_requested": len(history_ids),
            "successful_deletes": result["successful_deletes"],
            "failed_deletes": result["failed_deletes"],
            "details": result["details"]
        }
    except Exception as e:
        logger.error(f"批量刪除交易記錄失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"批量刪除失敗: {str(e)}"
        )


@router.delete("/import/rollback")
async def rollback_import(
    import_session_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    撤銷指定導入會話的所有記錄
    """
    try:
        result = await trade_history_service.rollback_import_session(import_session_id, user_id)

        if result["deleted_count"] == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="找不到該導入會話的記錄或記錄已被刪除"
            )

        return {
            "message": f"成功撤銷導入會話 {import_session_id}",
            "deleted_count": result["deleted_count"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"撤銷導入會話失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"撤銷導入失敗: {str(e)}"
        )


@router.post("/import-csv")
async def import_trade_history_from_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """
    從CSV或Excel檔案批量導入交易歷史記錄

    支援的欄位：
    必填：trade_name, created_at, closed_at, total_pnl, close_reason, max_loss, total_fee
    選填：stop_loss, take_profit, long_symbol, short_symbol, long_pnl, short_pnl, mae, mfe
    """
    # 檢查文件類型
    if not (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只支持CSV或Excel檔案"
        )

    # 檢查文件大小 (限制10MB)
    file_size = 0
    content = await file.read()
    file_size = len(content)

    if file_size > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="檔案大小不能超過10MB"
        )

    try:
        # 解析檔案數據
        if file.filename.endswith('.csv'):
            df = await _parse_csv_file(content)
        else:
            df = await _parse_excel_file(content)

        # 驗證和處理數據
        processed_records = await _validate_and_process_data(df, user_id)

        # 批量匯入到數據庫
        results = await _batch_import_records(processed_records, user_id)

        return {
            "success": True,
            "message": f"匯入完成: {results['success_count']}筆成功, {results['failed_count']}筆失敗",
            "total_processed": len(processed_records),
            "successful_imports": results['success_count'],
            "failed_imports": results['failed_count'],
            "import_session_id": results['import_session_id'],
            "successful_trades": [detail for detail in results['details'] if detail.get('status') == '成功'],
            "errors": [detail for detail in results['details'] if detail.get('status') == '失敗']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"匯入檔案處理錯誤: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"檔案處理錯誤: {str(e)}"
        )


@router.get("/import-template")
async def get_import_template():
    """
    下載交易歷史記錄匯入範本（45欄位完整版）
    混合方案：優先使用靜態模板，如果不存在則動態生成
    """
    try:
        # 靜態模板文件路徑
        static_template_path = Path("static/templates/trade_history_template_advanced.xlsx")

        # 優先使用靜態模板
        if static_template_path.exists():
            logger.info("使用靜態模板文件")
            return FileResponse(
                path=static_template_path,
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                filename="交易記錄匯入範本_45欄位完整版.xlsx"
            )
        else:
            # 靜態文件不存在，動態生成
            logger.warning("靜態模板文件不存在，使用動態生成")
            from app.scripts.generate_excel_template import generate_template

            # 生成模板
            output = generate_template()

            # 返回Excel文件
            return StreamingResponse(
                io.BytesIO(output.getvalue()),
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={
                    'Content-Disposition': 'attachment; filename="交易記錄匯入範本_45欄位完整版.xlsx"'
                }
            )

    except Exception as e:
        logger.error(f"獲取範本檔案錯誤: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取範本檔案錯誤: {str(e)}"
        )


# 輔助函數
async def _parse_csv_file(content: bytes) -> pd.DataFrame:
    """解析CSV檔案"""
    try:
        csv_content = io.StringIO(content.decode('utf-8'))
        df = pd.read_csv(csv_content)
        return df
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV檔案格式錯誤: {str(e)}"
        )


async def _parse_excel_file(content: bytes) -> pd.DataFrame:
    """解析Excel檔案"""
    try:
        df = pd.read_excel(io.BytesIO(content), sheet_name=0)  # 讀取第一個工作表
        return df
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Excel檔案格式錯誤: {str(e)}"
        )


async def _validate_and_process_data(df: pd.DataFrame, user_id: str) -> List[dict]:
    """驗證和處理數據 - 支援46欄位完整版"""
    # 必填欄位 (7個核心欄位)
    required_fields = [
        'trade_name', 'created_at', 'closed_at', 'total_pnl',
        'close_reason', 'max_loss', 'total_fee'
    ]

    # 檢查必填欄位
    missing_fields = [field for field in required_fields if field not in df.columns]
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"檔案缺少必填欄位: {', '.join(missing_fields)}"
        )

    processed_records = []

    for index, row in df.iterrows():
        try:
            record = await _process_single_record_advanced(row, user_id, index + 2)  # +2 因為有標題行
            processed_records.append(record)
        except Exception as e:
            processed_records.append({
                'error': True,
                'row': index + 2,
                'message': str(e)
            })

    return processed_records


async def _process_single_record_advanced(row: pd.Series, user_id: str, row_number: int) -> dict:
    """處理單一記錄 - 支援46欄位完整版"""
    # 台北時區 UTC+8
    taipei_tz = timezone(timedelta(hours=8))

    try:
        # 處理時間格式
        created_at = _parse_datetime_flexible(row['created_at'], taipei_tz, is_start_time=True)
        closed_at = _parse_datetime_flexible(row['closed_at'], taipei_tz, is_start_time=False)

        # 處理交易名稱 (支援智能生成)
        trade_name = _process_trade_name_advanced(row)

        # 驗證close_reason
        close_reason = str(row['close_reason']).strip()
        valid_close_reasons = ['take_profit', 'stop_loss', 'trailing_stop', 'manual']
        if close_reason not in valid_close_reasons:
            raise ValueError(f"無效的平倉原因: {close_reason}，可選值: {', '.join(valid_close_reasons)}")

        # 處理必填數字欄位
        total_pnl = float(row['total_pnl'])
        max_loss = float(row['max_loss'])
        total_fee = float(row['total_fee'])

        if max_loss <= 0:
            raise ValueError("1R金額必須大於0")
        if total_fee < 0:
            raise ValueError("總手續費不能小於0")

        # 基礎記錄結構
        record = {
            'user_id': user_id,
            'trade_name': trade_name,
            'created_at': created_at,
            'closed_at': closed_at,
            'total_pnl': total_pnl,
            'close_reason': close_reason,
            'max_loss': max_loss,
            'total_fee': total_fee,
            'row_number': row_number
        }

        # 處理所有選填欄位 (39個)
        _add_all_optional_fields(record, row)

        # 執行自動計算
        _perform_auto_calculations(record)

        return record

    except Exception as e:
        raise ValueError(f"第{row_number}行資料錯誤: {str(e)}")


async def _process_single_record(row: pd.Series, user_id: str, row_number: int) -> dict:
    """處理單一記錄"""
    # 台北時區 UTC+8
    taipei_tz = timezone(timedelta(hours=8))

    try:
        # 處理時間格式
        created_at = _parse_datetime(row['created_at'], taipei_tz)
        closed_at = _parse_datetime(row['closed_at'], taipei_tz)

        # 處理交易名稱
        trade_name = _process_trade_name(row)

        # 驗證close_reason
        close_reason = str(row['close_reason']).strip()
        valid_close_reasons = ['take_profit', 'stop_loss', 'trailing_stop', 'manual']
        if close_reason not in valid_close_reasons:
            raise ValueError(f"無效的平倉原因: {close_reason}，可選值: {', '.join(valid_close_reasons)}")

        # 處理數字欄位
        total_pnl = float(row['total_pnl'])
        max_loss = float(row['max_loss'])
        total_fee = float(row['total_fee'])

        if max_loss <= 0:
            raise ValueError("1R金額必須大於0")
        if total_fee < 0:
            raise ValueError("總手續費不能小於0")

        # 處理選填欄位
        record = {
            'user_id': user_id,
            'trade_name': trade_name,
            'created_at': created_at,
            'closed_at': closed_at,
            'total_pnl': total_pnl,
            'close_reason': close_reason,
            'max_loss': max_loss,
            'total_fee': total_fee,
            'row_number': row_number
        }

        # 添加選填欄位
        _add_optional_fields(record, row)

        return record

    except Exception as e:
        raise ValueError(f"第{row_number}行資料錯誤: {str(e)}")


def _parse_datetime(date_str, taipei_tz) -> datetime:
    """解析時間字符串並轉換為UTC"""
    if pd.isna(date_str):
        raise ValueError("時間不能為空")

    date_str = str(date_str).strip()

    # 支援多種時間格式
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d"
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            # 如果只有日期，為created_at設置為00:00:00，為closed_at設置為23:59:59
            if fmt == "%Y-%m-%d":
                if 'created_at' in date_str:  # 這個邏輯需要在上層處理
                    dt = dt.replace(hour=0, minute=0, second=0)
                else:
                    dt = dt.replace(hour=23, minute=59, second=59)

            # 設置時區為台北時間並轉換為UTC
            dt = dt.replace(tzinfo=taipei_tz)
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            continue

    raise ValueError(f"無效的時間格式: {date_str}")


def _process_trade_name(row: pd.Series) -> str:
    """處理交易名稱"""
    trade_name = None
    if 'trade_name' in row and not pd.isna(row['trade_name']):
        trade_name = str(row['trade_name']).strip()

    # 如果沒有trade_name，嘗試從long_symbol和short_symbol生成
    if not trade_name:
        long_symbol = None
        short_symbol = None

        if 'long_symbol' in row and not pd.isna(row['long_symbol']):
            long_symbol = _standardize_symbol(str(row['long_symbol']).strip())

        if 'short_symbol' in row and not pd.isna(row['short_symbol']):
            short_symbol = _standardize_symbol(str(row['short_symbol']).strip())

        if long_symbol and short_symbol:
            trade_name = f"{long_symbol}/{short_symbol}"

    if not trade_name:
        raise ValueError("必須提供trade_name或者long_symbol+short_symbol")

    return trade_name


def _standardize_symbol(symbol: str) -> str:
    """標準化交易對符號"""
    symbol = symbol.upper()
    if not symbol.endswith('USDT'):
        symbol += 'USDT'
    return symbol


def _add_optional_fields(record: dict, row: pd.Series):
    """添加選填欄位"""
    optional_fields = [
        'stop_loss', 'take_profit', 'long_symbol', 'short_symbol',
        'long_pnl', 'short_pnl', 'mae', 'mfe'
    ]

    for field in optional_fields:
        if field in row and not pd.isna(row[field]):
            value = row[field]

            # 處理符號欄位
            if field in ['long_symbol', 'short_symbol']:
                record[field] = _standardize_symbol(str(value).strip())
            # 處理數字欄位
            elif field in ['stop_loss', 'take_profit', 'long_pnl', 'short_pnl', 'mae', 'mfe']:
                record[field] = float(value)
            else:
                record[field] = value


async def _batch_import_records(processed_records: List[dict], user_id: str) -> dict:
    """批量匯入記錄到數據庫"""
    success_count = 0
    failed_count = 0
    details = []

    # 為這次導入生成會話ID
    import_session_id = str(uuid.uuid4())

    for record in processed_records:
        try:
            if record.get('error'):
                failed_count += 1
                details.append({
                    'row': record['row'],
                    'status': '失敗',
                    'message': record['message']
                })
                continue

            # 添加導入會話ID
            record['import_session_id'] = import_session_id

            # 創建TradeHistory記錄
            success = await trade_history_service.import_trade_history(record)

            if success:
                success_count += 1
                details.append({
                    'row': record['row_number'],
                    'trade_name': record['trade_name'],
                    'status': '成功'
                })
            else:
                failed_count += 1
                details.append({
                    'row': record['row_number'],
                    'trade_name': record['trade_name'],
                    'status': '失敗',
                    'message': '數據庫寫入失敗'
                })

        except Exception as e:
            failed_count += 1
            details.append({
                'row': record.get('row_number', '未知'),
                'trade_name': record.get('trade_name', '未知'),
                'status': '失敗',
                'message': str(e)
            })

    return {
        'success_count': success_count,
        'failed_count': failed_count,
        'details': details,
        'import_session_id': import_session_id  # 返回會話ID給前端
    }


async def _convert_to_export_format(histories: List[TradeHistory]) -> List[dict]:
    """將交易歷史記錄轉換為匯出格式 - 48欄位完整版，與匯入模板完全相容"""
    export_data = []

    # 台北時區 UTC+8
    taipei_tz = timezone(timedelta(hours=8))

    for history in histories:
        # 轉換時間為台北時間並格式化
        created_at_taipei = history.created_at.replace(tzinfo=timezone.utc).astimezone(taipei_tz)
        closed_at_taipei = history.closed_at.replace(tzinfo=timezone.utc).astimezone(taipei_tz)

        # 48欄位完整記錄 - 按照模板順序排列
        record = {
            # 必填欄位 (7個) - 按模板順序
            'trade_name': history.trade_name,
            'created_at': created_at_taipei.strftime('%Y-%m-%d %H:%M:%S'),
            'closed_at': closed_at_taipei.strftime('%Y-%m-%d %H:%M:%S'),
            'total_pnl': history.total_pnl,
            'close_reason': history.close_reason,
            'max_loss': history.max_loss,
            'total_fee': history.total_fee,

            # 基本選填欄位 (9個) - 按模板順序
            'stop_loss': getattr(history, 'stop_loss', None),
            'take_profit': getattr(history, 'take_profit', None),
            'total_ratio_percent': getattr(history, 'total_ratio_percent', None),
            'long_symbol': getattr(history.long_position, 'symbol', None),
            'short_symbol': getattr(history.short_position, 'symbol', None),
            'long_pnl': getattr(history.long_position, 'pnl', None),
            'short_pnl': getattr(history.short_position, 'pnl', None),
            'mae': getattr(history, 'mae', None),
            'mfe': getattr(history, 'mfe', None),

            # 高級選填欄位 - 交易持倉詳細資訊 (14個)
            'long_quantity': getattr(history.long_position, 'quantity', None),
            'long_entry_price': getattr(history.long_position, 'entry_price', None),
            'long_current_price': getattr(history.long_position, 'current_price', None),
            'long_exit_price': getattr(history.long_position, 'exit_price', None),
            'long_entry_order_id': getattr(history.long_position, 'entry_order_id', None) if history.long_position else None,
            'long_exit_order_id': getattr(history.long_position, 'exit_order_id', None) if history.long_position else None,
            'long_leverage': getattr(history.long_position, 'leverage', None),
            'short_quantity': getattr(history.short_position, 'quantity', None),
            'short_entry_price': getattr(history.short_position, 'entry_price', None),
            'short_current_price': getattr(history.short_position, 'current_price', None),
            'short_exit_price': getattr(history.short_position, 'exit_price', None),
            'short_entry_order_id': getattr(history.short_position, 'entry_order_id', None) if history.short_position else None,
            'short_exit_order_id': getattr(history.short_position, 'exit_order_id', None) if history.short_position else None,
            'short_leverage': getattr(history.short_position, 'leverage', None),

            # 高級選填欄位 - 風險指標 (2個)
            'max_ratio': getattr(history, 'max_ratio', None),
            'min_ratio': getattr(history, 'min_ratio', None),

            # 高級選填欄位 - 交易類型 (1個)
            'trade_type': getattr(history, 'trade_type', 'pair_trade'),

            # 自動計算欄位 - 詳細手續費資訊 (6個)
            'total_entry_fee': getattr(history, 'total_entry_fee', None),
            'total_exit_fee': getattr(history, 'total_exit_fee', None),
            'long_entry_fee': getattr(history.long_position, 'entry_fee', None),
            'long_exit_fee': getattr(history.long_position, 'exit_fee', None),
            'short_entry_fee': getattr(history.short_position, 'entry_fee', None),
            'short_exit_fee': getattr(history.short_position, 'exit_fee', None),

            # 自動計算欄位 - 盈虧詳細資訊 (4個)
            'long_pnl_percent': getattr(history.long_position, 'pnl_percent', None),
            'short_pnl_percent': getattr(history.short_position, 'pnl_percent', None),
            'long_notional_value': getattr(history.long_position, 'notional_value', None),
            'short_notional_value': getattr(history.short_position, 'notional_value', None),

            # 自動計算欄位 - 時間和其他資訊 (3個)
            'net_pnl': getattr(history, 'net_pnl', None),
            'risk_reward_ratio': getattr(history, 'risk_reward_ratio', None),
            'net_risk_reward_ratio': getattr(history, 'net_risk_reward_ratio', None),
            'duration_seconds': getattr(history, 'duration_seconds', None),
            'leverage': getattr(history, 'leverage', None),
        }

        export_data.append(record)

    return export_data


def _generate_export_filename(start_date: Optional[datetime], end_date: Optional[datetime], format: str) -> str:
    """生成匯出檔案名稱"""
    # 檔案副檔名
    extension = "csv" if format == "csv" else "xlsx"

    # 如果有日期範圍，使用日期範圍命名
    if start_date and end_date:
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        return f"trade-history-export-{start_str}-to-{end_str}.{extension}"
    elif start_date:
        start_str = start_date.strftime('%Y-%m-%d')
        return f"trade-history-export-from-{start_str}.{extension}"
    elif end_date:
        end_str = end_date.strftime('%Y-%m-%d')
        return f"trade-history-export-until-{end_str}.{extension}"
    else:
        # 沒有日期範圍，使用當前日期
        current_date = datetime.now().strftime('%Y-%m-%d')
        return f"trade-history-export-all-{current_date}.{extension}"


def _parse_datetime_flexible(date_str, taipei_tz, is_start_time: bool = True) -> datetime:
    """靈活解析時間格式，支援有秒數或無秒數"""
    if pd.isna(date_str):
        raise ValueError("時間不能為空")

    date_str = str(date_str).strip()

    # 支援的時間格式
    formats = [
        "%Y-%m-%d %H:%M:%S",  # 完整格式
        "%Y-%m-%d %H:%M",     # 無秒數格式
        "%Y-%m-%d"            # 只有日期
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)

            # 如果只有日期，為開倉時間設置為00:00:00，為平倉時間設置為23:59:59
            if fmt == "%Y-%m-%d":
                if is_start_time:
                    dt = dt.replace(hour=0, minute=0, second=0)
                else:
                    dt = dt.replace(hour=23, minute=59, second=59)

            # 設置時區為台北時間並轉換為UTC
            dt = dt.replace(tzinfo=taipei_tz)
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            continue

    raise ValueError(f"無效的時間格式: {date_str}")


def _process_trade_name_advanced(row: pd.Series) -> str:
    """處理交易名稱 - 支援智能生成和大寫轉換"""
    trade_name = None
    if 'trade_name' in row and not pd.isna(row['trade_name']):
        trade_name = str(row['trade_name']).strip().upper()

    # 如果沒有trade_name，嘗試從long_symbol和short_symbol生成
    if not trade_name:
        long_symbol = None
        short_symbol = None

        if 'long_symbol' in row and not pd.isna(row['long_symbol']):
            long_symbol = _standardize_symbol_advanced(str(row['long_symbol']).strip())

        if 'short_symbol' in row and not pd.isna(row['short_symbol']):
            short_symbol = _standardize_symbol_advanced(str(row['short_symbol']).strip())

        if long_symbol and short_symbol:
            # 提取基礎貨幣名稱 (去掉USDT)
            long_base = long_symbol.replace('USDT', '')
            short_base = short_symbol.replace('USDT', '')
            trade_name = f"{long_base}/{short_base}"

    if not trade_name:
        raise ValueError("必須提供trade_name或者long_symbol+short_symbol")

    return trade_name


def _standardize_symbol_advanced(symbol: str) -> str:
    """標準化交易對符號 - 支援智能補全"""
    symbol = symbol.upper().strip()

    # 如果不是以USDT結尾，自動添加USDT
    if not symbol.endswith('USDT'):
        symbol += 'USDT'

    return symbol


def _add_all_optional_fields(record: dict, row: pd.Series):
    """添加所有選填欄位 (41個)"""
    # 基本選填欄位 (9個)
    basic_optional_fields = [
        'stop_loss', 'take_profit', 'total_ratio_percent', 'long_symbol', 'short_symbol',
        'long_pnl', 'short_pnl', 'mae', 'mfe'
    ]

    # 高級選填欄位 - 交易持倉詳細資訊 (14個)
    position_fields = [
        'long_quantity', 'long_entry_price', 'long_current_price', 'long_exit_price',
        'long_entry_order_id', 'long_exit_order_id', 'long_leverage',
        'short_quantity', 'short_entry_price', 'short_current_price', 'short_exit_price',
        'short_entry_order_id', 'short_exit_order_id', 'short_leverage'
    ]

    # 高級選填欄位 - 風險指標 (2個)
    risk_fields = [
        'max_ratio', 'min_ratio'
    ]

    # 高級選填欄位 - 交易類型 (1個)
    type_fields = [
        'trade_type'
    ]

    # 自動計算欄位 - 詳細手續費資訊 (6個)
    fee_fields = [
        'total_entry_fee', 'total_exit_fee', 'long_entry_fee',
        'long_exit_fee', 'short_entry_fee', 'short_exit_fee'
    ]

    # 自動計算欄位 - 盈虧詳細資訊 (4個)
    pnl_fields = [
        'long_pnl_percent', 'short_pnl_percent', 'long_notional_value', 'short_notional_value'
    ]

    # 自動計算欄位 - 時間和其他資訊 (5個)
    calc_fields = [
        'net_pnl', 'risk_reward_ratio', 'net_risk_reward_ratio', 'duration_seconds', 'leverage'
    ]

    all_optional_fields = (basic_optional_fields + position_fields + risk_fields +
                           type_fields + fee_fields + pnl_fields + calc_fields)

    # Order ID 欄位需要特殊處理
    order_id_fields = ['long_entry_order_id', 'long_exit_order_id', 'short_entry_order_id', 'short_exit_order_id']

    for field in all_optional_fields:
        if field in row and not pd.isna(row[field]):
            value = row[field]

            # 處理符號欄位
            if field in ['long_symbol', 'short_symbol']:
                record[field] = _standardize_symbol_advanced(str(value).strip())
            # 處理 Order ID 欄位 - 特殊處理避免 .0 問題
            elif field in order_id_fields:
                # 如果是數字，轉為整數再轉字符串，避免 .0 後綴
                if isinstance(value, (int, float)):
                    record[field] = str(int(value))
                else:
                    # 如果是字符串且以 .0 結尾，移除 .0
                    str_value = str(value).strip()
                    if str_value.endswith('.0'):
                        str_value = str_value[:-2]
                    record[field] = str_value
            # 處理數字欄位
            elif field in ['stop_loss', 'take_profit', 'total_ratio_percent', 'long_pnl', 'short_pnl', 'mae', 'mfe',
                           'long_quantity', 'long_entry_price', 'long_current_price', 'long_exit_price', 'long_leverage',
                           'short_quantity', 'short_entry_price', 'short_current_price', 'short_exit_price', 'short_leverage',
                           'max_ratio', 'min_ratio', 'total_entry_fee', 'total_exit_fee', 'long_entry_fee',
                           'long_exit_fee', 'short_entry_fee', 'short_exit_fee', 'long_pnl_percent',
                           'short_pnl_percent', 'long_notional_value', 'short_notional_value', 'net_pnl',
                           'risk_reward_ratio', 'net_risk_reward_ratio', 'leverage']:
                # 確保數字精度一致性 - 保留10位有效數字
                float_value = float(value)
                # 四捨五入到10位有效數字
                if float_value != 0:
                    import math
                    magnitude = math.floor(math.log10(abs(float_value)))
                    factor = 10 ** (9 - magnitude)  # 10位有效數字
                    record[field] = round(float_value * factor) / factor
                else:
                    record[field] = 0.0
            # 處理整數欄位
            elif field in ['duration_seconds']:
                record[field] = int(float(value))  # 先轉 float 再轉 int，避免字符串轉換問題
            # 處理字符串欄位
            else:
                record[field] = str(value).strip()


def _perform_auto_calculations(record: dict):
    """執行自動計算 - 用戶手動值優先"""

    # 1. 計算 net_pnl (如果用戶沒有提供)
    if 'net_pnl' not in record or record['net_pnl'] is None:
        total_pnl = record.get('total_pnl', 0)
        total_fee = record.get('total_fee', 0)
        record['net_pnl'] = total_pnl - total_fee

    # 2. 計算 risk_reward_ratio (如果用戶沒有提供)
    if 'risk_reward_ratio' not in record or record['risk_reward_ratio'] is None:
        total_pnl = record.get('total_pnl', 0)
        max_loss = record.get('max_loss', 0)
        if max_loss != 0:
            record['risk_reward_ratio'] = total_pnl / max_loss

    # 3. 計算 net_risk_reward_ratio (如果用戶沒有提供)
    if 'net_risk_reward_ratio' not in record or record['net_risk_reward_ratio'] is None:
        net_pnl = record.get('net_pnl', 0)
        max_loss = record.get('max_loss', 0)
        if max_loss != 0:
            record['net_risk_reward_ratio'] = net_pnl / max_loss

    # 4. 計算 duration_seconds (如果用戶沒有提供)
    if 'duration_seconds' not in record or record['duration_seconds'] is None:
        created_at = record.get('created_at')
        closed_at = record.get('closed_at')
        if created_at and closed_at:
            duration = closed_at - created_at
            record['duration_seconds'] = int(duration.total_seconds())

    # 5. 計算名義價值 (如果用戶沒有提供)
    if 'long_notional_value' not in record or record['long_notional_value'] is None:
        long_quantity = record.get('long_quantity')
        long_entry_price = record.get('long_entry_price')
        if long_quantity and long_entry_price:
            record['long_notional_value'] = long_quantity * long_entry_price

    if 'short_notional_value' not in record or record['short_notional_value'] is None:
        short_quantity = record.get('short_quantity')
        short_entry_price = record.get('short_entry_price')
        if short_quantity and short_entry_price:
            record['short_notional_value'] = short_quantity * short_entry_price

    # 6. 計算盈虧百分比 (如果用戶沒有提供)
    if 'long_pnl_percent' not in record or record['long_pnl_percent'] is None:
        long_entry_price = record.get('long_entry_price')
        long_exit_price = record.get('long_exit_price')
        if long_entry_price and long_exit_price and long_entry_price != 0:
            record['long_pnl_percent'] = ((long_exit_price - long_entry_price) / long_entry_price) * 100

    if 'short_pnl_percent' not in record or record['short_pnl_percent'] is None:
        short_entry_price = record.get('short_entry_price')
        short_exit_price = record.get('short_exit_price')
        if short_entry_price and short_exit_price and short_entry_price != 0:
            record['short_pnl_percent'] = ((short_entry_price - short_exit_price) / short_entry_price) * 100

        # 7. 計算詳細手續費資訊 (如果用戶沒有提供 - 只有 None 才計算，0 是有效值)
    total_fee = record.get('total_fee', 0)

    if 'total_entry_fee' not in record or record.get('total_entry_fee') is None:
        record['total_entry_fee'] = total_fee / 2 if total_fee > 0 else 0

    if 'total_exit_fee' not in record or record.get('total_exit_fee') is None:
        record['total_exit_fee'] = total_fee / 2 if total_fee > 0 else 0

    total_entry_fee = record.get('total_entry_fee', 0)
    total_exit_fee = record.get('total_exit_fee', 0)

    if 'long_entry_fee' not in record or record.get('long_entry_fee') is None:
        record['long_entry_fee'] = total_entry_fee / 2 if total_entry_fee > 0 else 0

    if 'long_exit_fee' not in record or record.get('long_exit_fee') is None:
        record['long_exit_fee'] = total_exit_fee / 2 if total_exit_fee > 0 else 0

    if 'short_entry_fee' not in record or record.get('short_entry_fee') is None:
        record['short_entry_fee'] = total_entry_fee / 2 if total_entry_fee > 0 else 0

    if 'short_exit_fee' not in record or record.get('short_exit_fee') is None:
        record['short_exit_fee'] = total_exit_fee / 2 if total_exit_fee > 0 else 0

    # 8. 設置預設值
    if 'trade_type' not in record or record['trade_type'] is None:
        record['trade_type'] = 'pair_trade'  # 預設為配對交易

    if 'leverage' not in record or record['leverage'] is None:
        # 嘗試從 long_leverage 或 short_leverage 獲取
        long_leverage = record.get('long_leverage')
        short_leverage = record.get('short_leverage')
        if long_leverage:
            record['leverage'] = long_leverage
        elif short_leverage:
            record['leverage'] = short_leverage
        else:
            record['leverage'] = 1  # 預設槓桿為1
