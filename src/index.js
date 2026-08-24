import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv, config } from './env.js';
import { getShopeeOffers } from './shopee.js';
import { normalizeOffers, selectOffers } from './offers.js';
import { matchesCategory } from './categories.js';
import { run } from './run.js';
import { activity, addActivity, loadSettings, migrateLegacySettings, newDestination, publicSettings, saveSettings } from './settings.js';
import { connectDirectWhatsApp, directSessionExists, directWhatsAppState } from './whatsapp-direct.js';
import { categories, categoryById } from './categories.js';
import { currentShopeeCampaign } from './campaigns.js';
import { automationWindowOpen, normalizeSafety, safetySummary } from './safety.js';
import { allUsers, beginLogin, destroySession, disableTwoFactor, enableTwoFactor, finishTwoFactor, listUsers, registerUser, setupTwoFactor, userById, userFromSession, usersCount } from './auth.js';
import { createDestinationSchedule, nextDueDestination, refreshDestinationSchedule, scheduleAfterRun, scheduleRetry, scheduleStatus } from './automation-schedule.js';

loadEnv();
const base = config();
const publicDir = path.resolve('public');
let running = false;
let timer;
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const externallyHosted = base.allowedOrigins.some(origin => origin.startsWith('https://'));
if (!localHosts.has(base.host) && (base.panelAccessKey.length < 24 || !base.allowedOrigins.length)) {
  throw new Error('Hospedagem externa exige PANEL_ACCESS_KEY forte e PANEL_ALLOWED_ORIGINS configurado.');
}

