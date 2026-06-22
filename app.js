/* ════════════════════════════════════════════════════════
   LIBERTY FORMULA — app.js
   Роли, сайдбар, живая телеметрия OpenF1, хуки на Railway-бэкенд
   ════════════════════════════════════════════════════════ */

// ───── CONFIG ─────
// EU-инстанс (Нидерланды) — нужен для RTBF/ARD, у них жёсткий геоблок вне ЕС
const BACKEND = 'https://libertyformula-production-a845.up.railway.app';
const OPENF1  = 'https://api.openf1.org/v1';

// ───── ROLE SWITCHING ─────
function setRole(role) {
  document.body.dataset.role = role;
  document.querySelectorAll('.role-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.role === role);
  });
  localStorage.setItem('lf_role', role);
}

(function initRole() {
  const saved = localStorage.getItem('lf_role') || 'viewer';
  setRole(saved);
})();

// ───── SIDEBAR ─────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ───── DRIVER / TEAM DATA (2026 grid) ─────
const TEAM_CLASS = {
  1:'tm-mercedes', 63:'tm-mercedes',
  44:'tm-ferrari', 16:'tm-ferrari',
  4:'tm-mclaren', 81:'tm-mclaren',
  33:'tm-redbull', 22:'tm-redbull',
  30:'tm-rb', 6:'tm-rb',
  27:'tm-sauber', 5:'tm-sauber',
  10:'tm-alpine', 43:'tm-alpine',
  87:'tm-haas', 31:'tm-haas',
  23:'tm-williams', 55:'tm-williams',
  11:'tm-haas', 77:'tm-haas',
  18:'tm-aston', 14:'tm-aston',
};
const DRIVER_CODE = {
  1:'ANT', 63:'RUS', 44:'HAM', 16:'LEC',
  4:'NOR', 81:'PIA', 33:'VER', 22:'HAD',
  30:'LAW', 6:'LIN', 27:'HUL', 5:'BOR',
  10:'GAS', 43:'COL', 87:'BEA', 31:'OCO',
  23:'ALB', 55:'SAI', 11:'PER', 77:'BOT',
  18:'STR', 14:'ALO',
};
const DRIVER_FULL = {
  1:'ANTONELLI', 63:'RUSSELL', 44:'HAMILTON', 16:'LECLERC',
  4:'NORRIS', 81:'PIASTRI', 33:'VERSTAPPEN', 22:'HADJAR',
  30:'LAWSON', 6:'LINDBLAD', 27:'HULKENBERG', 5:'BORTOLETO',
  10:'GASLY', 43:'COLAPINTO', 87:'BEARMAN', 31:'OCON',
  23:'ALBON', 55:'SAINZ', 11:'PEREZ', 77:'BOTTAS',
  18:'STROLL', 14:'ALONSO',
};

