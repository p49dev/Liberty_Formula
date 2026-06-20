"""
server.py — Liberty Formula backend by P4/9
Railway-хостинг. Отдаёт /api/stream.json и /api/feed.json для фронтенда.

ВАЖНО: только источники без DRM (RTBF, ARD, 10Play).
Apple TV/F1TV защищены FairPlay DRM — Streamlink их принципиально не вскрывает,
и мы это не обходим (незаконно + сразу новый бан площадки).
"""

import os
import time
import logging
import feedparser
import streamlink
from flask import Flask, jsonify
from flask_cors import CORS
from threading import Lock

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("liberty-backend")

app = Flask(__name__)
CORS(app)  # фронтенд на GitHub Pages — другой домен, нужен CORS

# ────────────────────────────────────────────────────────
# User-Agent — некоторые сайты блокируют запросы без него
# Это НЕ обход геоблока, это просто "представиться браузером"
# ────────────────────────────────────────────────────────
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ────────────────────────────────────────────────────────
# Источники без DRM — легально доступны без подписки
# ────────────────────────────────────────────────────────
FREE_SOURCES = {
    "nos": {
        "name": "NOS (Нидерланды)",
        "url": "https://nos.nl/livestream/1",
    },
    "rtbf": {
        "name": "RTBF (Бельгия)",
        "url": "https://www.rtbf.be/auvio/direct",
    },
    "ard": {
        "name": "ARD Mediathek (Германия)",
        "url": "https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmU",
    },
    "ten": {
        "name": "10Play (Австралия)",
        "url": "https://10play.com.au/live",
    },
}

# ────────────────────────────────────────────────────────
# Кэш — не дёргаем Streamlink на каждый запрос фронтенда,
# результат живёт 60 секунд
# ────────────────────────────────────────────────────────
_cache = {"data": None, "ts": 0, "source": None}
_cache_lock = Lock()
CACHE_TTL = 60


def resolve_stream(source_key: str):
    """Возвращает прямую ссылку на m3u8 через Streamlink, либо None."""
    source = FREE_SOURCES.get(source_key)
    if not source:
        return None, "Неизвестный источник"

    try:
        session = streamlink.Streamlink()
        session.set_option("http-headers", {"User-Agent": USER_AGENT})

        streams = session.streams(source["url"])
        if not streams:
            return None, f"{source['name']}: эфир сейчас не идёт"

        best = streams.get("best")
        if not best:
            key = list(streams.keys())[0]
            best = streams[key]

        return best.url, None

    except streamlink.exceptions.NoPluginError:
        return None, f"{source['name']}: нет плагина Streamlink для этого сайта"
    except streamlink.exceptions.PluginError as e:
        return None, f"{source['name']}: ошибка плагина — {e}"
    except Exception as e:
        logger.error(f"resolve_stream({source_key}): {e}")
        return None, f"{source['name']}: {str(e)[:120]}"


@app.route("/")
def root():
    return jsonify({
        "status": "ok",
        "service": "Liberty Formula backend",
        "author": "P4/9",
        "endpoints": ["/api/stream.json", "/api/feed.json", "/health"],
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok", "ts": int(time.time())})


@app.route("/api/stream.json")
def api_stream():
    with _cache_lock:
        # Кэш ещё свежий — отдаём его
        if _cache["data"] and (time.time() - _cache["ts"] < CACHE_TTL):
            return jsonify(_cache["data"])

        # Пробуем источники по очереди, берём первый рабочий
        last_error = None
        for key in FREE_SOURCES:
            url, error = resolve_stream(key)
            if url:
                result = {
                    "status": "ok",
                    "m3u8": url,
                    "source": FREE_SOURCES[key]["name"],
                    "source_key": key,
                }
                _cache["data"] = result
                _cache["ts"] = time.time()
                _cache["source"] = key
                return jsonify(result)
            last_error = error

        # Ничего не нашли — честно говорим почему, без фейкового потока
        result = {
            "status": "error",
            "m3u8": None,
            "info": last_error or "Все источники недоступны сейчас",
        }
        _cache["data"] = result
        _cache["ts"] = time.time()
        return jsonify(result)


@app.route("/api/feed.json")
def api_feed():
    """RSS на русском — собираем заголовки из открытых F1-источников."""
    sources = [
        "https://www.f1news.ru/export/news.xml",
    ]
    items = []

    for src in sources:
        try:
            feed = feedparser.parse(src)
            for entry in feed.entries[:10]:
                published = entry.get("published_parsed")
                time_str = time.strftime("%H:%M", published) if published else "—"
                items.append({
                    "time": time_str,
                    "text": entry.get("title", "").strip(),
                    "alert": False,
                    "category": "analysis",
                })
        except Exception as e:
            logger.error(f"RSS {src}: {e}")

    items.sort(key=lambda x: x["time"], reverse=True)
    return jsonify(items[:15])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
