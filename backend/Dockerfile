FROM python:3.10-slim

WORKDIR /app

# 安裝依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製代碼
COPY . .

# 確保靜態文件目錄存在
RUN mkdir -p /app/static/templates

# 設置環境變數
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV IS_DOCKER=true
ENV ENVIRONMENT=production

# 開放端口
EXPOSE 8000

# 啟動命令（由docker-compose中設定）
CMD ["python", "run.py"]