// ───── HELPERS ─────
async function fetchJSON(url, opts) {
  try {
    const r = await fetch(url, opts);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function gapText(iv) {
  if (!iv) return '—';
  const g = iv.gap_to_leader;
  if (g == null || g === 0) return 'INTERVAL';
  return typeof g === 'number' ? `+${g.toFixed(3)}` : String(g);
}

// ───── OPENF1 LIVE TIMING ─────
let currentSession = null;

async function getLatestSession() {
  const data = await fetchJSON(`${OPENF1}/sessions?year=2026`);
  if (!data || !data.length) return null;
  return data.sort((a,b) => new Date(b.date_start) - new Date(a.date_start))[0];
}

async function refreshTiming() {
  const session = await getLatestSession();
  const diagOpenF1 = document.getElementById('diagOpenF1');

  if (!session) {
    if (diagOpenF1) diagOpenF1.className = 'diag-pulse err';
    document.getElementById('sessionChip').textContent = '— нет активной сессии —';
    return;
  }
  if (diagOpenF1) diagOpenF1.className = 'diag-pulse ok';
  currentSession = session;

  document.getElementById('sessionChip').textContent =
    `${(session.meeting_name||'GP').toUpperCase()} · ${(session.session_name||'')}`;

  const [positions, intervals] = await Promise.all([
    fetchJSON(`${OPENF1}/position?session_key=${session.session_key}`),
    fetchJSON(`${OPENF1}/intervals?session_key=${session.session_key}`),
  ]);
  if (!positions || !positions.length) return;

  const latest = {};
  for (const p of positions) {
    const d = p.driver_number;
    if (!latest[d] || p.date > latest[d].date) latest[d] = p;
  }
  const ivMap = {};
  if (intervals) {
    for (const iv of intervals) {
      const d = iv.driver_number;
      if (!ivMap[d] || iv.date > ivMap[d].date) ivMap[d] = iv;
    }
  }

  const sorted = Object.values(latest)
    .sort((a,b) => (a.position||99) - (b.position||99))
    .slice(0, 12);

  renderPodium(sorted, ivMap);
  renderTable(sorted, ivMap);
  renderHUD(sorted[0]);
}

function renderPodium(sorted, ivMap) {
  const cells = document.querySelectorAll('#podiumStrip .podium-cell');
  sorted.slice(0,3).forEach((row, i) => {
    const cell = cells[i];
    if (!cell) return;
    const drv = row.driver_number;
    cell.querySelector('.p-driver').textContent = DRIVER_CODE[drv] || `#${drv}`;
    cell.querySelector('.p-gap').textContent = gapText(ivMap[drv]);
  });
}

function renderTable(sorted, ivMap) {
  const tbody = document.getElementById('timingBody');
  if (!tbody) return;
  tbody.innerHTML = sorted.map(row => {
    const drv = row.driver_number;
    const teamClass = TEAM_CLASS[drv] || '';
    const code = DRIVER_CODE[drv] || `#${drv}`;
    const gap = gapText(ivMap[drv]);
    const gapClass = gap === 'INTERVAL' ? 'text-purple' : '';
    return `<tr class="${teamClass}">
      <td class="t-pos">${row.position}</td>
      <td><div class="t-driver"><span class="t-team-stripe"></span>${code}</div></td>
      <td class="t-gap ${gapClass} digits">${gap}</td>
      <td class="center role-commentator-only"><span class="tyre-badge m">M</span></td>
      <td class="right role-commentator-only digits">—</td>
      <td class="right role-commentator-only digits">—</td>
      <td class="right role-commentator-only digits">—</td>
    </tr>`;
  }).join('');
}

function renderHUD(leader) {
  if (!leader) return;
  document.getElementById('hudPos').textContent = 'P' + leader.position;
  document.getElementById('hudDriver').textContent = DRIVER_FULL[leader.driver_number] || '';
}

refreshTiming();
setInterval(refreshTiming, 5000);

// ───── RSS NEWS (через Railway-бэкенд) ─────
async function refreshNews() {
  const diagRSS = document.getElementById('diagRSS');
  const data = await fetchJSON(`${BACKEND}/api/feed.json`);

  if (!data || !Array.isArray(data) || !data.length) {
    if (diagRSS) diagRSS.className = 'diag-pulse err';
    return;
  }
  if (diagRSS) diagRSS.className = 'diag-pulse ok';

  const adminRssTime = document.getElementById('adminRssTime');
  if (adminRssTime) adminRssTime.textContent = new Date().toLocaleTimeString('ru-RU');

  const container = document.getElementById('newsRows');
  if (!container) return;
  container.innerHTML = data.slice(0, 12).map(item => `
    <div class="news-row ${item.alert ? 'alert' : ''}" data-cat="${item.category || 'all'}">
      <span class="news-time digits">${item.time || ''}</span>
      <p>${item.alert ? '🚨 <span class="news-alert-tag">СРОЧНО:</span> ' : ''}${item.text}</p>
    </div>
  `).join('');
}

function filterNews(cat) {
  document.querySelectorAll('.filter-tag').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  document.querySelectorAll('.news-row').forEach(row => {
    row.style.display = (cat === 'all' || row.dataset.cat === cat) ? 'flex' : 'none';
  });
}

refreshNews();
setInterval(refreshNews, 60000);

// ───── STREAM (с поддержкой Shaka Player) ─────
let hls = null;
let syncOffset = 0;
let shakaPlayer = null;

async function loadStream() {
  const diagStream = document.getElementById('diagStream');
  const adminStatus = document.getElementById('adminStreamStatus');
  const empty = document.getElementById('videoEmpty');
  const video = document.getElementById('player');
  const container = document.getElementById('shaka-player-container');
  const providerDisplay = document.getElementById('provider-name');

  const data = await fetchJSON(`${BACKEND}/api/stream.json`);

  if (!data || !data.m3u8 || data.status === 'error') {
    if (diagStream) diagStream.className = 'diag-pulse err';
    if (adminStatus) adminStatus.textContent = data?.info || 'бэкенд недоступен';
    if (providerDisplay) providerDisplay.textContent = 'ОШИБКА ПОТОКА';
    return;
  }

  if (diagStream) diagStream.className = 'diag-pulse ok';
  if (adminStatus) adminStatus.textContent = 'поток активен';
  if (providerDisplay) providerDisplay.textContent = data.provider || 'LIVE ПОТОК';

  const pulse = document.getElementById('streamPulse');
  if (pulse) pulse.classList.add('live');

  // ==== Пытаемся загрузить через Shaka Player ====
  try {
    // Показываем контейнер Shaka, скрываем старый video
    container.style.display = 'block';
    video.style.display = 'none';

    // Уничтожаем старый плеер, если он есть
    if (shakaPlayer) {
      await shakaPlayer.destroy();
      shakaPlayer = null;
    }

    // Создаём новый плеер
    shakaPlayer = new shaka.Player(container);
    window.shakaPlayer = shakaPlayer; // для отладки

    // Обработка ошибок Shaka
    shakaPlayer.addEventListener('error', (event) => {
      console.error('Shaka error:', event.detail);
      // Пробуем откатиться на hls.js
      fallbackToHls(data.m3u8);
    });

    // Загружаем поток
    await shakaPlayer.load(data.m3u8);
    empty.classList.add('hidden');
    console.log('Shaka Player загрузил поток');
  } catch (error) {
    console.error('Shaka Player не справился:', error);
    // Откат на hls.js
    fallbackToHls(data.m3u8);
  }
}

function fallbackToHls(url) {
  const container = document.getElementById('shaka-player-container');
  const video = document.getElementById('player');
  const empty = document.getElementById('videoEmpty');

  // Прячем Shaka, показываем старый video
  container.style.display = 'none';
  video.style.display = 'block';

  // Если Hls доступен — используем его
  if (window.Hls && Hls.isSupported()) {
    if (hls) hls.destroy();
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(()=>{});
      empty.classList.add('hidden');
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('Hls error:', data);
      // Прямой fallback, если hls.js тоже не работает
      video.src = url;
      video.play().catch(()=>{});
    });
  } else {
    // Самый последний вариант — прямой src
    video.src = url;
    video.play().then(() => {
      empty.classList.add('hidden');
    }).catch(()=>{});
  }
}

