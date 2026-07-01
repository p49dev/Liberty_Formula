import feedparser
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Liberty Formula API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── STATE ─────────────────────────────────────────────
stream  = {"url": None, "provider": None, "active": False}
banner  = {"text": None}
cards   = {"podium": True, "timing": True, "news": True, "fia": True}

# ─── STREAM ────────────────────────────────────────────
@app.get("/api/stream.json")
async def get_stream():
    if not stream["url"]:
        return {"status": "offline"}
    return {"status": "ok", "m3u8": stream["url"], "provider": stream["provider"]}

@app.post("/api/admin/stream")
async def set_stream(data: dict):
    url = data.get("url", "").strip()
    stream["url"]      = url or None
    stream["provider"] = data.get("provider", "IPTV").strip() if url else None
    stream["active"]   = bool(url)
    return {"status": "ok"}

# ─── BANNER ────────────────────────────────────────────
@app.post("/api/admin/banner")
async def set_banner(data: dict):
    banner["text"] = data.get("text", "").strip() or None
    return {"status": "ok"}

# ─── CARDS ─────────────────────────────────────────────
@app.post("/api/admin/cards")
async def set_cards(data: dict):
    for key in ["podium", "timing", "news", "fia"]:
        if key in data:
            cards[key] = bool(data[key])
    return {"status": "ok"}

# ─── STATE ─────────────────────────────────────────────
@app.get("/api/state.json")
async def get_state():
    return {"stream": stream, "banner": banner, "cards": cards}

# ─── RSS ───────────────────────────────────────────────
@app.get("/api/feed.json")
async def get_feed():
    try:
        feed = feedparser.parse("https://www.f1news.ru/export/news.xml")
        items = [{
            "time":     datetime.now().strftime("%H:%M"),
            "text":     e.title,
            "category": "analysis",
            "alert":    any(w in e.title.lower() for w in ["срочно", "экстренно"]),
            "link":     getattr(e, "link", ""),
        } for e in feed.entries[:12]]
        return JSONResponse(content=items)
    except Exception:
        return JSONResponse(content=[])

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
