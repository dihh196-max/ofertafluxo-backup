let state = {};
const $ = selector => document.querySelector(selector);
let panelKey = '';
let stateRefreshInProgress = false;
const api = async (url, options = {}, retried = false) => {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (panelKey) headers['x-panel-key'] = panelKey;
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && response.headers.get('x-panel-auth-required') === 'true' && !retried) {
    const key = window.prompt('Informe a chave de acesso deste painel:');
    if (key) { panelKey = key; return api(url, options, true); }
  }
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
  return payload;
};
function toast(message, error = false) {
  const element = $('#toast'); element.textContent = message; element.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.className = ''; }, 4600);
}
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }
function page(id) {
  document.querySelectorAll('.page').forEach(item => item.classList.toggle('active', item.id === id));
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.page === id));
  $('#page-title').textContent = ({ dashboard: 'Visão geral', offers: 'Ofertas', automation: 'Automação', destinations: 'Destinos', integration: 'Integrações' })[id];
}
function renderActivity(items) {
  $('#activity').classList.toggle('empty', !items.length);
  $('#activity').innerHTML = items.length ? items.slice(0, 5).map(item => `<div class="activity-item"><span>${item.type === 'error' ? '⚠' : item.type === 'success' ? '✓' : '•'}</span><span>${item.message}</span><time>${new Date(item.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') : 'Nenhuma atividade registrada.';
}
function renderDestinations() {
  const list = $('#destinations-list'); const destinations = state.destinations || [];
  const categoryName = id => (state.categories || []).find(category => category.id === id)?.label || 'Ofertas gerais';
  const categoryOptions = selected => (state.categories || []).map(category => `<option value="${escapeHtml(category.id)}" ${category.id === (selected || 'all') ? 'selected' : ''}>${escapeHtml(category.label)}</option>`).join('');
  const schedule = new Map((state.automationStatus?.destinations || []).map(item => [item.destinationId, item.nextRunAt]));
  const countdown = date => {
    const seconds = Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));
    const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${String(minutes).padStart(2, '0')}min` : `${Math.max(1, minutes)} min`;
  };
  const whatsappBlocked = state.directWhatsApp?.enabled && state.directStatus?.status !== 'conectado';
  const automationNote = item => state.automation?.enabled && whatsappBlocked
    ? ' · Aguardando reconexão do WhatsApp'
    : state.automation?.enabled && schedule.has(item.id)
    ? ` · Próximo envio em ${countdown(schedule.get(item.id))}`
    : ' · Automação pausada';
  list.classList.toggle('empty', !destinations.length);
  list.innerHTML = destinations.length ? destinations.map(item => `<article class="destination"><div class="avatar">${item.type === 'group' ? '♧' : '◔'}</div><div><strong>${escapeHtml(item.name)}</strong><small>${item.type === 'group' ? escapeHtml(item.number) : `+${escapeHtml(item.number)}`} · ${escapeHtml(categoryName(item.categoryId))}${automationNote(item)}</small></div><select class="destination-category" title="Categoria deste destino" data-id="${item.id}">${categoryOptions(item.categoryId)}</select><span class="tag ${item.active ? '' : 'off'}">${item.active ? 'Ativo' : 'Pausado'}</span><button class="icon-button toggle-destination" title="Ativar ou pausar" data-id="${item.id}">⏻</button><button class="icon-button delete-destination" title="Remover" data-id="${item.id}">⌫</button></article>`).join('') : 'Nenhum destino configurado.';
  const groups = state.directStatus?.groups || [];
  $('#groups-helper').innerHTML = groups.length ? `<h3>Grupos que este WhatsApp administra</h3><p class="form-note">Apenas grupos em que o número conectado é administrador aparecem aqui.</p>${groups.map(group => `<article class="group-picker"><div><strong>${escapeHtml(group.subject)}</strong><small>${escapeHtml(group.id)}</small></div><button class="secondary select-group" data-id="${escapeHtml(group.id)}" data-name="${escapeHtml(group.subject)}">Usar este grupo</button></article>`).join('')}` : '';
}
function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function renderState() {
  const shopeeOn = state.shopee?.connected;
  const active = (state.destinations || []).filter(item => item.active).length;
  $('#connection-label').textContent = shopeeOn ? 'Shopee conectada' : 'Shopee não configurada';
  $('#metric-connection').textContent = shopeeOn ? 'Conectada' : 'Pendente';
  $('#metric-destinations').textContent = active;
  $('#metric-automation').textContent = state.automation?.enabled ? 'Ativa' : 'Pausada';
  $('#shopee-state').textContent = shopeeOn ? `Conectada (${state.shopee.appId})` : 'Não configurada';
  $('#whatsapp-state').textContent = state.whatsapp?.configured ? 'Configurada' : 'Não configurada';
  $('#direct-state').textContent = state.directStatus?.status === 'conectado' ? 'Conectado' : 'Desconectado';
  $('#account-name').textContent = state.user?.username || 'Conta';
  const categoryField = $('#preview-category'); const previousCategory = categoryField.value;
  categoryField.innerHTML = (state.categories || []).map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`).join('');
  const activeDestinations = (state.destinations || []).filter(destination => destination.active);
  categoryField.value = (state.categories || []).some(category => category.id === previousCategory) ? previousCategory : (activeDestinations.length === 1 ? activeDestinations[0].categoryId : 'all');
  const automation = state.automationStatus || state.automation || {};
  $('#automation-enabled').checked = Boolean(automation.enabled);
  $('#automation-interval').value = String(automation.intervalMinutes || 60);
  const nextRun = automation.nextRunAt ? new Date(automation.nextRunAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const whatsappBlocked = state.directWhatsApp?.enabled && state.directStatus?.status !== 'conectado';
  $('#automation-copy').textContent = automation.enabled
    ? whatsappBlocked
      ? 'Automação aguardando a reconexão do WhatsApp. O próximo envio será reprogramado após a conexão.'
      : `Envios intercalados a cada ${automation.intervalMinutes} minutos por grupo · Próximo envio programado: ${nextRun}${automation.automationWindowOpen === false ? ' · aguardando o fim do descanso' : ''}.`
    : 'A automação está pausada.';
  const safety = state.safetyStatus || state.safety || {};
  $('#safety-hour').value = safety.maxPerHour || 12;
  $('#safety-day').value = safety.maxPerDay || 48;
  $('#safety-group-minutes').value = safety.minMinutesPerDestination || 45;
  $('#safety-quiet-start').value = safety.quietStartHour ?? 22;
  $('#safety-quiet-end').value = safety.quietEndHour ?? 8;
  $('#safety-copy').textContent = `${safety.sentLastHour || 0}/${safety.maxPerHour || 12} envios na última hora · ${safety.sentToday || 0}/${safety.maxPerDay || 48} hoje${safety.automationWindowOpen === false ? ' · descanso ativo' : ''}.`;
  renderDestinations(); renderActivity(state.activity || []);
}
async function reload() {
  if (stateRefreshInProgress) return;
  stateRefreshInProgress = true;
  try { state = await api('/api/state'); renderState(); }
  finally { stateRefreshInProgress = false; }
}
function canRefreshInBackground() {
  return document.visibilityState === 'visible'
    && !document.querySelector('dialog[open]')
    && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
}
async function backgroundRefresh() {
  if (!canRefreshInBackground()) return;
  try { await reload(); } catch { /* A próxima atualização tentará novamente sem interromper a tela. */ }
}
function openShopee() {
  $('#shopee-app-id').value = '';
  $('#shopee-app-id').placeholder = state.shopee?.connected ? 'Já configurado — informe apenas para substituir' : 'Ex.: 183...';
  $('#shopee-secret').value = '';
  $('#min-discount').value = state.filters?.minDiscount ?? 15;
  $('#min-price').value = state.filters?.minPrice ?? 0;
  $('#max-price').value = state.filters?.maxPrice ?? 1000;
  $('#preferred-max-price').value = state.filters?.preferredMaxPrice ?? 80;
  $('#max-offers').value = state.filters?.maxOffers ?? 5;
  $('#shopee-dialog').showModal();
}
async function loadOffers() {
  const button = $('#load-offers'); button.disabled = true; button.textContent = 'Buscando…';
  $('#offers-message').textContent = 'Consultando a Open API da Shopee…';
  try {
    const { offers, category } = await api('/api/offers/preview', { method: 'POST', body: JSON.stringify({ categoryId: $('#preview-category').value }) });
    $('#offers-message').textContent = offers.length ? `${offers.length} ofertas encontradas em ${category}.` : `Nenhuma oferta encontrada em ${category}.`;
    $('#offers-grid').innerHTML = offers.map(offer => `<article class="card offer"><div class="offer-img">${offer.image ? `<img src="${escapeHtml(offer.image)}" alt="">` : '◈'}</div><div class="offer-info"><h3>${escapeHtml(offer.title)}</h3><div class="offer-price">${money(offer.price)}</div><div class="offer-meta"><span>${offer.shop ? escapeHtml(offer.shop) : 'Shopee'}</span><span>${offer.sales ? `${offer.sales} vendidos` : 'Sem vendas'}</span></div><div class="commission">Comissão: ${(Number(offer.commissionRate || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</div><a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener">Ver oferta →</a></div></article>`).join('');
    await reload();
  } catch (error) { $('#offers-message').textContent = error.message; toast(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Buscar ofertas'; }
}
document.addEventListener('click', async event => {
  const nav = event.target.closest('.nav'); if (nav) return page(nav.dataset.page);
  const go = event.target.closest('[data-go]'); if (go) return page(go.dataset.go);
  if (event.target.closest('#open-shopee')) return openShopee();
  if (event.target.closest('#open-whatsapp')) return $('#whatsapp-dialog').showModal();
  if (event.target.closest('#open-evolution')) return $('#evolution-dialog').showModal();
  if (event.target.closest('#new-destination')) return $('#destination-dialog').showModal();
  const group = event.target.closest('.select-group');
  if (group) { $('#destination-type').value = 'group'; $('#destination-name').value = group.dataset.name; $('#destination-number').value = group.dataset.id; $('#destination-number-label').firstChild.textContent = 'ID do grupo (…@g.us)'; $('#destination-dialog').showModal(); return; }
  if (event.target.closest('.close')) return event.target.closest('dialog').close();
  const toggle = event.target.closest('.toggle-destination');
  if (toggle) { try { await api(`/api/destinations/${toggle.dataset.id}`, { method: 'PATCH', body: '{}' }); await reload(); } catch (error) { toast(error.message, true); } }
  const remove = event.target.closest('.delete-destination');
  if (remove && confirm('Remover este destino?')) { try { await api(`/api/destinations/${remove.dataset.id}`, { method: 'DELETE' }); await reload(); } catch (error) { toast(error.message, true); } }
});
document.addEventListener('change', async event => {
  const category = event.target.closest('.destination-category');
  if (!category) return;
  try {
    await api(`/api/destinations/${category.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ categoryId: category.value }) });
    await reload(); toast('Categoria atualizada.');
  } catch (error) { toast(error.message, true); }
});
$('#load-offers').addEventListener('click', loadOffers);
$('#save-shopee').addEventListener('click', async () => { try {
  await api('/api/config/shopee', { method: 'POST', body: JSON.stringify({ appId: $('#shopee-app-id').value, secret: $('#shopee-secret').value, minDiscount: $('#min-discount').value, minPrice: $('#min-price').value, maxPrice: $('#max-price').value, preferredMaxPrice: $('#preferred-max-price').value, maxOffers: $('#max-offers').value }) });
  $('#shopee-dialog').close(); await reload(); toast('Integração Shopee salva.');
} catch (error) { toast(error.message, true); } });
$('#save-whatsapp').addEventListener('click', async () => { try {
  await api('/api/config/whatsapp', { method: 'POST', body: JSON.stringify({ token: $('#wa-token').value, phoneNumberId: $('#wa-phone-id').value, mode: $('#wa-mode').value, templateName: $('#wa-template').value }) });
  $('#whatsapp-dialog').close(); await reload(); toast('Configuração do WhatsApp salva.');
} catch (error) { toast(error.message, true); } });
async function updateDirectStatus() {
  const status = await api('/api/whatsapp-direct/status');
  $('#direct-status').textContent = status.error || (status.status === 'aguardando_qr' ? 'Aguardando leitura do QR Code…' : status.status);
  $('#direct-qr').innerHTML = status.qr ? `<img src="${status.qr}" alt="QR Code do WhatsApp">` : status.status === 'conectado' ? '✓ WhatsApp conectado com sucesso.' : status.error ? 'Não foi possível gerar o QR Code. Clique em “Gerar QR Code” para tentar novamente.' : 'Gerando QR Code…';
  if (status.status === 'aguardando_qr' || status.status === 'conectando') setTimeout(updateDirectStatus, 1800);
  await reload();
}
$('#start-direct').addEventListener('click', async () => { try {
  $('#direct-status').textContent = 'Iniciando conexão…';
  await api('/api/whatsapp-direct/connect', { method: 'POST', body: '{}' });
  setTimeout(updateDirectStatus, 900);
} catch (error) { toast(error.message, true); } });
$('#save-destination').addEventListener('click', async () => { try {
  await api('/api/destinations', { method: 'POST', body: JSON.stringify({ name: $('#destination-name').value, number: $('#destination-number').value, type: $('#destination-type').value, categoryId: $('#destination-category').value, consent: $('#destination-consent').checked }) });
  $('#destination-dialog').close(); $('#destination-name').value = ''; $('#destination-number').value = ''; $('#destination-category').value = 'all'; $('#destination-consent').checked = false; await reload(); toast('Destino adicionado.');
} catch (error) { toast(error.message, true); } });
$('#destination-type').addEventListener('change', () => {
  const group = $('#destination-type').value === 'group';
  $('#destination-number-label').firstChild.textContent = group ? 'ID do grupo (…@g.us)' : 'Número com DDI';
  $('#destination-number').placeholder = group ? '120363…@g.us' : '5511999999999';
});
$('#save-automation').addEventListener('click', async () => { try {
  await api('/api/automation', { method: 'POST', body: JSON.stringify({ enabled: $('#automation-enabled').checked, intervalMinutes: $('#automation-interval').value }) });
  await reload(); toast('Automação atualizada.');
} catch (error) { toast(error.message, true); } });
$('#save-safety').addEventListener('click', async () => { try {
  await api('/api/safety', { method: 'POST', body: JSON.stringify({ maxPerHour: $('#safety-hour').value, maxPerDay: $('#safety-day').value, minMinutesPerDestination: $('#safety-group-minutes').value, quietStartHour: $('#safety-quiet-start').value, quietEndHour: $('#safety-quiet-end').value }) });
  await reload(); toast('Proteções de envio atualizadas.');
} catch (error) { toast(error.message, true); } });
$('#run-now').addEventListener('click', async () => { try { const result = await api('/api/test-send', { method: 'POST', body: '{}' }); toast(`${result.found} oferta de teste enviada.`); await reload(); } catch (error) { toast(error.message, true); await reload(); } });
$('#open-account').addEventListener('click', async () => { try {
  $('#account-dialog').showModal(); $('#account-user').textContent = state.user?.username || '';
  $('#two-factor-state').textContent = state.user?.twoFactorEnabled ? '2 fatores ativado' : '2 fatores não ativado';
  $('#two-factor-setup').hidden = true;
  if (state.user?.role === 'admin') { const data = await api('/api/users'); $('#users-list').innerHTML = `<p><strong>${data.users.length}/${data.limit} usuários cadastrados</strong></p>${data.users.map(user => `<small>${escapeHtml(user.username)} · ${user.role === 'admin' ? 'administrador' : 'usuário'} · ${user.twoFactorEnabled ? '2FA ativo' : 'sem 2FA'}</small>`).join('<br>')}`; }
  else $('#users-list').innerHTML = '';
} catch (error) { toast(error.message, true); } });
$('#start-2fa').addEventListener('click', async () => { try { const data = await api('/api/auth/2fa/setup', { method: 'POST', body: '{}' }); $('#two-factor-qr').innerHTML = `<img src="${data.qr}" alt="QR Code de autenticação">`; $('#two-factor-key').textContent = data.manualKey; $('#two-factor-setup').hidden = false; } catch (error) { toast(error.message, true); } });
$('#confirm-2fa').addEventListener('click', async () => { try { await api('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: $('#two-factor-code').value }) }); $('#two-factor-setup').hidden = true; await reload(); toast('2 fatores ativado.'); } catch (error) { toast(error.message, true); } });
$('#disable-2fa').addEventListener('click', async () => { const code = window.prompt('Digite o código atual do autenticador para desativar:'); if (!code) return; try { await api('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }); await reload(); toast('2 fatores desativado.'); } catch (error) { toast(error.message, true); } });
$('#logout').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); window.location.href = '/login.html'; } catch (error) { toast(error.message, true); } });
reload().catch(error => toast(error.message, true));
setInterval(() => { if (state.automation?.enabled) renderDestinations(); }, 30_000);
// Mantém métricas, próximos envios, grupos e atividades atualizados sem F5.
// Não consulta a Shopee em segundo plano: a busca de ofertas continua ocorrendo
// somente em envios automáticos ou quando o usuário pede uma prévia.
setInterval(backgroundRefresh, 20_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') backgroundRefresh(); });
