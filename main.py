import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
import httpx
import streamlink

# Логирование для мониторинга в панели Render
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LibertyFormulaCore")

# Глобальный кэш данных
DATA_CACHE = {
    "stream_url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",  # Тестовый поток по умолчанию
    "hub_feed": [
        {"time": "LIVE", "alert": False, "text": "СИСТЕМА: Ядро Liberty Formula запущено. Ожидание начала сессии."}
    ]
}

async def update_rtbf_stream():
    """Фоновая задача: извлечение прямой m3u8 ссылки из RTBF через Streamlink API"""
    # Ссылку можно вынести в переменные окружения, чтобы не пересобирать контейнер
    rtbf_url = os.environ.get("RTBF_URL", "https://www.rtbf.be/auvio/direct-formule-1")
    
    while True:
        try:
            logger.info("Streamlink проверяет доступность потока RTBF...")
            session = streamlink.Streamlink()
            
            # Если потребуется обойти гео-блок Render (например, если сервер в США),
            # здесь можно прокинуть бельгийский прокси через переменные окружения:
            # proxy = os.environ.get("PROXY_URL")
            # if proxy: session.set_option("http-proxy", proxy)

            streams = session.streams(rtbf_url)
            if "best" in streams:
                raw_m3u8 = streams["best"].url
                DATA_CACHE["stream_url"] = raw_m3u8
                logger.info(f"Поток RTBF успешно перехвачен: {raw_m3u8[:50]}...")
            else:
                logger.warning("Прямой эфир RTBF сейчас оффлайн. Используется резервный поток.")
        except Exception as e:
            logger.error(f"Ошибка парсинга Streamlink: {e}")
        
        # Обновляем токен потока каждые 5 минут
        await asyncio.sleep(300)

async def parse_fia_documents():
    """Фоновая задача: парсинг официальных документов стюардов FIA"""
    fia_url = "https://www.fia.com/documents/championships/fia-formula-one-world-championship-14"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    while True:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(fia_url, headers=headers, timeout=10.0)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    doc_elements = soup.find_all('li', class_='document-row', limit=6)
                    
                    if doc_elements:
                        new_feed = []
                        for doc in doc_elements:
                            title_el = doc.find('span', class_='title')
                            link_el = doc.find('a')
                            date_el = doc.find('span', class_='date')
                            
                            if title_el and link_el:
                                title = title_el.text.strip().upper()
                                link = "https://www.fia.com" + link_el['href']
                                time_str = date_el.text.strip().split(" ")[-1][:5] if date_el else "LIVE"
                                
                                # Определяем критичность события (подсветит строку красным на сайте)
                                is_alert = any(word in title for word in ["PENALTY", "INCIDENT", "PROTEST", "REPRIMAND", "SUMMONS", "DELETED"])
                                
                                new_feed.append({
                                    "time": time_str,
                                    "alert": is_alert,
                                    "text": f"<b>FIA DOC:</b> <a href='{link}' target='_blank'>{title}</a>"
                                })
                        
                        if new_feed:
                            DATA_CACHE["hub_feed"] = new_feed
        except Exception as e:
            logger.error(f"Ошибка при обращении к серверу FIA: {e}")
            
        # Пауза между проверками — 20 секунд (оптимально для live-режима)
        await asyncio.sleep(20)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск фоновых процессов при старте контейнера
    stream_task = asyncio.create_task(update_rtbf_stream())
    fia_task = asyncio.create_task(parse_fia_documents())
    yield
    # Корректное завершение при остановке контейнера
    stream_task.cancel()
    fia_task.cancel()

app = FastAPI(title="Liberty Formula // Operational Core", lifespan=lifespan)

# Настройка CORS: разрешаем твоему GitHub Pages забирать данные без ограничений
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stream.json")
async def get_stream():
    return {"m3u8": DATA_CACHE["stream_url"]}

@app.get("/api/feed.json")
async def get_feed():
    return DATA_CACHE["hub_feed"]

if __name__ == "__main__":
    import uvicorn
    # Читаем порт, который Render выдает динамически
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
