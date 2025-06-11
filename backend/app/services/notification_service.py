import logging
import requests
from typing import Dict
from datetime import datetime, timezone
import traceback

from app.services.user_settings_service import UserSettingsService
from app.utils.time_utils import convert_to_timezone, UTC_PLUS_8

logger = logging.getLogger(__name__)


class NotificationService:
    """通知服務，用於發送通知到Line、Discord和Telegram"""

    def __init__(self):
        """初始化通知服務"""
        self.user_settings_service = UserSettingsService()

    def _get_close_reason_display(self, close_reason: str) -> str:
        """
        將平倉原因的英文代碼轉換為中文顯示

        Args:
            close_reason: 平倉原因代碼或中文描述

        Returns:
            str: 中文顯示的平倉原因
        """
        close_reason_map = {
            'take_profit': '止盈',
            'stop_loss': '止損',
            'trailing_stop': '停利',
            'manual': '手動平倉',
            'manual_close': '手動平倉',
            '手動平倉': '手動平倉'  # 已經是中文的情況
        }
        return close_reason_map.get(close_reason, close_reason or 'N/A')

    async def send_line_notification(self, token: str, message: str) -> bool:
        """
        發送Line通知

        Args:
            token: Line Notify令牌
            message: 通知消息

        Returns:
            bool: 是否發送成功
        """
        if not token:
            logger.warning("未提供Line Notify令牌，無法發送通知")
            return False

        try:
            url = "https://notify-api.line.me/api/notify"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            }

            # 確保消息可以正確編碼，保留中文和表情符號
            try:
                # 替換可能導致問題的控制字符
                safe_message = ""
                for char in message:
                    if ord(char) < 32 and char not in ['\n', '\t', '\r']:
                        continue  # 跳過控制字符
                    safe_message += char
            except Exception:
                # 如果處理失敗，使用原始消息
                safe_message = message

            logger.info(f"處理後的Line通知消息: {safe_message[:50]}...")
            payload = {
                "message": safe_message
            }

            logger.info(f"發送Line通知: {safe_message[:50]}...")
            response = requests.post(url, headers=headers, data=payload)

            if response.status_code == 200:
                logger.info("Line通知發送成功")
                return True
            else:
                logger.error(
                    f"Line通知發送失敗: HTTP {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"發送Line通知時出錯: {str(e)}")
            return False

    async def send_discord_notification(self, webhook_url: str, message: str, username: str = "AlphaPair Bot") -> bool:
        """
        發送Discord通知

        Args:
            webhook_url: Discord Webhook URL
            message: 通知消息
            username: 發送者名稱

        Returns:
            bool: 是否發送成功
        """
        if not webhook_url:
            logger.warning("未提供Discord Webhook URL，無法發送通知")
            return False

        try:
            # 處理消息，移除可能導致問題的控制字符，保留中文和表情符號
            try:
                safe_message = ""
                for char in message:
                    if ord(char) < 32 and char not in ['\n', '\t', '\r']:
                        continue  # 跳過控制字符
                    safe_message += char
            except Exception:
                # 如果處理失敗，使用原始消息
                safe_message = message

            logger.info(f"處理後的Discord通知消息: {safe_message[:50]}...")

            payload = {
                "content": safe_message,
                "username": username
            }

            headers = {
                "Content-Type": "application/json; charset=utf-8"
            }

            logger.info(f"發送Discord通知: {safe_message[:50]}...")
            response = requests.post(
                webhook_url, json=payload, headers=headers)

            if response.status_code in [200, 204]:
                logger.info("Discord通知發送成功")
                return True
            else:
                logger.error(
                    f"Discord通知發送失敗: HTTP {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"發送Discord通知時出錯: {str(e)}")
            return False

    async def send_telegram_notification(self, bot_token: str, chat_id: str, message: str) -> bool:
        """
        發送Telegram通知

        Args:
            bot_token: Telegram Bot令牌
            chat_id: 聊天ID
            message: 通知消息

        Returns:
            bool: 是否發送成功
        """
        if not bot_token or not chat_id:
            logger.warning("未提供Telegram Bot令牌或聊天ID，無法發送通知")
            return False

        try:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

            # 處理消息，移除可能導致問題的控制字符，保留中文和表情符號
            try:
                safe_message = ""
                for char in message:
                    if ord(char) < 32 and char not in ['\n', '\t', '\r']:
                        continue  # 跳過控制字符
                    safe_message += char
            except Exception:
                # 如果處理失敗，使用原始消息
                safe_message = message

            logger.info(f"處理後的Telegram通知消息: {safe_message[:50]}...")

            payload = {
                "chat_id": chat_id,
                "text": safe_message,
                "parse_mode": "HTML"
            }
            headers = {
                "Content-Type": "application/json; charset=utf-8"
            }

            logger.info(f"發送Telegram通知: {safe_message[:50]}...")
            response = requests.post(url, json=payload, headers=headers)

            if response.status_code == 200:
                logger.info("Telegram通知發送成功")
                return True
            else:
                logger.error(
                    f"Telegram通知發送失敗: HTTP {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"發送Telegram通知時出錯: {str(e)}")
            return False

    async def format_pair_trade_message(self, trade: Dict, is_open: bool = True) -> str:
        """
        格式化配對交易消息

        Args:
            trade: 配對交易數據
            is_open: 是否為開倉通知

        Returns:
            str: 格式化後的消息
        """
        try:
            if is_open:
                # 開倉通知
                long_position = trade.get("long_position", {})
                short_position = trade.get("short_position", {})

                # 獲取手續費信息
                long_fee = long_position.get("entry_fee", 0)
                short_fee = short_position.get("entry_fee", 0)
                total_fee = trade.get("total_entry_fee", long_fee + short_fee)

                # 獲取風險設定
                max_loss = trade.get("max_loss", 0)
                stop_loss = trade.get("stop_loss", 0)
                take_profit = trade.get("take_profit", 0)

                # 獲取槓桿信息
                long_leverage = long_position.get("leverage", 1)
                short_leverage = short_position.get("leverage", 1)

                # 格式化創建時間
                created_at = trade.get("created_at")
                if created_at and isinstance(created_at, datetime):
                    created_at_local = convert_to_timezone(
                        created_at, UTC_PLUS_8)
                    created_at_str = created_at_local.strftime(
                        "%Y-%m-%d %H:%M:%S")
                else:
                    created_at_str = str(created_at) if created_at else "N/A"

                # 開倉通知不需要計算持倉時間
                duration_str = "持倉中"

                message = (
                    # f"🔔 配對交易已開倉 🔔\n"
                    # f"{'='*30}\n"
                    f"📊 交易名稱: {trade.get('name', '未命名')}\n"
                    f"{'='*30}\n\n"
                    f"📈 【多頭】\n"
                    f"幣種: {long_position.get('symbol', '')}\n"
                    f"入場價格: {self._format_number(long_position.get('entry_price', 0), 6)} USDT\n"
                    f"槓桿倍數: {long_leverage}倍\n"
                    f"數量: {self._format_number(long_position.get('quantity', 0), 4)}\n"
                    f"手續費: {self._format_number(long_fee, 4)} USDT\n\n"
                    f"📉 【空頭】\n"
                    f"幣種: {short_position.get('symbol', '')}\n"
                    f"入場價格: {self._format_number(short_position.get('entry_price', 0), 6)} USDT\n"
                    f"槓桿倍數: {short_leverage}倍\n"
                    f"數量: {self._format_number(short_position.get('quantity', 0), 4)}\n"
                    f"手續費: {self._format_number(short_fee, 4)} USDT\n\n"
                    f"💰 【交易費用】\n"
                    f"總手續費: {self._format_number(total_fee, 4)} USDT\n\n"
                    f"⚠️ 【風險設定】\n"
                    f"最大虧損(1R): {self._format_number(max_loss, 2)} USDT\n"
                    f"止損: {self._format_number(stop_loss, 2)}%\n"
                    f"止盈: {self._format_number(take_profit, 2)}%\n\n"
                    f"⏰ 開倉時間: {created_at_str}\n"
                    # f"🆔 交易ID: {trade.get('id', '未知')}"
                )
            else:
                # 平倉通知
                long_position = trade.get('long_position', {})
                short_position = trade.get('short_position', {})

                # 獲取手續費信息
                long_entry_fee = long_position.get('entry_fee', 0)
                short_entry_fee = short_position.get('entry_fee', 0)
                long_exit_fee = long_position.get('exit_fee', 0)
                short_exit_fee = short_position.get('exit_fee', 0)
                total_fee = trade.get('total_fee', long_entry_fee + short_entry_fee + long_exit_fee + short_exit_fee)

                # 獲取盈虧信息
                long_pnl = long_position.get('pnl', 0)
                short_pnl = short_position.get('pnl', 0)
                total_pnl = trade.get('total_pnl_value', long_pnl + short_pnl)
                total_pnl_percent = trade.get('total_ratio_percent', 0)

                # 格式化時間
                created_at = trade.get("created_at")
                closed_at = trade.get("closed_at")
                if created_at and isinstance(created_at, datetime):
                    created_at_local = convert_to_timezone(
                        created_at, UTC_PLUS_8)
                    created_at_str = created_at_local.strftime(
                        "%Y-%m-%d %H:%M:%S")
                else:
                    created_at_str = "N/A"

                if closed_at and isinstance(closed_at, datetime):
                    closed_at_local = convert_to_timezone(closed_at, UTC_PLUS_8)
                    closed_at_str = closed_at_local.strftime(
                        "%Y-%m-%d %H:%M:%S")
                else:
                    closed_at_str = "N/A"

                duration_str = self._calculate_duration(
                    created_at, closed_at) if created_at and closed_at else "N/A"

                close_reason_display = self._get_close_reason_display(trade.get('close_reason', 'N/A'))

                message = (
                    # f"🔔 配對交易已平倉\n\n"
                    f"📊 交易名稱: {trade.get('name', 'N/A')}\n"
                    f"{'='*30}\n\n"
                    f"💰 總盈虧: {self._format_number(total_pnl, 2)} USDT ({self._format_number(total_pnl_percent, 2)}%)\n"
                    f"💰 總手續費: {self._format_number(total_fee, 2)} USDT\n"
                    f"💰 淨盈虧: {self._format_number(total_pnl - total_fee, 2)} USDT\n\n"
                    f"📈 多單詳情:\n"
                    f"• {long_position.get('symbol', 'N/A')}\n"
                    f"• 入場價格: {self._format_number(long_position.get('entry_price', 0), 6)} USDT\n"
                    f"• 平倉價格: {self._format_number(long_position.get('exit_price', 0), 6)} USDT\n"
                    f"• 數量: {self._format_number(long_position.get('quantity', 0), 4)}\n"
                    f"• 盈虧: {self._format_number(long_pnl, 2)} USDT ({self._format_number(long_position.get('pnl_percent', 0), 2)}%)\n\n"
                    f"📉 空單詳情:\n"
                    f"• {short_position.get('symbol', 'N/A')}\n"
                    f"• 入場價格: {self._format_number(short_position.get('entry_price', 0), 6)} USDT\n"
                    f"• 平倉價格: {self._format_number(short_position.get('exit_price', 0), 6)} USDT\n"
                    f"• 數量: {self._format_number(short_position.get('quantity', 0), 4)}\n"
                    f"• 盈虧: {self._format_number(short_pnl, 2)} USDT ({self._format_number(short_position.get('pnl_percent', 0), 2)}%)\n\n"
                    f"⏰ 開倉時間: {created_at_str}\n"
                    f"⏰ 平倉時間: {closed_at_str}\n"
                    f"⏰ 持倉時間: {duration_str}\n"
                    f"🆔 平倉原因: {close_reason_display}\n"
                    # f"交易ID: {trade.get('id', '未知')}"
                )

            return message
        except Exception as e:
            logger.error(f"格式化配對交易消息失敗: {e}")
            logger.error(traceback.format_exc())
            return "配對交易通知 (格式化失敗)"

    def _format_number(self, value, max_decimals=8):
        """格式化數字，移除不必要的尾隨零，但保留必要的精度"""
        if isinstance(value, str):
            value = float(value)

        # 將數字格式化為字符串，保留最大小數位數
        formatted = f"{value:.{max_decimals}f}"

        # 如果有小數點，移除尾隨零和可能的小數點
        if '.' in formatted:
            formatted = formatted.rstrip('0').rstrip('.') if '.' in formatted else formatted

        return formatted

    async def _send_trade_notification(self, user_id: str, trade: dict, message_type: str) -> bool:
        """
        發送交易通知

        Args:
            user_id: 用戶ID
            trade: 交易信息
            message_type: 消息類型 (open, update, close)

        Returns:
            bool: 是否發送成功
        """
        try:
            # 獲取用戶設置
            user_settings = await self.user_settings_service.get_user_settings(user_id)

            # 檢查是否啟用通知
            if not user_settings.get("enable_notifications", False):
                logger.info(f"用戶 {user_id} 未啟用通知")
                return False

            # 格式化消息
            message = self._format_trade_notification(trade, message_type)

            # 記錄原始消息
            logger.debug(f"原始通知消息: {message[:100]}...")

            # 發送通知標誌
            notification_sent = False

            # 發送Line通知
            if user_settings.get("line_token"):
                line_result = await self.send_line_notification(
                    user_settings["line_token"], message
                )
                if line_result:
                    notification_sent = True
                    logger.info(f"Line通知發送成功: 用戶 {user_id}")
                else:
                    logger.warning(f"Line通知發送失敗: 用戶 {user_id}")

            # 發送Discord通知
            if user_settings.get("discord_webhook"):
                discord_result = await self.send_discord_notification(
                    user_settings["discord_webhook"], message
                )
                if discord_result:
                    notification_sent = True
                    logger.info(f"Discord通知發送成功: 用戶 {user_id}")
                else:
                    logger.warning(f"Discord通知發送失敗: 用戶 {user_id}")

            # 發送Telegram通知
            if user_settings.get("telegram_token") and user_settings.get("telegram_chat_id"):
                telegram_result = await self.send_telegram_notification(
                    user_settings["telegram_token"],
                    user_settings["telegram_chat_id"],
                    message
                )
                if telegram_result:
                    notification_sent = True
                    logger.info(f"Telegram通知發送成功: 用戶 {user_id}")
                else:
                    logger.warning(f"Telegram通知發送失敗: 用戶 {user_id}")

            if not notification_sent:
                logger.warning(f"未能發送任何通知: 用戶 {user_id}，請檢查通知設置")

            return notification_sent
        except Exception as e:
            logger.error(f"發送交易通知時出錯: {str(e)}")
            return False

    def _format_trade_notification(self, trade: dict, message_type: str) -> str:
        """
        格式化交易通知消息

        Args:
            trade: 交易信息
            message_type: 消息類型 (open, update, close)

        Returns:
            str: 格式化後的消息
        """
        try:
            # 獲取基本交易信息
            pair_name = trade.get("pair_name", "未知配對")
            status = trade.get("status", "未知")

            # 獲取價格信息
            entry_price_1 = trade.get("entry_price_1", 0)
            entry_price_2 = trade.get("entry_price_2", 0)
            current_price_1 = trade.get("current_price_1", 0)
            current_price_2 = trade.get("current_price_2", 0)

            # 獲取盈虧信息
            pnl = trade.get("pnl", 0)
            pnl_percentage = trade.get("pnl_percentage", 0)

            # 根據消息類型格式化消息
            if message_type == "open":
                message = "【新配對交易開倉】\n\n"
                message += f"配對: {pair_name}\n"
                message += f"{trade.get('symbol_1', '幣種1')}: {entry_price_1}\n"
                message += f"{trade.get('symbol_2', '幣種2')}: {entry_price_2}\n"
                message += f"投資額: {trade.get('investment_amount', 0)} USDT\n"
                message += f"開倉時間: {trade.get('created_at', '未知')}\n"

            elif message_type == "update":
                message = "【配對交易更新】\n\n"
                message += f"配對: {pair_name}\n"
                message += f"{trade.get('symbol_1', '幣種1')}: {current_price_1} ({self._calculate_change(entry_price_1, current_price_1)}%)\n"
                message += f"{trade.get('symbol_2', '幣種2')}: {current_price_2} ({self._calculate_change(entry_price_2, current_price_2)}%)\n"
                message += f"盈虧: {pnl:.2f} USDT ({pnl_percentage:.2f}%)\n"
                message += f"更新時間: {trade.get('updated_at', '未知')}\n"

            elif message_type == "close":
                close_reason = trade.get("close_reason", "手動平倉")
                close_reason_display = self._get_close_reason_display(close_reason)
                message = "【配對交易平倉】\n\n"
                message += f"配對: {pair_name}\n"
                message += f"{trade.get('symbol_1', '幣種1')}: {current_price_1} ({self._calculate_change(entry_price_1, current_price_1)}%)\n"
                message += f"{trade.get('symbol_2', '幣種2')}: {current_price_2} ({self._calculate_change(entry_price_2, current_price_2)}%)\n"
                message += f"最終盈虧: {pnl:.2f} USDT ({pnl_percentage:.2f}%)\n"
                message += f"平倉原因: {close_reason_display}\n"
                message += f"平倉時間: {trade.get('closed_at', trade.get('updated_at', '未知'))}\n"
                message += f"持倉時間: {self._calculate_duration(trade.get('created_at'), trade.get('closed_at', trade.get('updated_at')))}\n"
            else:
                message = "【配對交易通知】\n\n"
                message += f"配對: {pair_name}\n"
                message += f"狀態: {status}\n"

            # 添加交易ID以便參考
            message += f"\n交易ID: {trade.get('id', '未知')}"

            return message
        except Exception as e:
            logger.error(f"格式化交易通知消息時出錯: {str(e)}")
            return "配對交易通知 (格式化失敗)"

    def _calculate_change(self, old_value, new_value) -> float:
        """計算價格變化百分比"""
        try:
            if old_value and float(old_value) > 0:
                return round(((float(new_value) - float(old_value)) / float(old_value)) * 100, 2)
            return 0
        except (ValueError, TypeError):
            return 0

    def _calculate_duration(self, start_time, end_time) -> str:
        """計算持倉時間"""
        try:
            if not start_time or not end_time:
                return "未知"

            # 將時間字符串轉換為datetime對象
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(
                    start_time.replace('Z', '+00:00'))
            if isinstance(end_time, str):
                end_time = datetime.fromisoformat(
                    end_time.replace('Z', '+00:00'))

            # 確保兩個datetime對象都有相同的時區處理
            # 如果其中一個是naive（無時區），將其轉換為UTC
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)

            # 計算時間差
            duration = end_time - start_time
            days = duration.days
            hours, remainder = divmod(duration.seconds, 3600)
            minutes, seconds = divmod(remainder, 60)

            # 格式化持倉時間
            if days > 0:
                return f"{days}天 {hours}小時 {minutes}分鐘"
            elif hours > 0:
                return f"{hours}小時 {minutes}分鐘"
            else:
                return f"{minutes}分鐘 {seconds}秒"
        except Exception as e:
            logger.error(f"計算持倉時間時出錯: {str(e)}")
            return "未知"

    async def send_notification(self, user_id: str, title: str, message: str, data: Dict = None) -> bool:
        """
        發送通知到所有已配置的通知渠道

        Args:
            user_id: 用戶ID
            title: 通知標題
            message: 通知消息
            data: 額外的通知數據

        Returns:
            bool: 是否至少有一個通知發送成功
        """
        try:
            # 獲取用戶設置
            user_settings = await self.user_settings_service.get_user_settings(user_id)
            if not user_settings:
                logger.warning(f"未找到用戶 {user_id} 的設置")
                return False

            # 確保notification_settings是一個字典，並安全地記錄日誌
            notification_settings = user_settings.notification_settings

            # 安全地記錄通知設置（過濾敏感資訊）
            from app.utils.safe_logging import filter_sensitive_data
            safe_settings = filter_sensitive_data(notification_settings)
            logger.info(f"用戶 {user_id} 通知設置: {safe_settings}")

            # 檢查是否啟用通知
            # if not notification_settings.get("enabled", False):
            #     logger.info(f"用戶 {user_id} 未啟用通知功能，跳過發送")
            #     return False

            # 記錄要發送的通知
            logger.info(f"準備發送通知: {title}")
            logger.debug(f"通知內容: {message[:100]}...")

            # 檢查配置的通知渠道
            has_line = bool(notification_settings.get("line_token"))
            has_discord = bool(notification_settings.get("discord_webhook"))
            has_telegram = bool(notification_settings.get("telegram_token") and
                                notification_settings.get("telegram_chat_id"))

            logger.info(f"配置的通知渠道: Line={has_line}, Discord={has_discord}, Telegram={has_telegram}")

            if not (has_line or has_discord or has_telegram):
                logger.warning(f"用戶 {user_id} 沒有配置任何通知渠道")
                return False

            # 發送通知標誌
            notification_sent = False

            # # 發送Line通知
            # if has_line:
            #     line_token = notification_settings.get("line_token")
            #     # 檢查token長度，用於診斷
            #     logger.info(f"Line令牌長度: {len(line_token) if line_token else 0}")

            #     # 確保標題和消息之間有清晰的分隔
            #     line_message = f"【{title}】\n{'='*30}\n{message}"
            #     line_result = await self.send_line_notification(
            #         line_token,
            #         line_message
            #     )
            #     if line_result:
            #         notification_sent = True
            #         logger.info(f"Line通知發送成功: {user_id}")
            #     else:
            #         logger.warning(f"Line通知發送失敗: {user_id}，可能的令牌: {line_token[:5] if line_token else None}...")

            # 發送Discord通知
            if has_discord:
                discord_webhook = notification_settings.get("discord_webhook")
                # 檢查webhook URL長度，用於診斷
                logger.info(f"Discord webhook長度: {len(discord_webhook) if discord_webhook else 0}")

                # 確保標題和消息之間有清晰的分隔
                discord_message = f"【{title}】\n{'='*30}\n{message}"
                discord_result = await self.send_discord_notification(
                    discord_webhook,
                    discord_message
                )
                if discord_result:
                    notification_sent = True
                    logger.info(f"Discord通知發送成功: {user_id}")
                else:
                    # 安全地記錄失敗資訊，不洩漏敏感資料
                    from app.utils.safe_logging import mask_sensitive_value
                    safe_webhook = mask_sensitive_value(discord_webhook) if discord_webhook else None
                    logger.warning(f"Discord通知發送失敗: {user_id}，webhook URL: {safe_webhook}")

            # 發送Telegram通知
            if has_telegram:
                telegram_token = notification_settings.get("telegram_token")
                telegram_chat_id = notification_settings.get("telegram_chat_id")

                # 確保標題和消息之間有清晰的分隔
                telegram_message = f"【{title}】\n{'='*30}\n{message}"
                telegram_result = await self.send_telegram_notification(
                    telegram_token,
                    telegram_chat_id,
                    telegram_message
                )
                if telegram_result:
                    notification_sent = True
                    logger.info(f"Telegram通知發送成功: {user_id}")
                else:
                    logger.warning(
                        f"Telegram通知發送失敗: {user_id}，"
                    )

            if not notification_sent:
                logger.warning(f"未能發送任何通知: {user_id}，所有通知渠道都失敗")
            else:
                logger.info(f"成功通過至少一個渠道發送通知: {user_id}")

            return notification_sent

        except Exception as e:
            logger.error(f"發送通知時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return False


# 創建通知服務實例
notification_service = NotificationService()
