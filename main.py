import os
import subprocess
import tempfile
import streamlink
import yt_dlp
import feedparser
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from free_python_vpn.free_python_vpn import connect_vpn_global, disconnect_vpn_global
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
    "servustv": "https://www.servustv.com/live",
    "rtbf": "https://www.rtbf.be/auvio/...",
    "srf": "https://www.srf.ch/play/tv/live",
    "custom": None
}

current_source = "servustv"
manual_stream_url = None

state_cache = {
    "current_gp": "Bahrain GP",
    "race_control_notices": [],
    "last_update": None
}

# ========== VPN ==========
VPN_FOLDER = "vpn/"
TEMP_CONF = "temp.conf"
TEMP_CONF_NAME = "temp"

def connect_vpn():
    """Подключает VPN через Швейцарию"""
    try:
        connect_vpn_global(
            websites=[],
            index_file=None,
            vpn_folder=VPN_FOLDER,
            temp_file=TEMP_CONF,
            temp_file_name=TEMP_CONF_NAME
        )
        print("VPN подключён (Швейцария)")
        return True
    except Exception as e:
        print(f"Ошибка подключения VPN: {e}")
        return False

def disconnect_vpn():
    """Отключает VPN"""
    try:
        disconnect_vpn_global(
            index_file=None,
            temp_file=TEMP_CONF,
            temp_file_name=TEMP_CONF_NAME
        )
        print("VPN отключён")
    except Exception as e:
        print(f"Ошибка отключения VPN: {e}")

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

# ========== YT-DLP (ЗАПАСНОЙ) ==========
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
    global manual_stream_url, current_source

    if manual_stream_url:
        return {"m3u8": manual_stream_url, "provider": "Ручной ввод", "status": "ok"}

    vpn_connected = False
    try:
        # Подключаем VPN
        vpn_connected = connect_vpn()
        if not vpn_connected:
            return {"status": "error", "info": "Не удалось подключить VPN"}

        url = SOURCES.get(current_source)
        if not url:
            return {"status": "error", "info": "Источник не выбран"}

        # Пробуем Streamlink
        stream_url = fetch_via_streamlink(url)
        if stream_url:
            return {"m3u8": stream_url, "provider": current_source.upper(), "status": "ok"}

        # Пробуем yt-dlp
        stream_url = fetch_via_ytdlp(url)
        if stream_url:
            return {"m3u8": stream_url, "provider": f"{current_source.upper()} (yt-dlp)", "status": "ok"}

        return {"status": "error", "info": "Не удалось найти поток"}
    finally:
        if vpn_connected:
            disconnect_vpn()

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
    global current_source
    if data.get("source") in SOURCES:
        current_source = data["source"]
    return {"status": "ok", "source": current_source}

@app.post("/api/admin/update")
async def admin_update(data: dict):
    global manual_stream_url, current_source
    if data.get("manual_stream_url"):
        manual_stream_url = data["manual_stream_url"]
        return {"status": "ok"}
    if data.get("source"):
        current_source = data["source"]
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
