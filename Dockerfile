FROM python:3.11-slim

WORKDIR /app

# Копируем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем ВСЁ приложение
COPY . .

# Проверяем, что main.py существует
RUN ls -la

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
