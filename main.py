import os
import time
import logging
import re
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import feedparser
import streamlink
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# Настройка профессионального логирования в консоль Railway
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("LibertyCore")

app = FastAPI(title="Liberty Formula Core Engine", version="4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === СИСТЕМА УМНОГО КЭШИРОВАНИЯ (ANTI-BAN) ===
class NewsCache:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self.data: List[Dict] = []
        self.last_updated: float = 0.0

    def is_expired(self) -> bool:
        return time.time() - self.last_updated > self.ttl

    def update(self, new_data: List[Dict]):
        self.data = new_data
        self.last_updated = time.time()

news_storage = NewsCache(ttl_seconds=300) # Кэш на 5 минут

# HTTP Заголовки реального браузера, чтобы нас не забанили
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3"
}

# === МОДУЛЬ PARSING ENGINE (BS4 + FEEDPARSER) ===

def clean_html(raw_html: str) -> str:
    """Очищает текст от остаточных HTML тегов, которые ломают верстку"""
    if not raw_html:
        return ""
    clean_re = re.compile('<.*?>')
    text = re.sub(clean_re, '', raw_html)
    return text.strip().replace("&nbsp;", " ").replace('"', "'")

def analyze_category(title: str, description: str) -> str:
    """Интеллектуальное распределение новостей по категориям для RedRace Hub"""
    full_text = f"{title} {description}".lower()
    
    # Ключевые слова для критических алертов
    alerts = ["crash", "penalty", "breaking", "штраф", "авария", "дисквалификация", "уволен", "breaking", "fire", "пожар", "red flag", "красный флаг"]
    # Ключевые слова для технического анализа/апдейтов
    tech = ["upgrade", "sidepod", "floor", "engine", "обновления", "днище", "аэродинамика", "телеметрия", "шасси", "крыло", "тесты", "анализ"]
    
    if any(word in full_text for word in alerts):
        return "alert"
    if any(word in full_text for word in tech):
        return "tech"
    return "tech" # По умолчанию отдаем в общую аналитическую ленту

def fetch_rss_feed() -> List[Dict]:
    """Сборщик №1: Работает через RSS feedparser"""
    url = "https://www.motorsport.com/rss/f1/news/"
    logger.info("Сбор данных через RSS...")
    feed = feedparser.parse(url)
    
    results = []
    for entry in feed.entries:
        title = entry.get("title", "")
        desc = clean_html(entry.get("summary", ""))
        
        # Парсим время
        published = entry.get("published_parsed")
        time_str = time.strftime("%H:%M", published) if published else "NEW"

        results.append({
            "title": title,
            "description": desc[:140] + "..." if len(desc) > 140 else desc,
            "link": entry.get("link", "#"),
            "category": analyze_category(title, desc),
            "time": time_str,
            "source": "Motorsport RSS"
        })
    return results

def fetch_html_backup() -> List[Dict]:
    """Сборщик №2: BeautifulSoup Парсинг (Резервный на случай сбоя RSS)"""
    url = "https://www.autosport.com/f1/news/"
    logger.info("Резервный сбор данных: BeautifulSoup парсинг HTML...")
    results = []
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            logger.error(f"Autosport ответил кодом: {response.status_code}")
            return []
            
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Находим блоки новостей на Autosport (селекторы могут меняться, это классический пример)
        articles = soup.find_all("div", class_="ms-item") or soup.find_all("article")
        
        for article in articles[:12]:
            title_tag = article.find("a", class_="ms-item__title") or article.find("h2") or article.find("h3")
            desc_tag = article.find("div", class_="ms-item__summary") or article.find("p")
            
            if not title_tag:
                continue
                
            title = title_tag.text.strip()
            link = title_tag.get("href", "")
            if link and not link.startswith("http"):
                link = "https://www.autosport.com" + link
                
            desc = desc_tag.text.strip() if desc_tag else "Подробности внутри публикации сессии."
            
            results.append({
                "title": title,
                "description": desc[:140] + "..." if len(desc) > 140 else desc,
                "link": link,
                "category": analyze_category(title, desc),
                "time": "LIVE",
                "source": "Autosport HTML"
            })
    except Exception as e:
        logger.error(f"Критическая ошибка BeautifulSoup парсера: {e}")
        
    return results

# === ENDPOINTS ===