function adjustSync(delta) {
  syncOffset = Math.round((syncOffset + delta) * 10) / 10;
  document.getElementById('syncVal').textContent = `${syncOffset.toFixed(1)}s`;
  
  // Пытаемся синхронизировать Shaka или hls.js
  const video = document.getElementById('player');
  const container = document.getElementById('shaka-player-container');
  
  if (container.style.display !== 'none' && shakaPlayer) {
    // Для Shaka: смещаем время
    try {
      const currentTime = shakaPlayer.getMediaElement().currentTime;
      shakaPlayer.getMediaElement().currentTime = Math.max(0, currentTime + delta);
    } catch (e) {}
  } else if (video && !video.paused) {
    video.currentTime = Math.max(0, video.currentTime + delta);
  }
}

// Audio source chips (commentator mode)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('audio-chip')) {
    document.querySelectorAll('.audio-chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
  }
});

loadStream();

// ===== НОВЫЙ БЛОК: УПРАВЛЕНИЕ ИСТОЧНИКАМИ (без изменения дизайна) =====
// Список источников для выбора
const SOURCES_LIST = {
    "wearechecking": "https://wearechecking.live/streams-pages/motorsports",
    "vk_openwheels": "https://vkvideo.ru/@openwheelsgroup",
    "sportsurge": "https://www.sportsurge.stream/",
    "servustv": "https://www.servustv.com/live",
    "rtbf": "https://www.rtbf.be/auvio/",
    "custom": null
};

