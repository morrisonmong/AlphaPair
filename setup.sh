#!/bin/bash

# AlphaPair 一鍵安裝腳本 (macOS/Linux)
# 版本: 1.0.0
# 支援平台: macOS, Linux

set -e  # 遇到錯誤立即退出

echo "🚀 AlphaPair 一鍵安裝腳本 (macOS/Linux)"
echo "======================================="
echo ""

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 檢測作業系統
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="Linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macOS"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]] || [[ -n "$WINDIR" ]]; then
        OS="Windows (Git Bash)"
    else
        # 嘗試其他檢測方法
        if command -v uname &> /dev/null; then
            case "$(uname -s)" in
                Linux*)     OS="Linux";;
                Darwin*)    OS="macOS";;
                CYGWIN*)    OS="Windows (Cygwin)";;
                MINGW*)     OS="Windows (Git Bash)";;
                MSYS*)      OS="Windows (MSYS2)";;
                *)          OS="Unknown";;
            esac
        else
            OS="Unknown"
        fi
    fi
}

detect_os
echo "🖥️  檢測到作業系統: $OS"

# 檢查是否為支援的系統
if [ "$OS" = "Unknown" ]; then
    echo -e "${RED}❌ 錯誤: 不支援的作業系統${NC}"
    echo ""
    echo "此腳本支援 macOS、Linux 和 Windows (Git Bash)"
    echo "如果您在 Windows 上，請確保使用 Git Bash 執行此腳本"
    # echo "或者您也可以使用: setup.bat"
    exit 1
fi

# 檢查 Docker 是否安裝
echo "🔍 檢查系統環境..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ 錯誤: Docker 未安裝${NC}"
    echo ""
    echo "請先安裝 Docker:"
    if [ "$OS" = "macOS" ]; then
        echo "  macOS: https://www.docker.com/products/docker-desktop/"
    elif [[ "$OS" == *"Windows"* ]]; then
        echo "  Windows: https://www.docker.com/products/docker-desktop/"
        # echo "  請確保 Docker Desktop 已啟動並且在 Git Bash 中可用"
    else
        echo "  Linux: https://docs.docker.com/engine/install/"
    fi
    exit 1
fi

# 檢查 Docker Compose 是否安裝
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ 錯誤: Docker Compose 未安裝${NC}"
    echo "請先安裝 Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✅ Docker 環境檢查通過${NC}"
echo ""

# 檢查是否存在 AlphaPair 相關的容器或卷
echo "🔍 檢查現有的 AlphaPair 安裝..."
existing_containers=$(docker ps -a --format "table {{.Names}}" 2>/dev/null | grep "alphapair" || true)
existing_volumes=$(docker volume ls --format "table {{.Name}}" 2>/dev/null | grep "alphapair" || true)

