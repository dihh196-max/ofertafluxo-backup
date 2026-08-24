export async function sendEvolutionOffer(offerText, settings, fetcher = fetch) {
  if (!settings.url || !settings.apiKey || !settings.instanceName) {
    throw new Error('Configure URL, chave da API e nome da instância da Evolution API.');
  }
  if (!settings.targets?.length) throw new Error('Adicione ao menos um destino ativo para a Evolution API.');
  const endpoint = `${settings.url.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(settings.instanceName)}`;
  const results = [];
  for (const number of settings.targets) {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: settings.apiKey },
      body: JSON.stringify({ number, textMessage: { text: offerText }, linkPreview: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Evolution API recusou o envio para ${number}: ${JSON.stringify(body)}`);
    results.push(body);
  }
  return results;
}
