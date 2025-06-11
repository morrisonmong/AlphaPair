"""API路由模組"""
from fastapi import FastAPI

from app.routers import auth, binance, equity_curve, pair_trade, trade_history, user_settings, asset_snapshot, trade_statistics, test_connection, user


def register_routers(app: FastAPI) -> None:
    """
    註冊所有API路由

    Args:
        app: FastAPI 應用實例
    """
    # 用戶相關路由
    app.include_router(auth.router)

    # 交易相關路由
    app.include_router(binance.router)
    app.include_router(user_settings.router)
    app.include_router(pair_trade.router)
    app.include_router(trade_history.router)
    app.include_router(equity_curve.router)
    app.include_router(asset_snapshot.router)
    app.include_router(trade_statistics.router)
    app.include_router(test_connection.router)
    app.include_router(user.router)

    # 註冊公共路由（不需要認證）
    from app.routers.public import router as public_router
    app.include_router(public_router)