function appSettings(user) {
  const saved = loadSettings(base, user.id);
  return {
    ...base,
    shopee: { ...base.shopee, ...saved.shopee },
    filters: saved.filters,
    whatsapp: { ...saved.whatsapp, recipients: saved.destinations.filter(d => d.active && d.type !== 'group').map(d => d.number) },
    evolution: { ...saved.evolution, targets: saved.destinations.filter(d => d.active).map(d => d.number) },
    directWhatsApp: { ...saved.directWhatsApp, targets: saved.destinations.filter(d => d.active).map(d => d.number) },
    automation: saved.automation,
    safety: saved.safety,
    destinations: saved.destinations,
    userId: user.id
  };
}
function json(response, status, payload) {
  response.writeHead(status, { ...securityHeaders(), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}
function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  };
}
function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const defaults = [`http://127.0.0.1:${base.port}`, `http://localhost:${base.port}`];
  return [...defaults, ...base.allowedOrigins].includes(origin);
}
function secureMatch(received, expectedValue) {
  const expected = Buffer.from(expectedValue);
  const actual = Buffer.from(String(received || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function panelHeaderAuthorized(request) {
  if (!base.panelAccessKey) return true;
  return secureMatch(request.headers['x-panel-key'], base.panelAccessKey);
}
function panelAuthorized(request) {
  if (!base.panelAccessKey) return true;
  return panelHeaderAuthorized(request) || secureMatch(cookieValue(request, 'of_panel_auth'), panelCookieValue());
}
function panelCookieValue() {
  return crypto.createHmac('sha256', base.panelAccessKey).update('ofertafluxo-panel-browser').digest('hex');
}
function panelAccessCookie() {
  return `of_panel_auth=${panelCookieValue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${externallyHosted ? '; Secure' : ''}`;
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let content = '';
    request.on('data', chunk => { content += chunk; if (content.length > 1_000_000) reject(new Error('Conteúdo muito grande')); });
    request.on('end', () => { try { resolve(content ? JSON.parse(content) : {}); } catch { reject(new Error('JSON inválido')); } });
    request.on('error', reject);
  });
}
function saveLog(user, type, message, detail) { addActivity(user.id, { type, message, detail }); }
async function performRun(user, origin = 'manual', destinationIds = null) {
  if (running) throw new Error('Já existe uma busca em andamento.');
  running = true;
  try {
    const settings = appSettings(user);
    settings.origin = origin;
    if (origin === 'automático' || origin === 'teste') settings.filters = { ...settings.filters, maxOffers: 1 };
    const result = await run(settings, destinationIds);
    saveLog(user, 'success', `${result.found} oferta(s) enviada(s)`, { origin, ...result });
    return result;
  } catch (error) {
    saveLog(user, 'error', error.message, { origin });
    throw error;
  } finally { running = false; }
}
function schedule() {
  clearInterval(timer);
  const checkSchedules = () => {
    const now = Date.now();
    for (const user of allUsers()) {
      const saved = loadSettings(base, user.id);
      const { automation } = saved;
      if (!automation.enabled) continue;
      if (running) continue;
      const destinationSchedule = refreshDestinationSchedule(automation, saved.destinations, now);
      const destination = nextDueDestination(saved.destinations, destinationSchedule, now);
      if (!destination) {
        if (JSON.stringify(destinationSchedule) !== JSON.stringify(automation.destinationSchedule || {})) {
          saved.automation = { ...automation, destinationSchedule };
          saveSettings(user.id, saved);
        }
        continue;
      }
      // Só avança o relógio do grupo após um envio concluído. Em falhas, o
      // destino entra em nova tentativa, sem fingir que uma oferta foi enviada.
      performRun(user, 'automático', [destination.id]).then(result => {
        const latest = loadSettings(base, user.id);
        if (!latest.automation.enabled) return;
        const currentSchedule = refreshDestinationSchedule(latest.automation, latest.destinations);
        const completedAt = Date.now();
        latest.automation = {
          ...latest.automation,
          lastRunAt: completedAt ? new Date(completedAt).toISOString() : latest.automation.lastRunAt,
          destinationSchedule: result.found
            ? scheduleAfterRun(currentSchedule, destination.id, latest.destinations, latest.automation.intervalMinutes, completedAt)
            : scheduleRetry(currentSchedule, destination.id, completedAt)
        };
        saveSettings(user.id, latest);
      }).catch(() => {
        const latest = loadSettings(base, user.id);
        if (!latest.automation.enabled) return;
        const currentSchedule = refreshDestinationSchedule(latest.automation, latest.destinations);
        latest.automation = {
          ...latest.automation,
          destinationSchedule: scheduleRetry(currentSchedule, destination.id, Date.now())
        };
        saveSettings(user.id, latest);
      });
    }
  };
  checkSchedules();
  timer = setInterval(checkSchedules, 30_000);
}
function automationStatus(user, settings, now = Date.now()) {
  const destinationSchedule = refreshDestinationSchedule(settings.automation, settings.destinations, now);
  const destinations = scheduleStatus(settings.destinations, { ...settings.automation, destinationSchedule }, now);
  return {
    ...settings.automation,
    destinationSchedule,
    destinations,
    nextRunAt: destinations.map(item => item.nextRunAt).sort()[0] || null,
    automationWindowOpen: automationWindowOpen(settings.safety)
  };
}
function refreshAutomationSchedule(saved, now = Date.now()) {
  if (!saved.automation.enabled) return;
  saved.automation = {
    ...saved.automation,
    destinationSchedule: refreshDestinationSchedule(saved.automation, saved.destinations, now)
  };
}
function cookieValue(request, name) { return String(request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1); }
function authenticatedUser(request) { return userFromSession(cookieValue(request, 'of_session')); }
function sessionCookie(token) { return `of_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${8 * 60 * 60}${externallyHosted ? '; Secure' : ''}`; }
function clearSessionCookie() { return `of_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${externallyHosted ? '; Secure' : ''}`; }
function serveFile(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url;
  const file = path.resolve(publicDir, `.${requested.split('?')[0]}`);
  const relative = path.relative(publicDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) { response.writeHead(404, securityHeaders()); return response.end(); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  response.writeHead(200, { ...securityHeaders(), 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(response);
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (['POST', 'PATCH', 'DELETE'].includes(request.method) && url.pathname !== '/run' && !isAllowedOrigin(request)) return json(response, 403, { error: 'Origem não autorizada.' });
    const isPanelApi = url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/');
    if (isPanelApi && !panelAuthorized(request)) {
      response.setHeader('x-panel-auth-required', 'true');
      return json(response, 401, { error: 'Chave de acesso do painel necessária.' });
    }
    if (isPanelApi && base.panelAccessKey && panelHeaderAuthorized(request)) response.setHeader('set-cookie', panelAccessCookie());
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, running });
    if (request.method === 'GET' && url.pathname === '/api/auth/meta') return json(response, 200, { usersCount: usersCount(), limit: 3 });
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const before = usersCount(); const user = registerUser(await readBody(request)); if (before === 0) migrateLegacySettings(user.id); schedule(); return json(response, 201, { user });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const result = beginLogin(await readBody(request));
      if (result.session) { response.setHeader('set-cookie', sessionCookie(result.session)); return json(response, 200, { user: result.user }); }
      return json(response, 200, { requiresTwoFactor: true, pendingToken: result.pendingToken });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/verify-2fa') {
      const result = finishTwoFactor(await readBody(request)); response.setHeader('set-cookie', sessionCookie(result.session)); return json(response, 200, { user: result.user });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') { destroySession(cookieValue(request, 'of_session')); response.setHeader('set-cookie', clearSessionCookie()); response.setHeader('clear-site-data', '"cache", "cookies", "storage"'); return json(response, 200, { ok: true }); }
    const user = authenticatedUser(request);
    if (url.pathname.startsWith('/api/') && !user) return json(response, 401, { error: 'Faça login para acessar esta área.' });
    if (request.method === 'GET' && url.pathname === '/api/auth/me') return json(response, 200, { user, usersCount: usersCount(), limit: 3 });
    if (request.method === 'POST' && url.pathname === '/api/auth/2fa/setup') return json(response, 200, await setupTwoFactor(user.id));
    if (request.method === 'POST' && url.pathname === '/api/auth/2fa/enable') return json(response, 200, { user: enableTwoFactor(user.id, (await readBody(request)).code) });
    if (request.method === 'POST' && url.pathname === '/api/auth/2fa/disable') return json(response, 200, { user: disableTwoFactor(user.id, (await readBody(request)).code) });
    if (request.method === 'GET' && url.pathname === '/api/users') return json(response, 200, { users: listUsers(user), limit: 3 });
    if (request.method === 'GET' && url.pathname === '/api/state') { if (directSessionExists(user.id)) connectDirectWhatsApp(user.id).catch(error => saveLog(user, 'error', `Falha ao reconectar WhatsApp: ${error.message}`)); const settings = appSettings(user); return json(response, 200, { ...publicSettings(settings), automationStatus: automationStatus(user, settings), categories, campaign: currentShopeeCampaign(), safetyStatus: safetySummary(user.id, settings.safety), directStatus: directWhatsAppState(user.id), running, activity: activity(user.id, 12), user }); }
    if (request.method === 'POST' && url.pathname === '/api/whatsapp-direct/connect') {
      const result = await connectDirectWhatsApp(user.id); saveLog(user, 'info', 'Conexão direta do WhatsApp solicitada'); return json(response, 200, result);
    }
    if (request.method === 'GET' && url.pathname === '/api/whatsapp-direct/status') return json(response, 200, directWhatsAppState(user.id));
    if (request.method === 'GET' && url.pathname === '/api/activity') return json(response, 200, activity(user.id));
    if (request.method === 'POST' && url.pathname === '/api/config/shopee') {
      const input = await readBody(request); const saved = loadSettings(base, user.id);
      saved.shopee.appId = String(input.appId || saved.shopee.appId || '').trim();
      if (input.secret) saved.shopee.secret = String(input.secret).trim();
      const filters = { ...saved.filters, minDiscount: Number(input.minDiscount ?? saved.filters.minDiscount), minPrice: Number(input.minPrice ?? saved.filters.minPrice), maxPrice: Number(input.maxPrice ?? saved.filters.maxPrice), maxOffers: Number(input.maxOffers ?? saved.filters.maxOffers), preferredMaxPrice: Number(input.preferredMaxPrice ?? saved.filters.preferredMaxPrice) };
      if (!Number.isFinite(filters.minPrice) || !Number.isFinite(filters.maxPrice) || filters.minPrice < 0 || filters.maxPrice < filters.minPrice) throw new Error('Defina uma faixa de preço válida.');
      saved.filters = filters;
      saveSettings(user.id, saved); saveLog(user, 'info', 'Integração Shopee atualizada');
      return json(response, 200, publicSettings(appSettings(user)));
    }
    if (request.method === 'POST' && url.pathname === '/api/config/whatsapp') {
      const input = await readBody(request); const saved = loadSettings(base, user.id);
      saved.whatsapp = { ...saved.whatsapp, token: input.token || saved.whatsapp.token, phoneNumberId: input.phoneNumberId || saved.whatsapp.phoneNumberId, mode: input.mode || 'text', templateName: input.templateName || '', templateLanguage: input.templateLanguage || 'pt_BR' };
      saveSettings(user.id, saved); saveLog(user, 'info', 'Configuração do WhatsApp atualizada');
      return json(response, 200, publicSettings(appSettings(user)));
    }
    if (request.method === 'POST' && url.pathname === '/api/config/evolution') {
      const input = await readBody(request); const saved = loadSettings(base, user.id);
      saved.evolution = {
        ...saved.evolution,
        enabled: Boolean(input.enabled),
        url: String(input.url || saved.evolution.url || '').replace(/\/$/, ''),
        apiKey: input.apiKey || saved.evolution.apiKey,
        instanceName: String(input.instanceName || saved.evolution.instanceName || '').trim()
      };
      saveSettings(user.id, saved); saveLog(user, 'info', 'Configuração da Evolution API atualizada');
      return json(response, 200, publicSettings(appSettings(user)));
    }
    if (request.method === 'POST' && url.pathname === '/api/destinations') {
      const input = await readBody(request); const destination = newDestination(input);
      if (!destination.name || destination.number.length < 10) throw new Error('Informe um nome e um número válido com DDI.');
      if (!destination.consent) throw new Error('Confirme que o grupo ou contato autorizou o recebimento das ofertas.');
      destination.categoryId = categoryById(destination.categoryId).id;
      const saved = loadSettings(base, user.id);
      if (saved.destinations.some(item => item.number === destination.number)) throw new Error('Este destino já está cadastrado. Altere a categoria no cadastro existente em vez de adicioná-lo novamente.');
      saved.destinations.push(destination); refreshAutomationSchedule(saved); saveSettings(user.id, saved); saveLog(user, 'info', `Destino adicionado: ${destination.name}`);
      return json(response, 201, destination);
    }
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/destinations/')) {
      const id = url.pathname.split('/').at(-1); const input = await readBody(request); const saved = loadSettings(base, user.id); const item = saved.destinations.find(d => d.id === id);
      if (!item) return json(response, 404, { error: 'Destino não encontrado' });
      if (input.categoryId) item.categoryId = categoryById(input.categoryId).id;
      else item.active = !item.active;
      refreshAutomationSchedule(saved); saveSettings(user.id, saved); return json(response, 200, item);
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/destinations/')) {
      const id = url.pathname.split('/').at(-1); const saved = loadSettings(base, user.id); saved.destinations = saved.destinations.filter(d => d.id !== id); refreshAutomationSchedule(saved); saveSettings(user.id, saved);
      return json(response, 204, {});
    }
    if (request.method === 'POST' && url.pathname === '/api/automation') {
      const input = await readBody(request); const saved = loadSettings(base, user.id);
      const intervalMinutes = Number(input.intervalMinutes);
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 1440) {
        throw new Error('Defina um intervalo inteiro entre 15 minutos e 24 horas.');
      }
      const configuredAt = new Date().toISOString();
      saved.automation = {
        enabled: Boolean(input.enabled),
        intervalMinutes,
        lastRunAt: configuredAt,
        destinationSchedule: input.enabled ? createDestinationSchedule(saved.destinations, intervalMinutes, Date.parse(configuredAt)) : {}
      };
      saveSettings(user.id, saved); schedule(); saveLog(user, 'info', saved.automation.enabled ? `Automação ativada: grupos intercalados em ciclos de ${intervalMinutes} minuto(s)` : 'Automação pausada');
      return json(response, 200, saved.automation);
    }
    if (request.method === 'POST' && url.pathname === '/api/safety') {
      const input = await readBody(request); const saved = loadSettings(base, user.id);
      saved.safety = normalizeSafety(input); saveSettings(user.id, saved); saveLog(user, 'info', 'Proteções de envio atualizadas');
      return json(response, 200, saved.safety);
    }
    if (request.method === 'POST' && url.pathname === '/api/offers/preview') {
      const input = await readBody(request); const settings = appSettings(user); const category = categoryById(input.categoryId);
      const general = normalizeOffers(await getShopeeOffers(settings.shopee)).filter(offer => matchesCategory(offer, category));
      let offers;
      if (category.searchQueries?.length) {
        const lists = await Promise.all(category.searchQueries.map(keyword => getShopeeOffers(settings.shopee, { keyword })));
        offers = [...lists.flatMap(normalizeOffers).filter(offer => matchesCategory(offer, category)), ...general];
      } else if (!general.length && category.query) offers = normalizeOffers(await getShopeeOffers(settings.shopee, { keyword: category.query })).filter(offer => matchesCategory(offer, category));
      else offers = general;
      offers = offers.filter((offer, index, list) => list.findIndex(item => item.id === offer.id) === index);
      offers = selectOffers(offers, { ...settings.filters, maxOffers: 24 }, new Set());
      saveLog(user, 'info', `${offers.length} oferta(s) consultada(s) na categoria ${category.label}`);
      return json(response, 200, { offers, category: category.label });
    }
    if (request.method === 'POST' && url.pathname === '/api/run') return json(response, 200, await performRun(user));
    if (request.method === 'POST' && url.pathname === '/api/test-send') return json(response, 200, await performRun(user, 'teste'));
    if (request.method === 'POST' && url.pathname === '/run') {
      if (!base.runSecret || base.runSecret.length < 24) return json(response, 503, { error: 'Defina um RUN_SECRET forte antes de usar o agendador externo.' });
      if (request.headers.authorization !== `Bearer ${base.runSecret}`) return json(response, 401, { error: 'Não autorizado' });
      const scheduledUser = userById(request.headers['x-of-user-id']);
      if (!scheduledUser) return json(response, 400, { error: 'Informe um usuário válido no cabeçalho X-Of-User-Id.' });
      return json(response, 200, await performRun(scheduledUser, 'agendador externo'));
    }
    if (request.method === 'GET' && url.pathname === '/' && !user) { response.writeHead(302, { location: '/login.html', ...securityHeaders() }); return response.end(); }
    if (request.method === 'GET') return serveFile(request, response);
    json(response, 404, { error: 'Rota não encontrada' });
  } catch (error) { json(response, 500, { error: error.message || 'Erro inesperado' }); }
}).listen(base.port, base.host, () => {
  schedule();
  for (const user of allUsers()) if (directSessionExists(user.id)) connectDirectWhatsApp(user.id).catch(error => saveLog(user, 'error', `Falha ao reconectar WhatsApp: ${error.message}`));
  console.log(`Painel pronto em http://${base.host}:${base.port}`);
});
