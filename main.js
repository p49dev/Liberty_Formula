const API_BASE = "https://libertyformula-production-4740.up.railway.app";
let adminCredentialsBase64 = "";

/**
 * БАЗА F1 2026: КОМАНДЫ, ПИЛОТЫ И КЛАССЫ ЦВЕТОВ
 */
const F1_GRID_2026 = {
    "MERCEDES": { colorClass: "border-mercedes", drivers: [{ id: "ANT", name: "Kimi Antonelli", num: 12 }, { id: "RUS", name: "George Russell", num: 63 }] },
    "FERRARI": { colorClass: "border-ferrari", drivers: [{ id: "HAM", name: "Lewis Hamilton", num: 44 }, { id: "LEC", name: "Charles Leclerc", num: 16 }] },
    "MCLAREN": { colorClass: "border-mclaren", drivers: [{ id: "NOR", name: "Lando Norris", num: 1 }, { id: "PIA", name: "Oscar Piastri", num: 81 }] },
    "RED_BULL": { colorClass: "border-redbull", drivers: [{ id: "VER", name: "Max Verstappen", num: 3 }, { id: "HAD", name: "Isack Hadjar", num: 6 }] },
    "ASTON_MARTIN": { colorClass: "border-aston", drivers: [{ id: "ALO", name: "Fernando Alonso", num: 14 }, { id: "STR", name: "Lance Stroll", num: 18 }] },
    "ALPINE": { colorClass: "border-alpine", drivers: [{ id: "GAS", name: "Pierre Gasly", num: 10 }, { id: "COL", name: "Franco Colapinto", num: 43 }] },
    "WILLIAMS": { colorClass: "border-williams", drivers: [{ id: "SAI", name: "Carlos Sainz", num: 55 }, { id: "ALB", name: "Alex Albon", num: 23 }] },
    "RACING_BULLS": { colorClass: "border-racingbulls", drivers: [{ id: "LAW", name: "Liam Lawson", num: 30 }, { id: "LIN", name: "Arvid Lindblad", num: 41 }] },
    "HAAS": { colorClass: "border-haas", drivers: [{ id: "OCO", name: "Esteban Ocon", num: 31 }, { id: "BEA", name: "Oliver Bearman", num: 87 }] },
    "AUDI": { colorClass: "border-audi", drivers: [{ id: "BOR", name: "Gabriel Bortoleto", num: 5 }, { id: "HUL", name: "Nico Hülkenberg", num: 27 }] },
    "CADILLAC": { colorClass: "border-cadillac", drivers: [{ id: "PER", name: "Sergio Pérez", num: 11 }, { id: "BOT", name: "Valtteri Bottas", num: 77 }] }
};

// Функция поиска пилота по ID для сборки инфографики
function getDriverInfo(driverId) {
    for (const [teamName, teamData] of Object.entries(F1_GRID_2026)) {
        const driver = teamData.drivers.find(d => d.id === driverId);
        if (driver) return { ...driver, team: teamName.replace("_", " "), colorClass: teamData.colorClass };
    }
    return { name: "Unknown Driver", num: 0, team: "FIA", colorClass: "" };
}

// Переключение режимов
function setMode(mode) {
    const workspace = document.getElementById('workspace-container');
    const btnSpectator = document.getElementById('btn-spectator');
    const btnPro = document.getElementById('btn-pro');

    if (mode === 'pro') {
        workspace.classList.add('mode-pro-active');
        btnPro.classList.add('active');
        btnSpectator.classList.remove('active');
        renderMockPodium(); // Отрисовываем подиум при входе в PRO режим
    } else {
        workspace.classList.remove('mode-pro-active');
        btnSpectator.classList.add('active');
        btnPro.classList.remove('active');
    }
}

function togglePitwallControl() {
    document.getElementById('pitwall-sidebar').classList.toggle('open');
}

// Загрузка состояния (Race Control)
async function loadCurrentState() {
    try {
        const res = await fetch(`${API_BASE}/api/state.json`);
        if (!res.ok) throw new Error("Ошибка чтения");
        const state = await res.json();
        
        document.getElementById('current-gp-display').innerText = state.current_gp ? state.current_gp.toUpperCase() : "STANDBY";
        
        const noticesContainer = document.getElementById('notices-marquee-container');
        if (state.race_control_notices && state.race_control_notices.length > 0) {
            noticesContainer.innerHTML = state.race_control_notices.map(n => `
                <div class="notice-item type-${n.type}"><span class="n-time">[${n.time}]</span> ${n.text}</div>
            `).join('');
        } else {
            noticesContainer.innerHTML = "<div style='color:#71717a;'>RACE CONTROL: NO LIVE NOTICES</div>";
        }
    } catch (e) {
        console.error("Нет связи с бэкендом Railway:", e);
    }
}

// Отрисовка подиума с применением цветов 2026 года
function renderMockPodium() {
    const container = document.getElementById('live-podium-container');
    // Заглушка: симулируем топ-3 пилотов (например, Норрис, Хэмилтон, Антонелли)
    const top3 = ["NOR", "HAM", "ANT"]; 
    
    container.innerHTML = top3.map((driverId, index) => {
        const d = getDriverInfo(driverId);
        return `
            <div class="driver-card ${d.colorClass}">
                <div class="rank">P${index + 1}</div>
                <div class="meta">
                    <div class="name">${d.name}</div>
                    <div class="team-name">${d.team}</div>
                </div>
                <div class="num">${d.num}</div>
            </div>
        `;
    }).join('');
}

// Инициализация плеера
async function initStream() {
    const video = document.getElementById('f1-player');
    const providerDisplay = document.getElementById('provider-name');
    try {
        const res = await fetch(`${API_BASE}/api/stream.json`);
        const data = await res.json();
        if (video && data.m3u8) {
            providerDisplay.innerText = data.provider || "LIVE";
            video.src = data.m3u8;
        }
    } catch (e) {
        providerDisplay.innerText = "БЭКЕНД ОФФЛАЙН";
    }
}

// Пульт комментатора
async function commentatorPushChanges() {
    const text = document.getElementById('commentator-notice-text').value;
    const type = document.getElementById('commentator-notice-type').value;
    try {
        await fetch(`${API_BASE}/api/commentator/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_notice_text: text, new_notice_type: type })
        });
        alert("Отправлено в эфир!");
        loadCurrentState();
    } catch (e) { alert("Ошибка пуша"); }
}

// Админка
async function unlockAdminZone() {
    const user = document.getElementById('admin-login-input').value;
    const pass = document.getElementById('admin-pass-input').value;
    adminCredentialsBase64 = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
    document.getElementById('admin-auth-fields').style.display = 'none';
    document.getElementById('admin-core-controls').style.display = 'block';
}

window.addEventListener('DOMContentLoaded', () => {
    setMode('spectator');
    loadCurrentState();
    initStream();
    setInterval(loadCurrentState, 10000);
});