if [ -n "$existing_containers" ] || [ -n "$existing_volumes" ]; then
    echo -e "${YELLOW}⚠️  檢測到現有的 AlphaPair 安裝${NC}"
    echo ""
    if [ -n "$existing_containers" ]; then
        echo "現有容器："
        echo "$existing_containers" | sed 's/^/  • /'
    fi
    if [ -n "$existing_volumes" ]; then
        echo "現有數據卷："
        echo "$existing_volumes" | sed 's/^/  • /'
    fi
    echo ""
    echo -e "${RED}⚠️  重要提醒：${NC}"
    echo -e "${RED}此腳本是為 ${BOLD}首次安裝${NC}${RED} 設計的！${NC}"
    echo ""
    echo -e "${BLUE}如果您已經在使用 AlphaPair：${NC}"
    echo -e "  • 清理數據卷會 ${RED}永久刪除${NC} 您的所有數據（交易記錄、配對策略、用戶設定等）"
    echo -e "  • 如果要升級版本，請參照 README.md 的 ${GREEN}升級步驟${NC}"
    echo ""
    echo -e "${BLUE}如果這是全新安裝或測試環境：${NC}"
    echo "  • 可以安全地清理現有安裝"
    echo ""
    echo -e "${YELLOW}請仔細考慮後再做決定！${NC}"
    echo ""
    
    # 提供更明確的選項
    echo "請選擇您的操作："
    echo "  1) 完全重新安裝（刪除所有數據，適合新用戶或測試環境）"
    echo "  2) 退出腳本（我已在使用 AlphaPair，需要升級或維護）"
    echo ""
    
    while true; do
        read -p "請輸入選項 (1/2): " choice
        case $choice in
            1)
                echo ""
                echo -e "${RED}⚠️  重要警告：${NC}"
                echo "這將永久刪除以下數據："
                echo "  • 所有交易記錄和歷史數據"
                echo "  • 配對交易策略設定"
                echo "  • 用戶帳戶和 API 密鑰"
                echo "  • 資產快照記錄"
                echo ""
                read -p "確定要刪除所有數據並重新安裝嗎？請輸入 'DELETE' 確認: " confirm
                if [ "$confirm" = "DELETE" ]; then
                    echo ""
                    echo "🧹 正在清理現有安裝..."
                    
                    # 停止並移除容器和數據卷
                    echo "  停止並移除所有容器和數據卷..."
                    docker-compose down -v 2>/dev/null || true
                    
                    echo -e "${GREEN}✅ 清理完成，準備重新安裝${NC}"
                    echo ""
                    break
                else
                    echo -e "${YELLOW}確認失敗，請重新選擇${NC}"
                    echo ""
                fi
                ;;
            2)
                echo ""
                echo -e "${GREEN}明智的選擇！${NC}"
                echo ""
                echo "📋 常用維護命令："
                echo ""
                echo "🔄 升級到最新版本："
                echo "   下載新的程式碼"
                echo "   執行以下指令進行更新！"
                echo "   docker-compose build"
                echo "   docker-compose down"
                echo "   docker-compose up -d"
                echo ""
                echo "📊 查看狀態和日誌："
                echo "   • 運行狀態：docker-compose ps"
                echo "   • 查看日誌：docker-compose logs"
                echo "   • 重啟服務：docker-compose restart"
                echo ""
                echo "🆘 如遇問題："
                echo "   • 重啟所有服務：docker-compose restart"
                echo "   • 重建容器：docker-compose up -d --build"
                echo ""
                echo "更多資訊請參考 README.md"
                exit 0
                ;;
            *)
                echo -e "${RED}無效選項，請輸入 1 或 2${NC}"
                ;;
        esac
    done
else
    echo -e "${GREEN}✅ 未發現現有安裝，可以安全地進行首次安裝${NC}"
    echo ""
fi

# 檢查是否已存在 .env 檔案
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  發現現有的 .env 檔案${NC}"
    read -p "是否要覆蓋現有的 .env 檔案？(y/N): " overwrite
    if [[ ! $overwrite =~ ^[Yy]$ ]]; then
        echo "保留現有 .env 檔案，跳過配置步驟..."
        skip_env=true
    else
        echo "將覆蓋現有的 .env 檔案..."
        skip_env=false
    fi
    echo ""
else
    skip_env=false
fi

# 密鑰生成函數
generate_random_key() {
    local length=$1
    
    # 優先使用 openssl
    if command -v openssl &> /dev/null; then
        openssl rand -hex $((length/2))
    # 使用 /dev/urandom (Unix-like 系統)
    elif [ -r /dev/urandom ]; then
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
    # 備用方案：使用 date 和 RANDOM
    else
        echo "$(date +%s)$(echo $RANDOM)$(echo $RANDOM)" | sha256sum | cut -c1-$length 2>/dev/null || \
        echo "$(date +%s)$(echo $RANDOM)$(echo $RANDOM)" | md5sum | cut -c1-$length 2>/dev/null || \
        echo "AlphaPair$(date +%s)SecretKey_$(echo $RANDOM)" | cut -c1-$length
    fi
}

