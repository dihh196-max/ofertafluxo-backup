import crypto from 'node:crypto';
import fs from 'node:fs';

function signature(appId, timestamp, body, secret) {
  return crypto.createHash('sha256').update(`${appId}${timestamp}${body}${secret}`).digest('hex');
}

async function queryShopee(settings, queryPath, variables = {}, fetcher = fetch) {
  if (!settings.url || !settings.appId || !settings.secret) {
    throw new Error('Configure SHOPEE_API_URL, SHOPEE_APP_ID e SHOPEE_SECRET.');
  }
  const query = fs.readFileSync(queryPath, 'utf8');
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

export function getShopeeOffers(settings, variables = {}, fetcher = fetch) {
  return queryShopee(settings, settings.queryPath, variables, fetcher);
}

// A lista de ofertas relâmpago usa uma query independente. Caso a conta ainda
// não tenha esse recurso liberado no Open API Explorer, o chamador continua
// enviando as ofertas normais sem parar a automação.
export function getShopeeFlashOffers(settings, variables = {}, fetcher = fetch) {
  return queryShopee(settings, settings.flashQueryPath, variables, fetcher);
}
