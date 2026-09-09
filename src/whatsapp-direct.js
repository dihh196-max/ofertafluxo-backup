import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const authDir = userId => path.resolve('data/users', String(userId), 'whatsapp-session');
const connections = new Map();
const normalizedJid = jid => String(jid || '').replace(/:\d+(?=@)/, '');
const jidValues = value => new Set(
  [value?.id, value?.lid, value?.phoneNumber, value]
    .filter(Boolean)
    .map(normalizedJid)
);
const sharesJid = (left, right) => {
  const leftValues = jidValues(left); const rightValues = jidValues(right);
  return [...leftValues].some(value => rightValues.has(value));
};
const isAdministrator = (group, ownUser) => {
  const isOwner = sharesJid(group?.owner, ownUser) || sharesJid(group?.ownerPn, ownUser);
  const isGroupAdmin = group?.participants?.some(participant =>
    sharesJid(participant, ownUser) && (participant.isAdmin || participant.isSuperAdmin || ['admin', 'superadmin'].includes(participant.admin))
  );
  return Boolean(isOwner || isGroupAdmin);
};
const directFor = userId => {
  if (!connections.has(userId)) connections.set(userId, {
    socket: null, status: 'desconectado', qr: null, error: null, groups: [],
    connectingSince: 0, retryTimer: null, pairing: false, lastDisconnectCode: null
  });
  return connections.get(userId);
};

export function directWhatsAppState(userId) {
  const direct = directFor(userId);
  return {
    status: direct.status, qr: direct.qr, error: direct.error, pairing: direct.pairing,
    groups: direct.groups.map(({ id, subject }) => ({ id, subject }))
  };
}
export async function refreshDirectWhatsAppGroups(userId) {
  const direct = directFor(userId);
  if (!direct.socket || direct.status !== 'conectado') return directWhatsAppState(userId);
  try {
    const groups = Object.values(await direct.socket.groupFetchAllParticipating());
    direct.groups = groups.filter(group => isAdministrator(group, direct.socket.user));
    direct.error = null;
  } catch {
    // Mantém a última lista boa; uma falha transitória não deve apagar grupos
    // já identificados do painel.
  }
  return directWhatsAppState(userId);
}
async function resetDirectSession(userId, direct) {
  if (direct.retryTimer) clearTimeout(direct.retryTimer);
  direct.retryTimer = null;
  const previousSocket = direct.socket;
  direct.socket = null;
  direct.status = 'desconectado';
  direct.qr = null;
  direct.error = null;
  direct.groups = [];
  direct.connectingSince = 0;
  direct.pairing = false;
  direct.lastDisconnectCode = null;
  // Fecha apenas o cliente local; a desvinculação é feita pelo usuário no celular
  // caso ele queira removê-la também da lista de dispositivos conectados.
  try { await previousSocket?.end(new Error('Nova conexão por QR solicitada')); } catch { /* conexão já encerrada */ }
  fs.rmSync(authDir(userId), { recursive: true, force: true });
}

export async function connectDirectWhatsApp(userId, { forceNewQr = false } = {}) {
  const direct = directFor(userId);
  if (forceNewQr) await resetDirectSession(userId, direct);
  if (direct.status === 'conectado' && !forceNewQr) return directWhatsAppState(userId);
  // Uma tentativa antiga que não produziu QR não pode deixar o painel travado.
  if (direct.status === 'conectando' && Date.now() - direct.connectingSince < 45_000) return directWhatsAppState(userId);
  direct.status = 'conectando'; direct.connectingSince = Date.now(); direct.error = null; direct.qr = null; direct.pairing = false;
  const { state, saveCreds } = await useMultiFileAuthState(authDir(userId));
  const socket = makeWASocket({ auth: state, browser: Browsers.windows('OfertaFluxo'), logger: pino({ level: 'silent' }), markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: true, connectTimeoutMs: 30_000, qrTimeout: 30_000 });
  direct.socket = socket;
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Eventos de sockets substituídos não podem sobrescrever o QR novo.
    if (direct.socket !== socket) return;
    if (qr) {
      try {
        direct.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
        direct.status = 'aguardando_qr'; direct.error = null; direct.pairing = false;
      } catch { direct.status = 'desconectado'; direct.error = 'Não foi possível preparar o QR Code. Tente gerar um novo código.'; }
    }
    if (connection === 'open') {
      direct.status = 'conectado'; direct.qr = null; direct.error = null; direct.connectingSince = 0; direct.pairing = false; direct.lastDisconnectCode = null;
      await refreshDirectWhatsAppGroups(userId);
    }
    if (connection === 'close') {
      if (direct.socket !== socket) return;
      direct.socket = null; direct.qr = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      direct.lastDisconnectCode = code || null;
      // Após a leitura do QR o WhatsApp fecha o primeiro socket com 515. Isso é
      // esperado: as credenciais já foram gravadas e basta criar o socket final.
      if (code === DisconnectReason.restartRequired) {
        direct.status = 'conectando'; direct.pairing = true; direct.error = null; direct.connectingSince = 0;
        direct.retryTimer = setTimeout(() => connectDirectWhatsApp(userId).catch(() => {
          direct.status = 'desconectado'; direct.pairing = false;
          direct.error = 'Não foi possível finalizar a conexão após a leitura do QR. Gere um novo código e tente novamente.';
        }), 800);
        return;
      }
      direct.status = 'desconectado'; direct.pairing = false;
      const requiresNewQr = [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.connectionReplaced,
        DisconnectReason.multideviceMismatch,
        DisconnectReason.forbidden
      ].includes(code);
      direct.error = requiresNewQr
        ? 'A sessão não foi validada pelo WhatsApp. Gere um novo QR Code e confira se o celular possui conexão.'
        : 'A conexão do WhatsApp foi interrompida. Tentaremos reconectar automaticamente.';
      // Não fique recriando sockets em paralelo: o botão "Gerar QR Code" cria
      // uma sessão limpa quando uma sessão anterior foi invalidada.
      if (!requiresNewQr) {
        direct.retryTimer = setTimeout(() => connectDirectWhatsApp(userId).catch(() => {
          direct.error = 'Não foi possível restabelecer a conexão do WhatsApp. Gere um novo QR Code.';
        }), 4000);
      }
    }
  });
  return directWhatsAppState(userId);
}
export async function sendDirectWhatsAppOffer(userId, offer, text, targets) {
  const direct = directFor(userId);
  if (!direct.socket || direct.status !== 'conectado') throw new Error('Conecte o WhatsApp pelo QR Code antes de enviar.');
  if (!targets?.length) throw new Error('Adicione ao menos um destino ativo.');
  const results = [];
  for (const target of targets) {
    const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
    const content = offer.image ? { image: { url: offer.image }, caption: text } : { text, linkPreview: true };
    results.push(await direct.socket.sendMessage(jid, content));
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return results;
}
export function directSessionExists(userId) { return fs.existsSync(authDir(userId)); }