# 如果不跳過環境配置
if [ "$skip_env" = false ]; then
    echo "📝 配置 AlphaPair 環境"
    echo "======================"
    echo ""
    echo -e "${BLUE}請輸入以下資訊來配置您的 AlphaPair 系統：${NC}"
    echo ""

    # 輸入資料庫使用者名稱
    while true; do
        read -p "🔐 資料庫管理員使用者名稱: " mongodb_user
        if [ -n "$mongodb_user" ]; then
            break
        else
            echo -e "${RED}❌ 使用者名稱不能為空，請重新輸入${NC}"
        fi
    done

    # 輸入資料庫密碼（隱藏輸入）
    while true; do
        read -s -p "🔒 資料庫管理員密碼: " mongodb_password
        echo ""
        if [ -n "$mongodb_password" ]; then
            read -s -p "🔒 請再次確認密碼: " mongodb_password_confirm
            echo ""
            if [ "$mongodb_password" = "$mongodb_password_confirm" ]; then
                break
            else
                echo -e "${RED}❌ 密碼不一致，請重新輸入${NC}"
            fi
        else
            echo -e "${RED}❌ 密碼不能為空，請重新輸入${NC}"
        fi
    done

    echo ""
    echo "⏰ 資產快照排程設定"
    echo "=================="
    echo -e "${BLUE}資產快照會自動記錄您的資產狀況，用於分析和圖表顯示${NC}"
    echo ""
    echo "預設排程時間（UTC 時間）："
    echo "  • 0:00 (台灣時間 8:00)"
    echo "  • 8:00 (台灣時間 16:00)" 
    echo "  • 16:00 (台灣時間 24:00)"
    echo ""
    read -p "是否使用預設的資產快照時間？(Y/n): " use_default_snapshot
    
    if [[ $use_default_snapshot =~ ^[Nn]$ ]]; then
        echo ""
        echo "請輸入自訂的資產快照時間（UTC 時間）："
        echo "格式：用逗號分隔的小時數，例如：0,6,12,18"
        echo ""
        while true; do
            read -p "📸 資產快照執行時間（小時，0-23）: " snapshot_hours
            if [[ $snapshot_hours =~ ^[0-9,]+$ ]] && [[ -n "$snapshot_hours" ]]; then
                # 驗證小時數是否在有效範圍內
                valid=true
                IFS=',' read -ra HOURS <<< "$snapshot_hours"
                for hour in "${HOURS[@]}"; do
                    if [[ $hour -lt 0 ]] || [[ $hour -gt 23 ]]; then
                        valid=false
                        break
                    fi
                done
                if [ "$valid" = true ]; then
                    break
                else
                    echo -e "${RED}❌ 小時數必須在 0-23 範圍內，請重新輸入${NC}"
                fi
            else
                echo -e "${RED}❌ 格式錯誤，請輸入用逗號分隔的數字，例如：0,8,16${NC}"
            fi
        done
        
        while true; do
            read -p "📸 資產快照執行分鐘（0-59）: " snapshot_minute
            if [[ $snapshot_minute =~ ^[0-9]+$ ]] && [[ $snapshot_minute -ge 0 ]] && [[ $snapshot_minute -le 59 ]]; then
                break
            else
                echo -e "${RED}❌ 分鐘數必須在 0-59 範圍內，請重新輸入${NC}"
            fi
        done
        
        echo ""
        echo "✅ 自訂資產快照時間：$snapshot_hours:$(printf "%02d" $snapshot_minute) UTC"
    else
        snapshot_hours="0,8,16"
        snapshot_minute="0"
        echo ""
        echo "✅ 使用預設資產快照時間：$snapshot_hours:$(printf "%02d" $snapshot_minute) UTC"
    fi

    echo ""
    echo "🔑 正在生成安全密鑰..."

    # 生成密鑰
    JWT_SECRET_KEY=$(generate_random_key 64)
    SECRET_KEY=$(generate_random_key 64)
    CRYPTO_SALT=$(generate_random_key 32)

    # 檢查密鑰是否成功生成
    if [ ${#JWT_SECRET_KEY} -lt 32 ] || [ ${#SECRET_KEY} -lt 32 ] || [ ${#CRYPTO_SALT} -lt 16 ]; then
        echo -e "${YELLOW}⚠️  密鑰生成可能不完整，使用備用方案...${NC}"
        JWT_SECRET_KEY="AlphaPair_JWT_$(date +%s)_$(echo $RANDOM)_SecretKey_$(echo $RANDOM)"
        SECRET_KEY="AlphaPair_Secret_$(date +%s)_$(echo $RANDOM)_Key_$(echo $RANDOM)"
        CRYPTO_SALT="AlphaPair_Salt_$(date +%s)_$(echo $RANDOM)"
    fi

    echo -e "${GREEN}✅ 安全密鑰生成完成${NC}"
    echo ""

    # 顯示配置摘要
    echo "📋 配置摘要"
    echo "==========="
    echo "資料庫使用者: $mongodb_user"
    echo "資料庫密碼: ********"
    echo "JWT 密鑰: ${JWT_SECRET_KEY:0:16}..."
    echo "通用密鑰: ${SECRET_KEY:0:16}..."
    echo "加密鹽值: ${CRYPTO_SALT:0:8}..."
    echo "資產快照時間: $snapshot_hours:$(printf "%02d" $snapshot_minute) UTC"
    echo ""

    # 確認配置
    read -p "確認以上配置並繼續安裝？(Y/n): " confirm
    if [[ $confirm =~ ^[Nn]$ ]]; then
        echo "安裝已取消"
        exit 0
    fi

    echo ""
    echo "📝 正在生成 .env 檔案..."

    # 生成 .env 檔案
    cat > .env << EOF
# ==========================================
# AlphaPair 環境變數配置
# 由安裝腳本自動生成於 $(date)
# 作業系統: $OS
# ==========================================

# ==========================================
# 資料庫配置
# ==========================================
MONGODB_ROOT_USER=$mongodb_user
MONGODB_ROOT_PASSWORD=$mongodb_password
MONGODB_DB=alphapair
MONGODB_PORT=27018

# MongoDB 連接優化
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
MONGODB_CONNECT_TIMEOUT_MS=5000
MONGODB_SOCKET_TIMEOUT_MS=10000
MONGODB_MAX_POOL_SIZE=50
MONGODB_MAX_RETRIES=5
MONGODB_RETRY_DELAY=2

# ==========================================
# JWT/認證配置
# ==========================================
JWT_SECRET_KEY=$JWT_SECRET_KEY
JWT_ALGORITHM=HS256
JWT_EXPIRATION=240

# ==========================================
# 通用加密配置
# ==========================================
SECRET_KEY=$SECRET_KEY
CRYPTO_SALT=$CRYPTO_SALT

# ==========================================
# 服務端口配置
# ==========================================
API_PORT=8000
FRONTEND_PORT=3000

# ==========================================
# 前端配置
# ==========================================
NEXT_PUBLIC_API_URL=http://localhost:8000
NODE_ENV=production
ENVIRONMENT=production

# ==========================================
# 監控服務配置
# ==========================================
MONITOR_UPDATE_INTERVAL=1
MONITOR_ERROR_RETRY_INTERVAL=5

# ==========================================
# 資產快照排程配置
# ==========================================
ASSET_SNAPSHOT_HOURS=$snapshot_hours
ASSET_SNAPSHOT_MINUTE=$snapshot_minute

# ==========================================
# 日誌配置
# ==========================================
# Docker 容器日誌檔案大小限制（例如：10m, 100m, 1g）
LOG_MAX_SIZE=10m

# Docker 容器日誌檔案保留數量
LOG_MAX_FILES=3
EOF

    echo -e "${GREEN}✅ .env 檔案生成完成${NC}"
    echo ""
fi

# 停止現有服務（如果有）
echo "🛑 停止現有服務..."
docker-compose down 2>/dev/null || true
echo ""

# 構建並啟動服務
echo "🔨 構建並啟動 AlphaPair 服務..."
echo "這可能需要幾分鐘時間，請耐心等待..."
echo ""

if docker-compose up -d --build; then
    echo -e "${GREEN}✅ 服務啟動成功${NC}"
else
    echo -e "${RED}❌ 服務啟動失敗${NC}"
    echo ""
    echo "錯誤詳情："
    docker-compose logs --tail=20
    echo ""
    echo -e "${YELLOW}常見問題和解決方案：${NC}"
    echo ""
    echo -e "1. ${BLUE}MongoDB 認證失敗${NC}（UserNotFound 錯誤）："
    echo "   • 可能存在衝突的 Docker 卷或容器"
    echo "   • 解決方案：docker-compose down && ./setup.sh"
    echo ""
    echo -e "2. ${BLUE}端口被占用${NC}（port already in use）："
    echo "   • 檢查端口使用：lsof -i :3000 -i :8000 -i :27018"
    echo "   • 停止占用進程或修改 .env 中的端口配置"
    echo ""
    echo -e "3. ${BLUE}Docker 資源不足${NC}："
    echo "   • 確保 Docker Desktop 有足夠的記憶體（建議 4GB+）"
    echo "   • 清理未使用的映像：docker system prune"
    echo ""
    echo -e "4. ${BLUE}網路問題${NC}："
    echo "   • 檢查防火牆設定"
    echo "   • 確保 Docker Desktop 正在運行"
    echo ""
    echo -e "${BLUE}📋 詳細診斷命令：${NC}"
    echo "   • 查看完整日誌：docker-compose logs"
    echo "   • 查看特定服務：docker-compose logs mongodb"
    echo "   • 檢查容器狀態：docker-compose ps"
    echo "   • 重新安裝：docker-compose down -v && ./setup.sh"
    echo ""
    echo "如果問題持續，請將錯誤訊息提供給技術支援。"
    exit 1
fi

echo ""

# 等待服務啟動
echo "⏳ 等待服務完全啟動..."
sleep 15

# 檢查服務狀態
echo "🔍 檢查服務狀態..."
docker-compose ps
echo ""

# 檢查 API 健康狀態
echo "🏥 檢查 API 服務..."
api_ready=false
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API 服務正常運行${NC}"
        api_ready=true
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  API 服務啟動超時，但可能仍在初始化中${NC}"
        break
    fi
    sleep 2
done

# 檢查前端服務
echo "🌐 檢查前端服務..."
frontend_ready=false
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 前端服務正常運行${NC}"
        frontend_ready=true
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  前端服務啟動超時，但可能仍在初始化中${NC}"
        break
    fi
    sleep 2
done

echo ""
echo "🎉 AlphaPair 安裝完成！"
echo "========================"
echo ""

if [ "$api_ready" = true ] && [ "$frontend_ready" = true ]; then
    echo -e "${GREEN}🌟 所有服務運行正常！${NC}"
    echo ""
    echo "📱 立即訪問 AlphaPair："
    echo "   🌐 前端界面: http://localhost:3000"
else
    echo -e "${YELLOW}⚠️  部分服務可能仍在啟動中${NC}"
    echo ""
    echo "📱 請稍等片刻後訪問："
    echo "   🌐 前端界面: http://localhost:3000"
    echo ""
    echo "如果服務無法正常訪問，請執行以下命令檢查："
    echo "   docker-compose logs"
fi

echo ""
echo "📋 常用管理命令："
echo "   查看狀態: docker-compose ps"
echo "   查看日誌: docker-compose logs -f"
echo "   停止服務: docker-compose down"
echo "   重啟服務: docker-compose restart"
echo ""
echo "🔒 安全提醒："
echo "   1. 您的資料庫密碼和密鑰已安全儲存在 .env 檔案中"
echo "   2. 請勿將 .env 檔案分享給他人"
echo "   3. 定期備份 MongoDB 資料"
echo ""
echo "💡 使用提示："
echo "   - 請確保 Docker Desktop 已設為開機啟動"
echo "   - 如遇權限問題，可嘗試使用 sudo 執行"
echo ""
echo "📚 更多資訊請參考 README.md"
echo ""
echo -e "${GREEN}🚀 開始您的配對交易之旅吧！${NC}" 