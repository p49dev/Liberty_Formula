import feedparser
import httpx
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

app = FastAPI(title="Liberty Formula API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── STATE ─────────────────────────────────────────────
stream = {"url": None, "provider": None, "active": False, "engine": "auto"}
banner = {"text": None}
cards  = {"podium": True, "timing": True, "news": True, "fia": True}

# ─── PROXY ─────────────────────────────────────────────
@app.get("/api/proxy")
async def proxy(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Referer": url,
        "Origin":  "https://www.google.com",
    }
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            return StreamingResponse(
                resp.aiter_bytes(),
                media_type=resp.headers.get("content-type", "application/vnd.apple.mpegurl"),
                headers={"Access-Control-Allow-Origin": "*"},
            )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)

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
    stream["engine"]   = data.get("engine", "auto") if url else "auto"
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
