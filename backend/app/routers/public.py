from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
import logging
from pathlib import Path

# 設置日誌
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/public",
    tags=["public"],
    responses={404: {"description": "Not found"}},
)


@router.get("/trade-history-template")
async def get_trade_history_import_template():
    """
    下載交易歷史記錄匯入範本（公共端點，不需要認證）
    """
    try:
        # 靜態模板文件路徑 - 支援 Docker 和本地環境
        if Path("/app").exists():  # Docker 環境
            template_path = Path("/app/static/templates/trade_history_template.xlsx")
        else:  # 本地環境
            template_path = Path(__file__).parent.parent / "static" / "templates" / "trade_history_template.xlsx"

        logger.info(f"嘗試訪問模板文件: {template_path}")

        # 檢查文件是否存在
        if not template_path.exists():
            logger.error(f"模板文件不存在: {template_path}")
            # 列出目錄內容以便調試
            parent_dir = template_path.parent
            if parent_dir.exists():
                logger.error(f"目錄 {parent_dir} 內容: {list(parent_dir.iterdir())}")
            else:
                logger.error(f"目錄 {parent_dir} 不存在")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="模板文件不存在"
            )

        # 返回靜態文件
        return FileResponse(
            path=str(template_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="trade_history_template.xlsx"
        )

    except HTTPException:
        # 重新拋出HTTP異常
        raise
    except Exception as e:
        logger.error(f"下載模板文件錯誤: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"下載模板文件錯誤: {str(e)}"
        )
