import os
import time
import streamlink
import yt_dlp
import feedparser
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Liberty Formula Backend")

# ========== CORS ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== КОНФИГ ==========
SOURCES = {
    "wearechecking": "https://wearechecking.live/streams-pages/motorsports",
    "vk_openwheels": "https://vkvideo.ru/@openwheelsgroup",
    "sportsurge": "https://www.sportsurge.stream/",
    "servustv": "https://www.servustv.com/live",
    "rtbf": "https://www.rtbf.be/auvio/",
    "custom": None
}

current_source = "wearechecking"
manual_stream_url = None

# FIX: кэш потока — не гоняем streamlink каждый запрос
stream_cache = {
    "url": None,
    "provider": None,
    "ts": 0,
    "ttl": 45  # секунд — живой поток обновляем каждые 45с
}

state_cache = {
    "current_gp": "Bahrain GP",
    "race_control_notices": [],
    "last_update": None
}

# ========== STREAMLINK ==========
def get_streamlink_session():
    session = streamlink.Streamlink()
    session.set_option("http-header", {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    })
    return session

def fetch_via_streamlink(url):
    try:
        session = get_streamlink_session()
        streams = session.streams(url)
        if streams and "best" in streams:
            return streams["best"].url
        return None
    except Exception as e:
        print(f"Streamlink error: {e}")
        return None

def fetch_via_ytdlp(url):
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'best',
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info['url']
    except Exception as e:
        print(f"yt-dlp error: {e}")
        return None

# ========== ЭНДПОИНТЫ ==========
@app.get("/api/stream.json")
async def get_stream():
    global manual_stream_url, current_source, stream_cache

    # Ручной URL — отдаём сразу без кэша
    if manual_stream_url:
        return {"m3u8": manual_stream_url, "provider": "Ручной ввод", "status": "ok"}

    url = SOURCES.get(current_source)
    if not url:
        return {"status": "error", "info": "Источник не выбран"}

    # FIX: кэш — не долбим streamlink каждые 30 сек с фронта
    now = time.time()
    if (stream_cache["url"] and
        stream_cache["ts"] and
        now - stream_cache["ts"] < stream_cache["ttl"]):
        return {
            "m3u8": stream_cache["url"],
            "provider": stream_cache["provider"],
            "status": "ok",
            "cached": True
        }

    # Пробуем Streamlink
    stream_url = fetch_via_streamlink(url)
    if stream_url:
        stream_cache["url"] = stream_url
        stream_cache["provider"] = current_source.upper()
        stream_cache["ts"] = now
        return {"m3u8": stream_url, "provider": current_source.upper(), "status": "ok"}

    # Пробуем yt-dlp
    stream_url = fetch_via_ytdlp(url)
    if stream_url:
        stream_cache["url"] = stream_url
        stream_cache["provider"] = f"{current_source.upper()} (yt-dlp)"
        stream_cache["ts"] = now
        return {"m3u8": stream_url, "provider": f"{current_source.upper()} (yt-dlp)", "status": "ok"}

    return {"status": "error", "info": "Не удалось найти поток"}

@app.get("/api/state.json")
async def get_state():
    return state_cache

@app.get("/api/feed.json")
async def get_feed():
    try:
        feed = feedparser.parse("https://www.f1news.ru/export/news.xml")
        items = []
        for entry in feed.entries[:12]:
            items.append({
                "time": datetime.now().strftime("%H:%M"),
                "text": entry.title,
                "category": "analysis",
                "alert": "срочно" in entry.title.lower() or "экстренно" in entry.title.lower(),
                "link": entry.link
            })
        return JSONResponse(content=items)
    except Exception:
        return JSONResponse(content=[{"time": "--", "text": "Новости временно недоступны", "category": "all"}])

@app.get("/api/highlights.json")
async def get_highlights():
    return {
        "highlights": [
            {"title": "Bahrain GP Highlights", "duration": "15:22", "url": "https://example.com/highlight1.m3u8"},
            {"title": "Jeddah GP Highlights", "duration": "12:45", "url": "https://example.com/highlight2.m3u8"},
        ]
    }

@app.post("/api/commentator/update")
async def commentator_update(data: dict):
    global current_source, stream_cache
    if data.get("source") in SOURCES:
        current_source = data["source"]
        # FIX: сброс кэша при смене источника
        stream_cache["url"] = None
        stream_cache["ts"] = 0
    return {"status": "ok", "source": current_source}

@app.post("/api/admin/update")
async def admin_update(data: dict):
    global manual_stream_url, current_source, stream_cache
    if "manual_stream_url" in data:
        # FIX: пустая строка сбрасывает ручной URL
        manual_stream_url = data["manual_stream_url"].strip() or None
        stream_cache["url"] = None
        stream_cache["ts"] = 0
        return {"status": "ok"}
    if data.get("source"):
        current_source = data["source"]
        stream_cache["url"] = None
        stream_cache["ts"] = 0
    return {"status": "ok"}

@app.get("/api/admin/logs")
async def admin_logs():
    return {"logs": ["[System] Liberty Formula active"]}

@app.get("/health")
async def health():
    return {"status": "ok"}

# ========== ЗАПУСК ==========
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
