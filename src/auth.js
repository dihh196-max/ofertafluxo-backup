import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

const dataDir = path.resolve('data');
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const keyFile = path.join(dataDir, 'auth-key');
const pending = new Map();
const attempts = new Map();
const sessionHours = 8;
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); };
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const timingEqual = (left, right) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && crypto.timingSafeEqual(a, b); };
function users() { return readJson(usersFile, []); }
function saveUsers(value) { writeJson(usersFile, value); }
function sessions() { return readJson(sessionsFile, []); }
function saveSessions(value) { writeJson(sessionsFile, value); }
function masterKey() {
  if (!fs.existsSync(keyFile)) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600 }); }
  return fs.readFileSync(keyFile);
}
function encrypt(value) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decrypt(value) {
  const [iv, tag, encrypted] = String(value).split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url');
  return `${salt}.${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split('.');
  if (!salt || !expected) return false;
  return timingEqual(passwordHash(password, salt).split('.')[1], expected);
}
function cleanUsername(value) { return String(value || '').trim().toLowerCase(); }
function validPassword(value) { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
function userView(user) { return { id: user.id, username: user.username, role: user.role, twoFactorEnabled: Boolean(user.twoFactorEnabled), createdAt: user.createdAt }; }
function checkAttempts(username) {
  const now = Date.now(); const values = (attempts.get(username) || []).filter(at => now - at < 15 * 60_000);
  attempts.set(username, values); if (values.length >= 5) throw new Error('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
}
function failedAttempt(username) { attempts.set(username, [...(attempts.get(username) || []), Date.now()]); }
function base32Encode(buffer) { let bits = 0; let value = 0; let output = ''; for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += base32Alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) output += base32Alphabet[(value << (5 - bits)) & 31]; return output; }
function base32Decode(value) { let bits = 0; let current = 0; const bytes = []; for (const char of String(value).toUpperCase().replace(/[^A-Z2-7]/g, '')) { current = (current << 5) | base32Alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((current >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(bytes); }
function totp(secret, time = Date.now()) { const counter = Math.floor(time / 30_000); const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter)); const mac = crypto.createHmac('sha1', base32Decode(secret)).update(input).digest(); const offset = mac.at(-1) & 15; return String(((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }
function verifyTotp(secret, code) { return [-30_000, 0, 30_000].some(offset => timingEqual(totp(secret, Date.now() + offset), String(code || '').replace(/\s/g, ''))); }

export function usersCount() { return users().length; }
export function registerUser({ username, password }) {
  const name = cleanUsername(username); const all = users();
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) throw new Error('Use um usuário de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.');
  if (!validPassword(password)) throw new Error('Use uma senha com pelo menos 12 caracteres.');
  if (all.length >= 3) throw new Error('O limite de 3 usuários da plataforma foi atingido.');
  if (all.some(user => user.username === name)) throw new Error('Este usuário já existe.');
  const user = { id: crypto.randomUUID(), username: name, passwordHash: passwordHash(password), role: all.length ? 'member' : 'admin', twoFactorEnabled: false, twoFactorSecret: null, createdAt: new Date().toISOString() };
  all.push(user); saveUsers(all); return userView(user);
}
export function beginLogin({ username, password }) {
  const name = cleanUsername(username); checkAttempts(name); const user = users().find(item => item.username === name);
  if (!user || !verifyPassword(password, user.passwordHash)) { failedAttempt(name); throw new Error('Usuário ou senha inválidos.'); }
  attempts.delete(name);
  if (user.twoFactorEnabled) { const token = crypto.randomBytes(32).toString('base64url'); pending.set(token, { userId: user.id, expiresAt: Date.now() + 5 * 60_000 }); return { requiresTwoFactor: true, pendingToken: token }; }
  return { user: userView(user), session: createSession(user.id) };
}
export function finishTwoFactor({ pendingToken, code }) {
  const pendingLogin = pending.get(String(pendingToken)); pending.delete(String(pendingToken));
  if (!pendingLogin || pendingLogin.expiresAt < Date.now()) throw new Error('A validação expirou. Entre novamente.');
  const user = users().find(item => item.id === pendingLogin.userId);
  if (!user || !user.twoFactorEnabled || !verifyTotp(decrypt(user.twoFactorSecret), code)) throw new Error('Código de verificação inválido.');
  return { user: userView(user), session: createSession(user.id) };
}
function createSession(userId) { const token = crypto.randomBytes(32).toString('base64url'); const all = sessions().filter(session => new Date(session.expiresAt) > new Date()); all.push({ tokenHash: tokenHash(token), userId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + sessionHours * 60 * 60_000).toISOString() }); saveSessions(all); return token; }
export function userFromSession(token) { if (!token) return null; const now = new Date(); const allSessions = sessions().filter(session => new Date(session.expiresAt) > now); saveSessions(allSessions); const session = allSessions.find(item => timingEqual(item.tokenHash, tokenHash(token))); if (!session) return null; const user = users().find(item => item.id === session.userId); return user ? userView(user) : null; }
export function destroySession(token) { saveSessions(sessions().filter(session => !timingEqual(session.tokenHash, tokenHash(token)))); }
export async function setupTwoFactor(userId) { const all = users(); const user = all.find(item => item.id === userId); if (!user) throw new Error('Usuário não encontrado.'); const secret = base32Encode(crypto.randomBytes(20)); const label = encodeURIComponent(`OfertaFluxo:${user.username}`); const uri = `otpauth://totp/${label}?secret=${secret}&issuer=OfertaFluxo&algorithm=SHA1&digits=6&period=30`;
  user.pendingTwoFactorSecret = encrypt(secret); saveUsers(all); return { qr: await QRCode.toDataURL(uri, { width: 240, margin: 1 }), manualKey: secret };
}
export function enableTwoFactor(userId, code) { const all = users(); const user = all.find(item => item.id === userId); if (!user?.pendingTwoFactorSecret || !verifyTotp(decrypt(user.pendingTwoFactorSecret), code)) throw new Error('Código inválido. Escaneie o QR Code e tente novamente.'); user.twoFactorSecret = user.pendingTwoFactorSecret; delete user.pendingTwoFactorSecret; user.twoFactorEnabled = true; saveUsers(all); return userView(user); }
export function disableTwoFactor(userId, code) { const all = users(); const user = all.find(item => item.id === userId); if (!user?.twoFactorEnabled || !verifyTotp(decrypt(user.twoFactorSecret), code)) throw new Error('Código inválido.'); user.twoFactorEnabled = false; user.twoFactorSecret = null; delete user.pendingTwoFactorSecret; saveUsers(all); return userView(user); }
export function listUsers(requester) { if (requester.role !== 'admin') throw new Error('Apenas o administrador pode ver usuários.'); return users().map(userView); }
export function allUsers() { return users().map(userView); }
export function userById(id) { const user = users().find(item => item.id === id); return user ? userView(user) : null; }