let currentSource = localStorage.getItem('lf_source') || 'wearechecking';

// Функция переключения источника (вызывается из админки)
function setSource(sourceKey) {
    if (sourceKey in SOURCES_LIST) {
        currentSource = sourceKey;
        localStorage.setItem('lf_source', sourceKey);

        // Отправляем на бэкенд
        fetch(`${BACKEND}/api/commentator/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: sourceKey })
        }).then(() => {
            // Обновляем отображение источника в интерфейсе
            const providerDisplay = document.getElementById('provider-name');
            if (providerDisplay) {
                providerDisplay.textContent = sourceKey.toUpperCase();
            }
            // Перезагружаем поток
            loadStream();
        });
    }
}

// Добавляем кнопки выбора источника в админ-панель (через JS, без изменения HTML)
function addSourceSelector() {
    // Находим место для вставки (например, в боковой панели или в зоне комментатора)
    const adminArea = document.querySelector('.role-commentator-only .admin-grid') ||
                      document.querySelector('.role-admin-only .admin-grid') ||
                      document.querySelector('.panel-head-rss');

    if (!adminArea) return;

    // Создаём контейнер для кнопок
    const sourceContainer = document.createElement('div');
    sourceContainer.className = 'source-selector';
    sourceContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; margin:10px 0; padding:8px; background:#0c0c10; border-radius:4px; border:1px solid rgba(255,255,255,0.05);';

    sourceContainer.innerHTML = `
        <div style="font-size:9px; color:#4e5060; text-transform:uppercase; letter-spacing:1px; width:100%; margin-bottom:4px;">Источник сигнала:</div>
        ${Object.keys(SOURCES_LIST).filter(k => k !== 'custom').map(key => `
            <button class="source-btn" data-source="${key}"
                    style="background:${currentSource === key ? '#e10600' : '#141419'};
                           border:1px solid ${currentSource === key ? '#e10600' : 'rgba(255,255,255,0.07)'};
                           color:${currentSource === key ? '#fff' : '#9da0b0'};
                           padding:4px 10px; border-radius:3px;
                           font-family:'Titillium Web',sans-serif; font-weight:700; font-size:10px;
                           cursor:pointer; transition:all 0.15s;">
                ${key.toUpperCase()}
            </button>
        `).join('')}
        <button class="source-btn" data-source="custom"
                style="background:#141419; border:1px solid rgba(255,255,255,0.07); color:#9da0b0; padding:4px 10px; border-radius:3px; font-family:'Titillium Web',sans-serif; font-weight:700; font-size:10px; cursor:pointer;">
            + СВОЙ
        </button>
    `;

    adminArea.appendChild(sourceContainer);

    // Вешаем обработчики на кнопки
    sourceContainer.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const source = this.dataset.source;
            if (source === 'custom') {
                const customUrl = prompt('Введите ссылку на .m3u8 поток:');
                if (customUrl) {
                    // Отправляем ручную ссылку на бэкенд
                    fetch(`${BACKEND}/api/admin/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ manual_stream_url: customUrl })
                    }).then(() => {
                        loadStream();
                    });
                }
                return;
            }
            setSource(source);
        });
    });
}

// Инициализация после загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
    // Ждём, пока подгрузится админ-зона
    setTimeout(addSourceSelector, 1000);
});
