const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 8000);
const SUBSCRIBERS_PATH = path.join(ROOT_DIR, 'data', 'subscribers.json');
const VISITORS_PATH = path.join(ROOT_DIR, 'data', 'visitors.json');
let TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function ensureDataFile() {
  const dir = path.dirname(SUBSCRIBERS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(SUBSCRIBERS_PATH)) {
    fs.writeFileSync(SUBSCRIBERS_PATH, JSON.stringify([]));
  }
}

function loadSubscribers() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(SUBSCRIBERS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveSubscribers(list) {
  ensureDataFile();
  fs.writeFileSync(SUBSCRIBERS_PATH, JSON.stringify(list, null, 2));
}

function ensureVisitorsFile() {
  const dir = path.dirname(VISITORS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(VISITORS_PATH)) {
    fs.writeFileSync(VISITORS_PATH, JSON.stringify({ total_hits: 0, unique_ips: [] }, null, 2));
  }
}

function loadVisitorStats() {
  ensureVisitorsFile();
  try {
    const raw = fs.readFileSync(VISITORS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      total_hits: Number(data.total_hits) || 0,
      unique_ips: Array.isArray(data.unique_ips) ? data.unique_ips : []
    };
  } catch (error) {
    return { total_hits: 0, unique_ips: [] };
  }
}

function saveVisitorStats(stats) {
  ensureVisitorsFile();
  fs.writeFileSync(VISITORS_PATH, JSON.stringify(stats, null, 2));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function trackVisit(req, safePath) {
  if (!safePath.endsWith('.html')) {
    return;
  }
  const stats = loadVisitorStats();
  stats.total_hits += 1;
  const ip = getClientIp(req);
  if (ip && !stats.unique_ips.includes(ip)) {
    stats.unique_ips.push(ip);
  }
  saveVisitorStats(stats);
}

function parseRecipients(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (/^-?\d+$/.test(entry) ? Number(entry) : entry));
}

function getRecipients() {
  const subscribers = loadSubscribers();
  const envRecipients = parseRecipients(process.env.TELEGRAM_RECIPIENTS || '');
  const merged = new Map();
  [...subscribers, ...envRecipients].forEach((recipient) => {
    const key = String(recipient);
    if (!merged.has(key)) {
      merged.set(key, recipient);
    }
  });
  return [...merged.values()];
}

async function sendTelegram(chatId, text) {
  if (!TOKEN) {
    return { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `Telegram error (${response.status})`
      };
    }
    return data;
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function sendTelegramDocument(chatId, filename, content) {
  if (!TOKEN) {
    return { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' };
  }

  try {
    const form = new FormData();
    const file = new Blob([content], { type: 'text/plain; charset=utf-8' });
    form.append('chat_id', String(chatId));
    form.append('document', file, filename);

    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
      method: 'POST',
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `Telegram error (${response.status})`
      };
    }
    return data;
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function formatMetaText(payload) {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const timeOnSiteSec = payload.time_on_site_ms
    ? `${Math.round(Number(payload.time_on_site_ms) / 1000)} сек`
    : '-';

  const lines = [
    `Referrer: ${payload.referrer || '-'}`,
    `Landing: ${payload.landing_page || payload.page_url || '-'}`,
    `Время (МСК): ${time}`,
    '',
    'Метаданные',
    `IP: ${payload.ip || '-'}`,
    `User Agent: ${payload.user_agent || '-'}`,
    `OS: ${formatOSVersion(payload.user_agent || '') || '-'}`,
    `Browser: ${formatBrowser(payload.user_agent || '') || '-'}`,
    `Язык: ${payload.language || '-'}`,
    `Языки: ${payload.languages || '-'}`,
    `Платформа: ${payload.platform || '-'}`,
    `Cookies: ${payload.cookies_enabled || '-'}`,
    `DNT: ${payload.do_not_track || '-'}`,
    `Time zone: ${payload.time_zone || '-'}`,
    `UTC offset (min): ${payload.utc_offset_min || '-'}`,
    `Экран: ${payload.screen_width || '-'}x${payload.screen_height || '-'} @${payload.device_pixel_ratio || '-'}`,
    `Viewport: ${payload.viewport_width || '-'}x${payload.viewport_height || '-'}`,
    `Orientation: ${payload.screen_orientation || '-'}`,
    `Color gamut: ${payload.color_gamut || '-'}`,
    `HDR: ${payload.hdr_support || '-'}`,
    `Color depth: ${payload.screen_color_depth || '-'}`,
    `RAM (GB): ${payload.device_memory || '-'}`,
    `CPU cores: ${payload.hardware_concurrency || '-'}`,
    `Touch points: ${payload.max_touch_points || '-'}`,
    `Input type: ${payload.input_type || '-'}`,
    `Pointer primary: ${payload.pointer_primary || '-'}`,
    `Hover primary: ${payload.hover_primary || '-'}`,
    `Any pointer: ${payload.any_pointer || '-'}`,
    `Any hover: ${payload.any_hover || '-'}`,
    `Connection type: ${payload.connection_type || '-'}`,
    `Connection effective: ${payload.connection_effective_type || '-'}`,
    `Downlink: ${payload.connection_downlink || '-'}`,
    `RTT: ${payload.connection_rtt || '-'}`,
    `Save data: ${payload.connection_save_data || '-'}`,
    `Prefers color scheme: ${payload.prefers_color_scheme || '-'}`,
    `Prefers reduced motion: ${payload.prefers_reduced_motion || '-'}`,
    `WebGL vendor: ${payload.webgl_vendor || '-'}`,
    `WebGL renderer: ${payload.webgl_renderer || '-'}`,
    `Ad block: ${payload.adblock_detected || '-'}`,
    `Session start: ${payload.session_start || '-'}`,
    `Session pageviews: ${payload.session_pageviews || '-'}`,
    `Total pageviews: ${payload.total_pageviews || '-'}`,
    `Visits count: ${payload.visit_count || '-'}`,
    `First visit: ${payload.first_visit_ts || '-'}`,
    `Time on site: ${timeOnSiteSec}`,
    `Всего посещений (страницы): ${payload.site_visits_total || '-'}`,
    `Уникальных посетителей: ${payload.site_unique_total || '-'}`
  ];

  return lines.join('\n');
}

async function broadcastLead(text) {
  const recipients = getRecipients();
  if (!recipients.length) {
    return { ok: false, error: 'No recipients' };
  }

  const results = [];
  let successCount = 0;
  for (const chatId of recipients) {
    const result = await sendTelegram(chatId, text);
    if (result.ok) {
      successCount += 1;
    }
    results.push({ chatId, result });
  }

  if (!successCount) {
    return { ok: false, error: 'All sends failed', results };
  }

  return { ok: true, results };
}

function formatLead(payload) {
  const timeOnSite = formatDuration(payload.time_on_site_ms);
  const device = formatDevice(payload.user_agent || '');
  const browser = formatBrowser(payload.user_agent || '');
  const language = payload.language || '-';
  const country = extractCountry(language);
  const region = payload.time_zone || '-';
  const clientTime = payload.client_time_local || payload.client_time_iso || '-';

  const lines = [
    '<b>Новая заявка с сайта AI Bird</b>',
    `Имя: <b>${payload.name || '-'}</b>`,
    `Контакт: <b>${payload.contact || '-'}</b>`,
    `Комментарий: ${payload.comment || '-'}`,
    '',
    `Time on site: ${timeOnSite}`,
    `Всего посещений (страницы): ${payload.site_visits_total || '-'}`,
    `Устройство: ${device}`,
    `Браузер: ${browser}`,
    `Страна: ${country || '-'}`,
    `Регион: ${region}`,
    `Язык: ${language}`,
    `Время на устройстве: ${clientTime}`,
    `Уникальных посетителей: ${payload.site_unique_total || '-'}`
  ];

  return lines.join('\n');
}

function formatDuration(msValue) {
  const ms = Number(msValue);
  if (!Number.isFinite(ms) || ms <= 0) {
    return '-';
  }
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours} ч ${minutes} мин ${seconds} сек`;
}

function extractCountry(language) {
  if (!language) {
    return '';
  }
  const match = String(language).match(/[-_](\w{2})/);
  return match ? match[1].toUpperCase() : '';
}

function formatDevice(ua) {
  const agent = String(ua);
  let type = 'Desktop';
  if (/iPad|Tablet/i.test(agent) || (/Android/i.test(agent) && !/Mobile/i.test(agent))) {
    type = 'Tablet';
  } else if (/Mobi|iPhone|Android/i.test(agent)) {
    type = 'Mobile';
  }
  const os = detectOS(agent);
  return os ? `${type} (${os})` : type;
}

function detectOS(agent) {
  if (/Windows NT/i.test(agent)) return 'Windows';
  if (/Mac OS X/i.test(agent)) return 'macOS';
  if (/Android/i.test(agent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS';
  if (/CrOS/i.test(agent)) return 'ChromeOS';
  if (/Linux/i.test(agent)) return 'Linux';
  return '';
}

function formatBrowser(ua) {
  const agent = String(ua);
  const match =
    agent.match(/Edg\/([\d.]+)/) ||
    agent.match(/OPR\/([\d.]+)/) ||
    agent.match(/Chrome\/([\d.]+)/) ||
    agent.match(/Firefox\/([\d.]+)/) ||
    agent.match(/Version\/([\d.]+).*Safari/) ||
    agent.match(/Safari\/([\d.]+)/);

  if (!match) {
    return '-';
  }

  const version = match[1];
  if (match[0].startsWith('Edg/')) return `Edge ${version}`;
  if (match[0].startsWith('OPR/')) return `Opera ${version}`;
  if (match[0].includes('Chrome/')) return `Chrome ${version}`;
  if (match[0].includes('Firefox/')) return `Firefox ${version}`;
  if (match[0].includes('Version/') || match[0].includes('Safari/')) return `Safari ${version}`;
  return version;
}

function formatOSVersion(ua) {
  const agent = String(ua);
  let match = agent.match(/Windows NT ([\d.]+)/i);
  if (match) {
    return `Windows NT ${match[1]}`;
  }
  match = agent.match(/Mac OS X ([\d_\\.]+)/i);
  if (match) {
    return `macOS ${match[1].replace(/_/g, '.')}`;
  }
  match = agent.match(/Android ([\d.]+)/i);
  if (match) {
    return `Android ${match[1]}`;
  }
  match = agent.match(/OS ([\d_\\.]+) like Mac OS X/i);
  if (match) {
    return `iOS ${match[1].replace(/_/g, '.')}`;
  }
  if (/CrOS/i.test(agent)) {
    return 'ChromeOS';
  }
  if (/Linux/i.test(agent)) {
    return 'Linux';
  }
  return '';
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  trackVisit(req, safePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      const notFoundPath = path.join(ROOT_DIR, '404.html');
      fs.readFile(notFoundPath, (fallbackError, fallbackData) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function parseEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const [key, ...rest] = trimmed.split('=');
    if (!key) {
      return;
    }
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  });
}

async function handleLead(req, res) {
  try {
    const payload = await parseJsonBody(req);
    const stats = loadVisitorStats();
    payload.site_visits_total = stats.total_hits;
    payload.site_unique_total = stats.unique_ips.length;
    payload.ip = getClientIp(req);
    payload.user_agent = req.headers['user-agent'] || payload.user_agent;
    payload.host = req.headers.host || '';
    if (!payload.referrer && req.headers.referer) {
      payload.referrer = req.headers.referer;
    }
    const message = formatLead(payload);
    const result = await broadcastLead(message);
    if (!result.ok) {
      throw new Error(result.error || 'Failed to send lead');
    }

    const metaText = formatMetaText(payload);
    const filename = `meta_${Date.now()}.txt`;
    const metaResults = [];
    for (const chatId of getRecipients()) {
      const docResult = await sendTelegramDocument(chatId, filename, metaText);
      metaResults.push({ chatId, docResult });
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, result, metaResults }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
}

function startPolling() {
  if (!TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set. Bot polling is disabled.');
    return;
  }

  let offset = 0;

  const poll = async () => {
    try {
      const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=20&offset=${offset}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.ok) {
        return;
      }

      const updates = data.result || [];
      if (!updates.length) {
        return;
      }

      const subscribers = new Set(loadSubscribers());
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const message = update.message || update.edited_message;
        if (!message || !message.chat) {
          continue;
        }
        const chatId = message.chat.id;
        if (!subscribers.has(chatId)) {
          subscribers.add(chatId);
          const username = message.from && message.from.username ? `@${message.from.username}` : '';
          console.log(`New subscriber: ${chatId} ${username}`.trim());
          await sendTelegram(
            chatId,
            `Вы подписаны на заявки с сайта AI Bird.\nВаш chat_id: <code>${chatId}</code>`
          );
        }
      }

      saveSubscribers([...subscribers]);
    } catch (error) {
      console.error('Polling error:', error.message);
    }
  };

  setInterval(poll, 3000);
  poll();
}

parseEnv();
TOKEN = process.env.TELEGRAM_BOT_TOKEN || TOKEN;
startPolling();

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/lead')) {
    handleLead(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveFile(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