@app.get("/api/feed.json")
def get_news_feed():
    """Точка доступа к единой кэшируемой ленте новостей Pit Wall"""
    if not news_storage.is_expired() and news_storage.data:
        logger.info("Отдаем новостной фид из локального кэша бэкенда")
        return {"items": news_storage.data, "cached": True}

    logger.info("Кэш устарел или пуст. Запуск агрегации потоков новостей...")
    
    # Пытаемся взять основной RSS поток
    aggregated_news = []
    try:
        aggregated_news = fetch_rss_feed()
    except Exception as e:
        logger.error(f"Основной RSS поток упал: {e}. Переключаюсь на BeautifulSoup...")
        
    # Если RSS пуст или выдал ошибку, активируем BeautifulSoup парсер
    if not aggregated_news:
        aggregated_news = fetch_html_backup()
        
    # Если вообще всё упало (нет интернета), отдаем старые данные из кэша, чтобы сайт не умер
    if not aggregated_news and news_storage.data:
        logger.warning("Все внешние ресурсы недоступны! Экстренно отдаем старый кэш.")
        return {"items": news_storage.data, "status": "emergency_backup"}
        
    # Защитная заглушка, если бэкенд запущен впервые и сети вообще нет
    if not aggregated_news:
        aggregated_news = [{
            "title": "Liberty Core Engine Online",
            "description": "Системы телеметрии и парсинга запущены, но внешние шлюзы прессы F1 временно не отдают данные. Проверьте прокси.",
            "link": "#",
            "category": "alert",
            "time": "NOW",
            "source": "Core"
        }]

    # Обновляем глобальный кэш
    news_storage.update(aggregated_news)
    return {"items": aggregated_news, "cached": false}


@app.get("/api/stream.json")
def get_stream_link(quality: str = Query("720p", regex="^(1080p|720p|480p|best|worst)$")):
    """
    Интеллектуальный прокси-движок Streamlink для бельгийского RTBF Auvio
    """
    # Сюда вставляется ссылка на трансляцию или на сам бельгийский медиаплеер
    rtbf_live_url = "https://www.rtbf.be/auvio/direct/detail_formule-1_..." 
    
    logger.info(f"Запрос на дешифровку потока RTBF. Профиль качества: {quality}")
    
    try:
        # Настройка кастомных опций Streamlink для обхода базовых проверок
        session = streamlink.Streamlink()
        session.set_option("http-headers", f"User-Agent={HEADERS['User-Agent']}")
        
        # Вытаскиваем манифесты потоков (.m3u8)
        streams = session.streams(rtbf_live_url)
        
        if streams:
            # Определяем лучшее доступное качество на основе запроса с фронтенда
            selected_quality = quality
            if quality not in streams:
                logger.warning(f"Качество {quality} недоступно для этого стрима. Ротация на 'best'")
                selected_quality = "best"
                
            stream_url = streams[selected_quality].url
            return {
                "status": "active",
                "quality": selected_quality,
                "m3u8": stream_url,
                "engine": "Streamlink Core v4"
            }
            
        else:
            logger.warning("Streamlink не нашел активных HLS трансляций по этому URL. Возможно, гонка еще не началась.")
            return {
                "status": "test",
                "m3u8": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
                "info": "RTBF Stream Offline. Отдан тестовый HLS фид."
            }
            
    except Exception as str_error:
        logger.error(f"Сбой ядра Streamlink (Возможен Гео-блок / Изменение структуры сайта): {str_error}")
        # Отдаем красивый тестовый стрим (Mux Video Test), чтобы плеер на фронтенде работал, а не вис черным экраном
        return {
            "status": "error",
            "error_log": str(str_error),
            "m3u8": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            "info": "Ошибка проксирования. Активирован резервный симулятор."
        }

if __name__ == "__main__":
    # Читаем порт из переменных окружения Railway
    server_port = int(os.environ.get("PORT", 8000))
    logger.info(f"Запуск Liberty Core на порту {server_port}...")
    
    # Подавление дублирующих логов uvicorn для чистоты трейсинга на Railway
    uvicorn_log_config = uvicorn.config.LOGGING_CONFIG
    uvicorn_log_config["loggers"]["uvicorn"]["propagate"] = False
    
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=server_port, 
        log_config=uvicorn_log_config,
        workers=1 # Для кэширования в памяти достаточно одного воркера, чтобы кэш не дробился
    )
