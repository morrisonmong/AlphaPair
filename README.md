# 🚀 AlphaPair - 開源配對交易系統

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Python](https://img.shields.io/badge/Python-3.10+-green.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-19+-black.svg)](https://nextjs.org/)

AlphaPair 是一個功能完整的配對交易系統，支援幣安合約交易，提供實時監控、圖表分析、檢視交易紀錄、資產快照等功能。

> ⚠️ **重要風險提醒**
>
> 請確保：
>
> - 完全理解配對交易的運作原理
> - 只投入您能承受損失的資金
> - 先用小額資金進行測試，確保系統穩定性和電腦效能
>
> 本軟體僅供教育和研究目的，不構成投資建議。

## 📚 目錄

- [🚀 AlphaPair - 開源配對交易系統](#-alphapair---開源配對交易系統)
  - [📚 目錄](#-目錄)
  - [✨ 主要功能](#-主要功能)
  - [🔍 頁面功能說明](#-頁面功能說明)
  - [🛠️ 技術架構](#️-技術架構)
    - [後端](#後端)
    - [前端](#前端)
  - [🚀 快速開始](#-快速開始)
    - [📋 系統需求](#-系統需求)
    - [🐳 安裝 Docker](#-安裝-docker)
    - [📥 下載 AlphaPair](#-下載-alphapair)
    - [🎯 一鍵安裝並啟動服務](#-一鍵安裝並啟動服務)
    - [🔧 進階選項（可跳過）](#-進階選項可跳過)
    - [⚙️ 系統配置調整](#️-系統配置調整)
      - [📸 資產快照時間設定](#-資產快照時間設定)
      - [🔍 監控頻率設定](#-監控頻率設定)
    - [📝 安裝過程說明](#-安裝過程說明)
    - [🎉 安裝完成](#-安裝完成)
  - [📋 使用說明](#-使用說明)
    - [🎯 第一次使用 AlphaPair](#-第一次使用-alphapair)
      - [1. 創建帳戶](#1-創建帳戶)
      - [2. 設定幣安 API 密鑰 (必要步驟)](#2-設定幣安-api-密鑰-必要步驟)
      - [3. 通知設置](#3-通知設置)
      - [4. 開始您的第一個配對交易](#4-開始您的第一個配對交易)
    - [🔧 日常操作](#-日常操作)
      - [調整交易參數](#調整交易參數)
  - [🔧 常用命令](#-常用命令)
    - [📊 服務管理](#-服務管理)
    - [📝 服務日誌查看](#-服務日誌查看)
    - [🔄 更新和維護](#-更新和維護)
  - [🐛 故障排除](#-故障排除)
    - [❓ 常見問題解決](#-常見問題解決)
      - [問題 1: 無法訪問 http://localhost:3000 或 http://{IP}:3000](#問題-1-無法訪問-httplocalhost3000-或-httpip3000)
      - [問題 2: 安裝腳本執行失敗](#問題-2-安裝腳本執行失敗)
      - [問題 3: 服務啟動失敗](#問題-3-服務啟動失敗)
    - [🆘 獲取幫助](#-獲取幫助)
  - [📁 專案結構](#-專案結構)
  - [🔒 安全注意事項](#-安全注意事項)

## ✨ 主要功能

- 📊 **實時儀表板** - 提供豐富的圖表和統計分析
- 🔄 **配對交易策略** - 執行配對交易策略的開關單，並監控交易狀態
- 🔍 **實時監控** - 每秒檢查配對交易狀態，自動執行平倉操作
- 📈 **交易紀錄** - 檢視交易紀錄和績效分析
- 📸 **自動資產快照** - 每天 0:00、8:00、16:00（UTC）自動記錄資產狀況
- 🔐 **安全認證** - JWT 身份驗證和 API 密鑰管理
- ⚙️ **可調整配置** - 可透過 .env 檔案調整監控頻率和快照時間

## 🔍 頁面功能說明

1. **儀表板**: 查看整體績效和統計數據
2. **配對交易**: 監控個別交易狀態
3. **交易紀錄**: 查看所有交易記錄及績效分析，提供匯入匯出功能

## 🛠️ 技術架構

### 後端

- **FastAPI** - 高性能的 API 框架
- **MongoDB** - NoSQL 資料庫
- **Motor** - 異步 MongoDB 驅動
- **APScheduler** - 任務調度器

### 前端

- **Next.js 19+** - React 前端框架
- **TypeScript** - 確保型別安全
- **Tailwind CSS** - CSS 框架
- **shadcn/ui** - 現代化 UI 組件庫
- **Recharts** - 數據可視化圖表庫

## 🚀 快速開始

### 📋 系統需求

- **作業系統**: Windows, macOS, 或 Linux
- **記憶體**: 建議至少 4GB RAM
- **網路**: 穩定的網際網路連線，系統監控倉位時需維持連線的狀態，若家用環境不穩定，可以考慮佈上雲端伺服器

### 🐳 安裝 Docker

**Windows / macOS 使用者:**

1. 前往 [Docker](https://www.docker.com/products/docker-desktop/)
2. 根據您的作業系統選擇對應版本 (Windows, Mac, Linux)
3. 下載 Docker Desktop 並執行安裝程式
4. 開啟 Docker Desktop 並等待啟動完成 (約 1-2 分鐘)，設定開機時自動啟動
5. 到終端機中，執行 `docker -v` 確認是否安裝成功，如果出現版本號則安裝成功
6. 執行 `docker-compose --version` 確認是否安裝成功，如果出現版本號則安裝成功

**Linux 使用者:**

1. 前往 [Docker](https://docs.docker.com/engine/install/)
2. 根據您的作業系統選擇對應版本 (Ubuntu, Debian, CentOS, etc.)
3. 執行安裝指令
4. 到終端機中執行 `docker -v` 確認是否安裝成功，如果出現版本號則安裝成功
5. 到終端機中執行 `docker-compose --version` 確認是否安裝成功，如果出現版本號則安裝成功

### 📥 下載 AlphaPair

**方法一：使用瀏覽器下載**

1. 點擊 "Code" 按鈕
2. 選擇 "Download ZIP" 並解壓縮到您想要的資料夾
3. 開啟該資料夾

**方法二：使用 Git**

```bash
git clone https://github.com/morrisonmong/AlphaPair.git
cd AlphaPair
```

### 🎯 一鍵安裝並啟動服務

💡 **注意**: 只有第一次安裝時需要執行，後續若有版本更新，請參考 [更新和維護](#-更新和維護) 章節

**支援 Windows/macOS/Linux**

**Windows 使用者需要先安裝 Git Bash:**

1. 前往 [Git for Windows](https://git-scm.com/download/win) 下載並安裝 Git
2. 安裝完成後，在專案資料夾右鍵選擇 "Git Bash Here"
3. 在 Git Bash 中執行以下命令：

```bash
chmod +x setup.sh
./setup.sh
```

**macOS/Linux 使用者:**

```bash
chmod +x setup.sh
./setup.sh
```

### 🔧 進階選項（可跳過）

### ⚙️ 系統配置調整

初始化完成後，您可以透過編輯 `.env` 檔案來調整系統行為：

#### 📸 資產快照時間設定

```env
# 資產快照執行時間（小時，UTC 時間，用逗號分隔）
ASSET_SNAPSHOT_HOURS=0,8,16

# 資產快照執行分鐘
ASSET_SNAPSHOT_MINUTE=0
```

**說明：**

- 預設每天 0:00、8:00、16:00（UTC 時間）自動建立資產快照
- 安裝時可以自訂資產快照時間，或後續修改 .env 檔案調整
- 您也可以在儀表板中手動建立當下的資產快照
- UTC 時間比台灣時間慢 8 小時（UTC 0:00 = 台灣 8:00）

#### 🔍 監控頻率設定

```env
# 監控更新間隔（秒鐘）
MONITOR_UPDATE_INTERVAL=1

# 監控錯誤重試間隔（秒鐘）
MONITOR_ERROR_RETRY_INTERVAL=5
```

**效能建議：**

- 預設每秒檢查一次配對交易狀態
- 如果監控間隔設定太長，可能會在需要平倉時造成滑價損失
- 高頻交易建議維持 1 秒間隔，確保及時平倉
- 修改後需要重啟服務：`docker-compose -p alphapair restart`（僅重啟，不會重新構建）

### 📝 安裝過程說明

執行安裝腳本時，系統會：

1. **檢查 Docker 環境** - 確認 Docker 和 Docker Compose 已正確安裝
2. **互動式配置** - 提示您輸入：

   - 資料庫管理員使用者名稱
   - 資料庫管理員密碼（隱藏輸入）

3. **自動生成安全密鑰** - 系統會自動生成：
   - JWT 密鑰 (64 字符)
   - 通用加密密鑰 (64 字符)
   - 加密鹽值 (32 字符)
4. **生成 .env 檔案** - 包含所有必要的配置，之後您可以透過編輯 .env 檔案來調整系統行為
5. **啟動服務** - 自動執行 `docker-compose -p alphapair up -d`
6. **健康檢查** - 確認所有服務正常運行

### 🎉 安裝完成

如果安裝成功，您將看到：

```
🎉 AlphaPair 安裝完成！
========================

🌟 所有服務運行正常！

📱 立即訪問 AlphaPair：
   🌐 前端界面: http://localhost:3000
```

💡 **注意**:第一次安裝完成後，只要確保開機時會自動執行 Docker Desktop 即可，系統會自動啟動所有服務，後續更新請參考 [更新和維護](#-更新和維護) 章節

## 📋 使用說明

### 🎯 第一次使用 AlphaPair

#### 1. 創建帳戶

1. 在瀏覽器中開啟 http://localhost:3000
   - 若電腦有固定 IP 可以開啟 http://{IP}:3000，這樣外出時也可以連線使用
2. 點擊「註冊」按鈕
3. 填寫用戶名、電子郵件和密碼
4. 點擊「註冊」完成帳戶創建
5. 使用新帳戶登入

#### 2. 設定幣安 API 密鑰 (必要步驟)

**⚠️ 重要：沒有 API 密鑰將無法進行交易**

**步驟 A: 在幣安創建 API 密鑰**

1. 登入您的 [幣安](https://www.binance.com/)
2. 點擊右上角的個人頭像 → 「帳戶」 → 「API 管理」
3. 點擊「創建新 API」
4. 選擇「系統生成」
5. 輸入 API 標籤名稱 (例如: "AlphaPair")
6. **重要：記錄下 API 金鑰（API Key） 和 私鑰（Secret Key）**
7. 在 API 設定中，點擊編輯權限後啟用「允許合約」權限，按儲存

**步驟 B: 在 AlphaPair 中設定 API 密鑰**

1. 登入 AlphaPair 後，點擊右上角的「設定」
2. 在選單選擇「API 設定」
3. 輸入您的幣安 API Key 和 Secret Key
4. 點擊「測試連接」，若成功，則點擊「保存設定」
5. 在主選單點擊「儀表板」，上方統計圖卡可以看到帳戶總資產和合約帳戶資產，代表設置成功

#### 3. 通知設置

1. 在主選單點擊「設定」
2. 在選單選擇「通知設定」
3. 輸入您的 Discord 頻道的 Webhook URL，點擊「測試 Discord 通知」
   - 如何取得 Webhook URL: 點擊 Discord 頻道旁的「齒輪」 → 「整合」 → 「建立 Webhook」→ 複製 Webhook 網址
4. 輸入您的 Telegram 頻道的 Bot Token 和 Chat ID，點擊「測試 Telegram 通知」
   - 如何取得 Bot Token: 在出現 Dones 那串找到 Use this token to access the HTTP API [教學](https://ithelp.ithome.com.tw/articles/10262881)
   - 如何取得 Chat ID [教學](http://blog.3dgowl.com/telegram-telegram%E4%BA%94-%E5%8F%96%E5%BE%97-chat-id/):
     - 建立一個聊天頻道，把剛剛建立的機器人邀進去,在聊天室打個訊息例如 hi
     - 開啟瀏覽器，輸入 https://api.telegram.org/bot{token}/getUpdates, 將 {token} 替換成剛剛取得的 Bot Token
     - 搜尋 "text": "hi"
     - 找到 "chat": { "id": 1234567890, ... }
     - 1234567890 就是 Chat ID
5. 點擊「保存設定」

#### 4. 開始您的第一個配對交易

1. 在主選單點擊「配對交易」
2. 點擊「創建配對交易」按鈕
3. 輸入多單標的 (例如: BTC，無需添加 USDT 後綴，系統會自動添加)
4. 輸入空單標的 (例如: ETH，無需添加 USDT 後綴，系統會自動添加)
5. 設定交易參數:
   - **最大虧損**: 輸入您 1R 的 USDT 金額，系統會自動計算多單和空單的數量
   - **槓桿倍數**: 輸入您要使用的槓桿倍數，例如 10 倍
   - **止損設定**: 輸入您要使用的止損百分比，例如 1，則當虧損達到 1% 時，系統會自動平倉
   - **止盈設定**: 輸入您要使用的止盈百分比，例如 3，則當獲利達到 3% 時，系統會自動平倉
6. 交易名稱會自動生成，您可以修改
7. 點擊「創建配對交易」開始執行策略

### 🔧 日常操作

#### 調整交易參數

1. 在「配對交易」頁面找到您的交易
2. 交易卡片右上角點擊「編輯」修改參數，可以調整止損、止盈、停利
3. 或交易卡片右下角點擊「平倉」來平倉交易

## 🔧 常用命令

### 📊 服務管理

```bash
# 查看服務狀態
docker-compose -p alphapair ps

# 啟動所有服務
docker-compose -p alphapair up -d

# 停止服務
docker-compose -p alphapair down

# 重啟服務
docker-compose -p alphapair restart

# 重啟特定服務
docker-compose -p alphapair restart api
docker-compose -p alphapair restart frontend
docker-compose -p alphapair restart mongodb
```

### 📝 服務日誌查看

```bash
# 查看所有服務日誌
docker-compose -p alphapair logs

# 即時查看日誌 (按 Ctrl+C 退出)
docker-compose -p alphapair logs -f

# 查看特定服務日誌
docker-compose -p alphapair logs api
docker-compose -p alphapair logs frontend
docker-compose -p alphapair logs mongodb
```

### 🔄 更新和維護

\*\*⚠️ 重要

1. - ⚠️ **注意**: 請先備份 .env 檔案，並在下載新程式碼後將 .env 檔案內容複製回來！
   - ⚠️ **注意**: 請先備份 .env 檔案，並在下載新程式碼後將 .env 檔案內容複製回來！
   - ⚠️ **注意**: 請先備份 .env 檔案，並在下載新程式碼後將 .env 檔案內容複製回來！
2. 若有發佈新的版本，請先備份 .env 檔案，並下載新的程式碼，並依序執行以下指令進行更新！

```bash
# 重新創建
docker-compose -p alphapair build
# 停止服務
docker-compose -p alphapair down
# 重新啟動
docker-compose -p alphapair up -d
```

## 🐛 故障排除

### ❓ 常見問題解決

#### 問題 1: 無法訪問 http://localhost:3000 或 http://{IP}:3000

**解決方法:**

1. **檢查 Docker 是否運行**

```bash
docker-compose -p alphapair ps
```

如果看到服務狀態不是 "Up"，請重新啟動：

```bash
docker-compose -p alphapair down
docker-compose -p alphapair up -d
```

2. **檢查端口是否被其他服務占用**

**Windows (PowerShell):**

```powershell
Get-NetTCPConnection -LocalPort 3000
Get-NetTCPConnection -LocalPort 8000
```

**macOS/Linux:**

```bash
lsof -i :3000
lsof -i :8000
```

#### 問題 2: 安裝腳本執行失敗

**解決方法:**

1. **確認 Docker 已啟動**

   - Windows: 檢查右下角中的 Docker 圖示，若沒有，請重新啟動 Docker Desktop
   - macOS: 確認 Docker Desktop 正在運行，若沒有，請重新啟動 Docker Desktop

2. **手動執行安裝步驟**

```bash
# 複製環境配置
cp .env.example .env

# 編輯 .env 檔案 (填入您的設定)
nano .env  # 或使用其他編輯器

# 啟動服務
docker-compose -p alphapair up -d
```

#### 問題 3: 服務啟動失敗

**解決方法:**

1. **查看詳細錯誤**

```bash
docker-compose -p alphapair logs
```

2. **重新構建映像**

```bash
docker-compose -p alphapair down
docker-compose -p alphapair up -d --build
```

3. **清理並重新開始**

```bash
docker-compose -p alphapair down -v
docker system prune -f
docker-compose -p alphapair up -d --build
```

### 🆘 獲取幫助

如果以上方法都無法解決問題：

1. **查看詳細日誌** [服務日誌查看](#-服務日誌查看)

2. **聯絡支援**
   - 在 [Discord]詢問
   - 🐛 GitHub Issues: [回報問題](https://github.com/morrisonmong/AlphaPair/issues)

**回報問題時請提供:**

- 錯誤訊息截圖
- 相關日誌內容

## 📁 專案結構

```
AlphaPair/
├── backend/                 # 後端 FastAPI 應用
│   ├── app/
│   │   ├── routers/        # API 路由
│   │   ├── services/       # 業務邏輯
│   │   ├── models/         # 數據模型
│   │   └── ...
│   └── Dockerfile
├── frontend/               # 前端 Next.js 應用
│   ├── src/
│   │   ├── app/           # 頁面路由 (App Router)
│   │   ├── components/    # UI 組件
│   │   └── lib/          # 工具庫
│   └── Dockerfile
├── mongodb/               # MongoDB 配置
├── docs/                 # 詳細文檔
├── docker-compose.yml    # Docker Compose 配置
└── README.md
├── .env.example          # 環境變數範例
├── .env                  # 環境變數 (自動生成)
├── setup.sh              # 一鍵安裝腳本 (支援 Windows/macOS/Linux)
```

## 🔒 安全注意事項

1. **保護 .env 檔案** - 包含敏感的資料庫密碼和密鑰
2. **API 密鑰安全** - 幣安 API 密鑰僅存儲在本地資料庫
