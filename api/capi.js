import crypto from 'crypto';

const PIXEL_ID = '26526640770318634'; 
const ACCESS_TOKEN = 'EAALT3tlhOToBRdiIRLKHxcks5BCT1Lqns3jO4HoZAtSWn7NzBBpD3421vh6MbZBxZC9jgsJZBVG7MO1wn9ft2dYQPPe3uczkcjxNQ3c2eLBKflseuWcHbZA5k9m9wR8zoiQ3oVRHfd7KUmbN0esjmFdPwMuFHtuIXGpvTwEyUCLNGxL37m6jOXxhbrtNYRpYjywZDZD';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // ── IP ──
  const ip = (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    ''
  ).split(',')[0].trim();

  // ── USER AGENT ──
  const user_agent = data.user_agent || req.headers['user-agent'] || '';

  // ── EVENT SOURCE URL ──
  const page_url = data.page_url || '';
  const referer  = req.headers['referer'] || '';
  const host     = req.headers['host'] || '';
  const event_source_url = page_url || referer || `https://${host}`;

  // ── HASH DATA ──
  function hashValue(value) {
    if (!value) return null;
    const str = String(value).trim().toLowerCase();
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  // Email hasheado
  const email_raw  = (data.email || '').trim().toLowerCase();
  const email_hash = email_raw && email_raw.includes('@')
    ? hashValue(email_raw)
    : null;

  // Telefone hasheado (somente dígitos)
  const phone_raw  = (data.phone || '').replace(/\D/g, '');
  const phone_hash = phone_raw.length >= 10
    ? hashValue(phone_raw)
    : null;

  // CPF hasheado (somente dígitos)
  const cpf_raw  = (data.cpf || '').replace(/\D/g, '');
  const cpf_hash = cpf_raw.length === 11
    ? hashValue(cpf_raw)
    : null;

  // Nome hasheado
  const name_raw  = (data.name || '').trim();
  const name_hash = name_raw.length > 0
    ? hashValue(name_raw)
    : null;

  // ── EVENT ──
  const event_name = data.event_name || 'Lead';
  const event_id   = data.event_id   || ('eid_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex'));
  const event_time = Math.floor(Date.now() / 1000);

  // ── FBP / FBC ──
  const fbp_raw = data.fbp || '';
  const fbc_raw = data.fbc || '';
  const fbp = fbp_raw.startsWith('fb.1.') ? fbp_raw.trim() : null;
  const fbc = fbc_raw.startsWith('fb.1.') ? fbc_raw.trim() : null;

  // ── USER DATA ──
  const user_data = {
    client_user_agent: user_agent,
    client_ip_address: ip,
  };
  
  // Adiciona hashes quando disponíveis
  if (email_hash) user_data.em = [email_hash];
  if (phone_hash) user_data.ph = [phone_hash];
  if (cpf_hash) user_data.external_id = [cpf_hash];
  if (name_hash) user_data.fn = [name_hash];
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  // ── CUSTOM DATA ──
  const custom_data = {
    content_name: data.content_name || event_name,
  };
  
  const value = parseFloat(String(data.value || '').replace(',', '.'));
  if (value > 0) {
    custom_data.value    = value;
    custom_data.currency = data.currency || 'BRL';
  }

  // Log para debug (remover em produção)
  console.log(`[CAPI] Event: ${event_name} | Email: ${email_raw} | Phone: ${phone_raw} | CPF: ${cpf_raw} | Value: ${value}`);

  // ── PAYLOAD ──
  const payload = {
    data: [{
      event_name:       event_name,
      event_time:       event_time,
      event_id:         event_id,
      action_source:    'website',
      event_source_url: event_source_url,
      user_data,
      custom_data,
    }],
  };

  const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

  try {
    const fbRes  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const fbBody = await fbRes.json();

    if (!fbRes.ok) {
      console.error(`CAPI ERROR [${event_name}]:`, JSON.stringify(fbBody));
      return res.status(fbRes.status).json({ 
        success: false, 
        error: fbBody,
        event_sent: event_name 
      });
    }

    console.log(`[CAPI SUCCESS] ${event_name} enviado para Facebook`);
    return res.status(200).json({ 
      success: true, 
      message: 'Event sent successfully',
      event_name: event_name,
      fbevent_id: fbBody.events?.[0]?.event_id
    });

  } catch (err) {
    console.error('CAPI fetch error:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Fetch error', 
      detail: err.message 
    });
  }
}
