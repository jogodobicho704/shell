import crypto from 'crypto';

export default async function handler(req, res) {
  // ── HEADER CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Na Vercel, o req.body já vem parseado se o Content-Type for application/json
  const data = req.body || {};

  if (typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const pixel_id = 'SEU_PIXEL_ID';
  const access_token = 'SEU_ACCESS_TOKEN';

  // ── EXTRAÇÃO DE IP E USER AGENT ──
  let ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  ip = ip.split(',')[0].trim();

  const user_agent = data.user_agent || req.headers['user-agent'] || '';
  const page_url = data.page_url || '';
  const referer = req.headers.referer || '';
  const event_source_url = page_url ? page_url : (referer ? referer : `https://${req.headers.host}`);

  // ── TRATAMENTO DE HASH CPF ──
  const cpf_raw = (data.cpf || '').replace(/\D/g, '');
  let cpf_hash = null;
  if (cpf_raw && cpf_raw.length === 11) {
    cpf_hash = crypto.createHash('sha256').update(cpf_raw).digest('hex');
  }

  const event_name = data.event_name || 'Lead';
  const event_id = data.event_id || ('eid_' + Math.floor(Date.now() / 1000) + '_' + crypto.randomBytes(5).toString('hex'));
  const event_time = Math.floor(Date.now() / 1000);

  // ── Limpeza e Validação FBP / FBC ──
  const fbp = (data.fbp && data.fbp.startsWith('fb.1.')) ? data.fbp.trim() : null;
  const fbc = (data.fbc && data.fbc.startsWith('fb.1.')) ? data.fbc.trim() : null;

  // ── USER DATA COM MATCHING AVANÇADO ──
  const user_data = {
    client_user_agent: user_agent,
    client_ip_address: ip,
  };

  if (cpf_hash) user_data.external_id = [cpf_hash];
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  // ── CUSTOM DATA ──
  const custom_data = {
    content_name: data.content_name || event_name
  };

  if (data.value && parseFloat(data.value) > 0) {
    custom_data.value = parseFloat(String(data.value).replace(',', '.'));
    custom_data.currency = data.currency || 'BRL';
  }

  const payload = {
    data: [{
      event_name,
      event_time,
      event_id,
      action_source: 'website',
      event_source_url,
      user_data,
      custom_data
    }]
  };

  const url = `https://graph.facebook.com/v19.0/${pixel_id}/events?access_token=${access_token}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await response.text();
    const http_status = response.status;

    if (http_status < 200 || http_status >= 300) {
      console.error(`CAPI ERROR [${event_name}]: ${responseData}`);
    }

    return res.status(200).send(responseData);
  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).json({ error: 'Fetch error', detail: error.message });
  }
}
