export async function sendWhatsAppOffer(offerText, settings, fetcher = fetch) {
  if (!settings.token || !settings.phoneNumberId || !settings.recipients.length) {
    throw new Error('Configure token, phoneNumberId e ao menos um destinatário do WhatsApp.');
  }
  const url = `https://graph.facebook.com/v24.0/${settings.phoneNumberId}/messages`;
  const results = [];
  for (const to of settings.recipients) {
    const message = settings.mode === 'template'
      ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: settings.templateName, language: { code: settings.templateLanguage } } }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: offerText } };
    const response = await fetcher(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${settings.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(message)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`WhatsApp recusou o envio para ${to}: ${JSON.stringify(json)}`);
    results.push(json);
  }
  return results;
}
