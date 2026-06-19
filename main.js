/**
 * LIBERTY FORMULA — CORE FRONTEND CONSOLE
 * URL Бэкенда: https://libertyformula-production-4740.up.railway.app
 * Порт 8080 проксируется автоматически через HTTPS
 */

const API_BASE = "https://libertyformula-production-4740.up.railway.app";
let adminCredentialsBase64 = "";

/**
 * Переключение режимов интерфейса (Spectator vs Pro Pitwall)
 */
function setMode(mode) {
    const workspace = document.getElementById('workspace-container');
    const btnSpectator = document.getElementById('btn-spectator');
    const btnPro = document.getElementById('btn-pro');

    if (!workspace || !btnSpectator || !btnPro) return;

    if (mode === 'pro') {
        workspace.classList.add('mode-pro-active');
        btnPro.classList.add('active');
        btnSpectator.classList.remove('active');
        console.log("Режим: Pro Pitwall активирован");
    } else {
        workspace.classList.remove('mode-pro-active');
        btnSpectator.classList.add('active');
        btnPro.classList.remove('active');
        console.log("Режим: Spectator активирован");
    }
}

/**
 * Переключение видимости боковой панели управления
 */
function togglePitwallControl() {
    const sidebar = document.getElementById('pitwall-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

/**
 * Загрузка текущего состояния гонки и вывод плашек Race Control Notices
 */
async function loadCurrentState() {
    try {
        const res = await fetch(`${API_BASE}/api/state.json`);
        if (!res.ok) throw new Error("Ошибка чтения состояния ядра");
        const state = await res.json();
        
        // Обновление плашки активного Гран-при в шапке
        const gpDisplay = document.getElementById('current-gp-display');
        if (gpDisplay) {
            gpDisplay.innerText = state.current_gp.toUpperCase();
        }
        
        // Рендеринг оперативных плашек Race Control
        const noticesContainer = document.getElementById('notices-marquee-container');
        if (noticesContainer) {
            if (state.race_control_notices && state.race_control_notices.length > 0) {
                noticesContainer.innerHTML = state.race_control_notices.map(n => `
                    <div class="notice-item type-${n.type}">
                        <span class="n-time">[${n.time}]</span> ${n.text}
                    </div>
                `).join('');
            } else {
                noticesContainer.innerHTML = "<div style='color:#71717a; font-size:12px; padding:4px;'>RACE CONTROL: NO LIVE NOTICES</div>";
            }
        }
    } catch (e) {
        console.error("Не удалось синхронизировать состояние с Railway:", e);
    }
}

/**
 * Инициализация основного видеопотока (.m3u8 HLS) через прокси-ротатор бэкенда
 */
async function initStream() {
    const video = document.getElementById('f1-player');
    const providerDisplay = document.getElementById('provider-name');
    
    if (!providerDisplay) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/stream.json`);
        if (!res.ok) throw new Error("Поток недоступен");
        const data = await res.json();
        
        if (video && data.m3u8) {
            providerDisplay.innerText = data.provider ? data.provider.toUpperCase() : "LIVE ПОТОК АКТИВЕН";
            video.src = data.m3u8;
        } else {
            providerDisplay.innerText = "РЕЗЕРВНЫЙ СИМУЛЯТОР СЕТИ";
        }
    } catch (e) {
        console.error("Ошибка подключения к видеопотоку:", e);
        providerDisplay.innerText = "БЭКЕНД ОФФЛАЙН / GEO-BLOCK";
    }
}

/**
 * ПУЛЬТ КОММЕНТАТОРА: Смена аудиодорожки, задержки и отправка плашек (БЕЗ ПАРОЛЯ)
 */
async function commentatorPushChanges() {
    const audioRadio = document.querySelector('input[name="audio-feed"]:checked');
    const delayInput = document.getElementById('delay-input-range');
    const noticeTextInput = document.getElementById('commentator-notice-text');
    const noticeTypeSelect = document.getElementById('commentator-notice-type');

    if (!audioRadio || !delayInput) return alert("Элементы управления пультом не найдены!");

    const selectedAudio = audioRadio.value;
    const delayVal = parseFloat(delayInput.value);
    const noticeText = noticeTextInput ? noticeTextInput.value.trim() : "";
    const noticeType = noticeTypeSelect ? noticeTypeSelect.value : "white";

    try {
        const res = await fetch(`${API_BASE}/api/commentator/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                active_audio_feed: selectedAudio,
                audio_delay: delayVal,
                new_notice_text: noticeText || null,
                new_notice_type: noticeType
            })
        });

        if (res.ok) {
            alert("Параметры трансляции успешно применились к эфиру!");
            if (noticeTextInput) noticeTextInput.value = ""; // Очищаем поле ввода сообщения
            loadCurrentState(); // Моментально обновляем бегущую строку у себя
        } else {
            alert("Сервер отклонил запрос комментатора.");
        }
    } catch (e) {
        console.error("Ошибка пуша комментатора:", e);
        alert("Ошибка связи с сервером Railway при обновлении эфира.");
    }
}

/**
 * АДМИН-ЗОНА: Авторизация администратора Kimi в боковой панели
 */
