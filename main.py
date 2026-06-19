import os
import time
import logging
import re
import random
import requests
import feedparser
import streamlink
import uvicorn
from typing import List, Dict, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Liberty Formula Ultimate Engine")

# Жесткий CORS, чтобы никто не угнал твой бэкенд на Railway
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://p49dev.github.io", "http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

# --- СИСТЕМА ДИНАМИЧЕСКИХ ЛОГОВ ДЛЯ KIMI ---
class LogBufferHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.buffer = []

    def emit(self, record):
        log_entry = self.format(record)
        self.buffer.append(log_entry)
        if len(self.buffer) > 100:  # Ротация: храним только 100 последних строк
            self.buffer.pop(0)

logger = logging.getLogger("LibertyCore")
logger.setLevel(logging.INFO)
log_handler = LogBufferHandler()
log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(log_handler)

# --- АВТОРЫЗАЦИЯ АДМИНИСТРАТОРА ---
ADMIN_USER = "Kimi"
ADMIN_PASS = "bwoah2026"

def authenticate_admin(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials.username != ADMIN_USER or credentials.password != ADMIN_PASS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль администратора Kimi",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

# --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ (STATE) ---
STATE = {
    "current_gp": "Spanish GP",
    "status_next": "LIVE NOW",
    "manual_stream_url": "",
    "active_audio_feed": "P4/9 LIVE",
    "audio_delay": 0.0,
    "race_control_notices": [
        {"time": "12:00:00", "text": "REDRACE ENGINE ONLINE // NO OVERRIDES", "type": "green"}
    ]
}

class CommentatorUpdate(BaseModel):
    active_audio_feed: str
    audio_delay: float
    new_notice_text: Optional[str] = None
    new_notice_type: Optional[str] = "white"

class AdminUpdate(BaseModel):
    current_gp: str
    status_next: str
    manual_stream_url: str

# --- АВТОМАТИЧЕСКИЙ РОТАТОР БЕСПЛАТНЫХ ПРОКСИ ---
class ProxyManager:
    def __init__(self):
        self.proxies = []
        self.last_fetched = 0
        self.ttl = 1200  # Смена баз раз в 20 минут

    def fetch_free_proxies(self) -> List[str]:
        logger.info("Сканирование публичных баз на наличие бесплатных прокси...")
        found = []
        sources = [
            "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all",
            "https://www.proxy-list.download/api/v1/get?type=http"
        ]
        for url in sources:
            try:
                res = requests.get(url, timeout=5)
                if res.status_code == 200:
                    found.extend(res.text.strip().split("\n"))
            except Exception:
                continue
        return [p.strip() for p in found if ":" in p]

    def get_proxy(self) -> Optional[str]:
        if time.time() - self.last_fetched > self.ttl or not self.proxies:
            raw = self.fetch_free_proxies()
            if raw:
                self.proxies = raw
                self.last_fetched = time.time()
        return random.choice(self.proxies) if self.proxies else None

proxy_rotator = ProxyManager()

# --- СИСТЕМА КЭШИРОВАНИЯ ДАННЫХ ---
class DataCache:
    def __init__(self):
        self.news = []
        self.highlights = []
        self.last_news_update = 0
        self.last_hl_update = 0

cache = DataCache()

# --- ОТКРЫТЫЕ ЭНДПОИНТЫ API (БЕЗ ПАРОЛЯ) ---

@app.get("/api/state.json")
def get_state():
    return STATE

@app.get("/api/feed.json")
def get_news():
    if time.time() - cache.last_news_update < 300 and cache.news:
        return {"items": cache.news}
    
    items = []
    try:
        feed = feedparser.parse("https://www.f1news.ru/export/news.xml")
        for entry in feed.entries[:12]:
            clean_desc = re.sub('<.*?>', '', entry.summary).strip()
            t = entry.title.lower()
            cat = "alert" if any(w in t for w in ["штраф", "авария", "красный", "breaking"]) else "tech"
            items.append({
                "title": entry.title,
                "description": clean_desc[:120] + "...",
                "link": entry.link,
                "category": cat,
                "time": "LIVE",
                "source": "F1News"
            })
        cache.news = items
        cache.last_news_update = time.time()
    except Exception as e:
        logger.error(f"Ошибка парсинга RSS: {e}")
    return {"items": cache.news}

@app.get("/api/highlights.json")
def get_highlights():
    if time.time() - cache.last_hl_update < 3600 and cache.highlights:
        return {"highlights": cache.highlights}
    
    # Хайлайты прошлого ГП (Streamlink кушает ссылки YouTube на ура)
    default_hl = [
        {"title": "Гран-При Канады 2026 — Лучшие Моменты Гонки", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "10:14"},
        {"title": "Квалификация в Монреале — Финальный Сегмент", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "07:45"}
    ]
    cache.highlights = default_hl
    cache.last_hl_update = time.time()
    return {"highlights": cache.highlights}

@app.get("/api/stream.json")
def get_stream(quality: str = "720p"):
    if STATE["manual_stream_url"]:
        logger.info("Активирован ручной оверрайд стрима из панели Kimi.")
        return {"status": "active", "m3u8": STATE["manual_stream_url"], "provider": "Админ-Поток"}

    providers = [
        {"name": "RTBF Бельгия", "url": "https://www.rtbf.be/auvio/direct/detail_formule-1"},
        {"name": "ORF Австрия", "url": "https://tvthek.orf.at/live"}
    ]
    
    session = streamlink.Streamlink()
    session.set_option("http-headers", "User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    
    for attempt in range(3):
        proxy = proxy_rotator.get_proxy()
        if proxy:
            session.set_option("http-proxy", f"http://{proxy}")
            session.set_option("https-proxy", f"http://{proxy}")
            logger.info(f"Обход геоблока через бесплатный прокси: {proxy}")
        
        for p in providers:
            try:
                streams = session.streams(p["url"])
                if streams:
                    return {"status": "active", "m3u8": streams.get(quality, streams.get("best")).url, "provider": p["name"]}
            except Exception:
                continue
                
    return {
        "status": "error",
        "m3u8": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "info": "РЕЗЕРВНЫЙ СИМУЛЯТОР (ВСЕ БАЗЫ СДХОНУЛИ)"
    }

# ПУЛЬТ КОММЕНТАТОРА — БЕЗ ПАРОЛЯ
@app.post("/api/commentator/update")
def commentator_update(data: CommentatorUpdate):
    STATE["active_audio_feed"] = data.active_audio_feed
    STATE["audio_delay"] = data.audio_delay
    
    if data.new_notice_text:
        t = time.strftime("%H:%M:%S", time.localtime())
        STATE["race_control_notices"].insert(0, {
            "time": t,
            "text": data.new_notice_text.upper(),
            "type": data.new_notice_type
        })
        if len(STATE["race_control_notices"]) > 8:
            STATE["race_control_notices"].pop()
            
    logger.info(f"Смена параметров эфира: Аудио={data.active_audio_feed}, Задержка={data.audio_delay}s")
    return {"status": "success", "state": STATE}

# --- ЗАКРЫТЫЕ УПРАВЛЯЮЩИЕ МЕТОДЫ (ТРЕБУЮТ ПАРОЛЬ KIMI) ---

@app.post("/api/admin/update")
def admin_update(data: AdminUpdate, username: str = Depends(authenticate_admin)):
    STATE["current_gp"] = data.current_gp
    STATE["status_next"] = data.status_next
    STATE["manual_stream_url"] = data.manual_stream_url
    logger.info(f"АДМИНИСТРАТОР {username} принудительно переписал параметры ядра.")
    return {"status": "success", "state": STATE}

@app.get("/api/admin/logs")
def get_server_logs(username: str = Depends(authenticate_admin)):
    return {"logs": log_handler.buffer}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
