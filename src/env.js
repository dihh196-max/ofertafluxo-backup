import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function config() {
  let extraHeaders = {};
  try { extraHeaders = JSON.parse(process.env.SHOPEE_EXTRA_HEADERS || '{}'); } catch {
    throw new Error('SHOPEE_EXTRA_HEADERS precisa ser um JSON válido.');
  }
  return {
    shopee: {
      url: process.env.SHOPEE_API_URL,
      appId: process.env.SHOPEE_APP_ID,
      secret: process.env.SHOPEE_SECRET,
      extraHeaders,
      queryPath: path.resolve(process.env.SHOPEE_QUERY_PATH || './config/shopee-offers.graphql')
    },
    filters: {
      minDiscount: Number(process.env.MIN_DISCOUNT_PERCENT || 0),
      minPrice: Number(process.env.MIN_PRICE || 0),
      maxPrice: Number(process.env.MAX_PRICE || Number.MAX_SAFE_INTEGER),
      maxOffers: Number(process.env.MAX_OFFERS_PER_RUN || 5),
      preferredMaxPrice: Number(process.env.PREFERRED_MAX_PRICE || 80)
    },
    whatsapp: {
      token: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      recipients: (process.env.WHATSAPP_RECIPIENTS || '').split(',').map(v => v.trim()).filter(Boolean),
      mode: process.env.WHATSAPP_MODE || 'text',
      templateName: process.env.WHATSAPP_TEMPLATE_NAME,
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR'
    },
    evolution: {
      enabled: process.env.EVOLUTION_ENABLED === 'true',
      url: process.env.EVOLUTION_API_URL,
      apiKey: process.env.EVOLUTION_API_KEY,
      instanceName: process.env.EVOLUTION_INSTANCE_NAME
    },
    runSecret: process.env.RUN_SECRET,
    port: Number(process.env.PORT || 3000),
    host: process.env.PANEL_HOST || '127.0.0.1',
    allowedOrigins: (process.env.PANEL_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    panelAccessKey: process.env.PANEL_ACCESS_KEY || ''
  };
}