async function unlockAdminZone() {
    const userField = document.getElementById('admin-login-input');
    const passField = document.getElementById('admin-pass-input');
    
    if (!userField || !passField) return;

    const user = userField.value.trim();
    const pass = passField.value.trim();
    
    if (!user || !pass) return alert("Введите имя пользователя и пароль!");

    // Безопасное кодирование токена авторизации с поддержкой спецсимволов
    adminCredentialsBase64 = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));

    try {
        // Проверяем подлинность токена через запрос защищенных системных логов
        const response = await fetch(`${API_BASE}/api/admin/logs`, {
            headers: { 'Authorization': adminCredentialsBase64 }
        });

        if (response.status === 200) {
            // Переключаем блоки интерфейса: скрываем форму входа, показываем пульт Kimi
            document.getElementById('admin-auth-fields').style.display = 'none';
            document.getElementById('admin-core-controls').style.display = 'block';
            
            const logData = await response.json();
            renderLogs(logData);
        } else {
            alert("Доступ заблокирован: Неверный токен администратора Kimi!");
            adminCredentialsBase64 = "";
        }
    } catch (e) {
        console.error("Ошибка шлюза авторизации:", e);
        alert("Не удалось связаться с сервером для проверки пароля.");
        adminCredentialsBase64 = "";
    }
}

/**
 * АДМИН-ЗОНА: Запрос свежих логов с Railway сервера
 */
async function refreshAdminLogs() {
    if (!adminCredentialsBase64) return;
    try {
        const response = await fetch(`${API_BASE}/api/admin/logs`, {
            headers: { 'Authorization': adminCredentialsBase64 }
        });
        if (response.ok) {
            const logData = await response.json();
            renderLogs(logData);
        }
    } catch (e) {
        console.error("Ошибка обновления логов:", e);
    }
}

/**
 * Отрисовка полученных строк логов в консоль панели управления
 */
function renderLogs(data) {
    const container = document.getElementById('admin-logs-view');
    if (!container) return;
    
    if (data.logs && data.logs.length > 0) {
        container.innerHTML = data.logs.map(line => `
            <div style="border-bottom:1px solid #18181b; padding:2px 0; color:#22c55e;">${line}</div>
        `).join('');
    } else {
        container.innerHTML = "<div style='color:#71717a;'>Логи пусты</div>";
    }
    container.scrollTop = container.scrollHeight; // Авто-скролл вниз к свежим записям
}

/**
 * АДМИН-ЗОНА: Форсированная перезапись конфигурации ядра (Смена этапа / Ручной стрим)
 */
async function adminPushConfig() {
    if (!adminCredentialsBase64) return alert("Сессия администратора не активна!");

    const newGP = prompt("Введите название нового активного Гран-При (например, Spanish GP):");
    if (!newGP) return; // Отмена, если ничего не ввели

    const nextStatus = prompt("Укажите статус этапа (LIVE NOW / NEXT / FINISHED):", "LIVE NOW");
    const streamUrl = prompt("Прямая ссылка на поток .m3u8 (оставьте пустой для автоматических прокси):");

    try {
        const res = await fetch(`${API_BASE}/api/admin/update`, {
            method: 'POST',
            headers: {
                'Authorization': adminCredentialsBase64,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_gp: newGP,
                status_next: nextStatus || "LIVE NOW",
                manual_stream_url: streamUrl || ""
            })
        });

        if (res.ok) {
            alert("Конфигурация ядра Liberty Formula успешно перезаписана!");
            window.location.reload(); // Перезапуск для применения глобальных изменений
        } else {
            alert("Бэкенд отклонил конфигурацию. Проверьте права доступа.");
        }
    } catch (e) {
        console.error("Сбой пуша конфигурации админа:", e);
        alert("Критическая ошибка при отправке конфигурации на сервер.");
    }
}

/**
 * Загрузка архива лучших моментов (Хайлайты прошлых гонок)
 */
async function loadHighlights() {
    const container = document.getElementById('highlights-container');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/api/highlights.json`);
        if (!res.ok) throw new Error("Архив недоступен");
        const data = await res.json();
        
        container.innerHTML = data.highlights.map(hl => `
            <div class="hl-card" onclick="document.getElementById('f1-player').src='${hl.url}'; document.getElementById('provider-name').innerText='АРХИВНЫЙ ПОВТОР';">
                <div style="font-weight:bold; font-size:14px;">▶ ${hl.title}</div>
                <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">Длительность: ${hl.duration}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Ошибка загрузки хайлайтов:", e);
        container.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Архив повторов временно недоступен</div>";
    }
}

/**
 * Загрузка русских новостей F1News.ru и распределение по тегам безопасности
 */
async function loadNewsFeed() {
    const container = document.getElementById('news-container');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/api/feed.json`);
        if (!res.ok) throw new Error("Ошибка загрузки новостной ленты");
        const data = await res.json();
        
        container.innerHTML = data.items.map(item => `
            <div class="news-item item-${item.category}">
                <div style="font-size:11px; color:var(--text-muted)">[${item.time}] // ${item.source}</div>
                <a href="${item.link}" target="_blank" class="news-title" style="color:white; font-weight:bold; text-decoration:none; display:block; margin:5px 0;">${item.title}</a>
                <p style="margin:0; font-size:13px; color:#d4d4d8">${item.description}</p>
            </div>
        `).join('');
    } catch (e) {
        console.error("Ошибка обновления ленты новостей:", e);
        container.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Не удалось загрузить свежие новости</div>";
    }
}

/**
 * Инициализация приложения при полной отрисовке DOM-дерева
 */
window.addEventListener('DOMContentLoaded', () => {
    // Установка стартового режима просмотра по умолчанию
    setMode('spectator');
    
    // Первичный сбор данных с сервера Railway
    loadCurrentState();
    initStream();
    loadHighlights();
    loadNewsFeed();
    
    // Автоматические интервалы обновлений
    setInterval(loadNewsFeed, 120000);   // Лента новостей: раз в 2 минуты
    setInterval(loadCurrentState, 10000); // Синхронизация плашек Race Control: каждые 10 секунд
});
