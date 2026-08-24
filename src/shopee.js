import crypto from 'node:crypto';
import fs from 'node:fs';

function signature(appId, timestamp, body, secret) {
  return crypto.createHash('sha256').update(`${appId}${timestamp}${body}${secret}`).digest('hex');
}

export async function getShopeeOffers(settings, variables = {}, fetcher = fetch) {
  if (!settings.url || !settings.appId || !settings.secret) {
    throw new Error('Configure SHOPEE_API_URL, SHOPEE_APP_ID e SHOPEE_SECRET.');
  }
  const query = fs.readFileSync(settings.queryPath, 'utf8');
  // A assinatura é calculada sobre exatamente a mesma string enviada no corpo.
  const body = JSON.stringify({ query, variables: { page: 1, limit: 50, keyword: null, ...variables } });
  const timestamp = Math.floor(Date.now() / 1000);
  const requestSignature = signature(settings.appId, timestamp, body, settings.secret);
  const response = await fetcher(settings.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `SHA256 Credential=${settings.appId},Timestamp=${timestamp},Signature=${requestSignature}`,
      ...settings.extraHeaders
    },
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.errors?.length) {
    throw new Error(`Shopee recusou a consulta: ${JSON.stringify(result.errors || result)}`);
  }
  return result.data;
}
