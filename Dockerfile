# Изолированный легковесный базовый образ
FROM python:3.11-slim

# Настройка среды, чтобы Питон не буферизировал логи (они будут сразу видны в Render)
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Сначала копируем только зависимости (кэширование слоев Docker для быстрой пересборки)
COPY requirements.txt .

# Обновляем pip и ставим пакеты
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Копируем исходный код приложения
COPY main.py .

# Уведомляем систему о порте (Render переопределит его через переменную $PORT)
EXPOSE 8000

# Запуск uvicorn с динамической привязкой к порту Render. 
# Если переменная $PORT пустая, по умолчанию подставится 8000.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
