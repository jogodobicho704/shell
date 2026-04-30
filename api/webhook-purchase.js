// ENDPOINT: /api/webhook-purchase (Vercel/Node.js)
import crypto from 'crypto';

const PIXEL_ID = '26526640770318634';
const ACCESS_TOKEN = 'EAALT3tlhOToBRdiIRLKHxcks5BCT1Lqns3jO4HoZAtSWn7NzBBpD3421vh6MbZBxZC9jgsJZBVG7MO1wn9ft2dYQPPe3uczkcjxNQ3c2eLBKflseuWcHbZA5k9m9wR8zoiQ3oVRHfd7KUmbN0esjmFdPwMuFHtuIXGpvTwEyUCLNGxL37m6jOXxhbrtNYRpYjywZDZD';

function hashValue(value) {
    if (!value) return null;
    const str = String(value).trim().toLowerCase();
    return crypto.createHash('sha256').update(str).digest('hex');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const data = req.body;

    console.log('[WEBHOOK] Purchase recebido:', data);

    // Extrai dados da transação
    const customer = data.customer || {};
    const transaction = data.transaction || {};
    const status = transaction.payment_status || 'pending';

    // Só processa se pagamento foi aprovado
    if (status !== 'paid' && status !== 'approved' && status !== 'completed' && status !== 'concluida') {
        return res.status(200).json({ received: true, processed: false });
    }

    // Hash dos dados
    const email_hash = customer.email ? hashValue(customer.email) : null;
    const phone_hash = customer.phone_number ? hashValue(customer.phone_number.replace(/\D/g, '')) : null;
    const cpf_hash = customer.document ? hashValue(customer.document.replace(/\D/g, '')) : null;
    const name_hash = customer.name ? hashValue(customer.name) : null;

    // User data
    const user_data = {};
    if (email_hash) user_data.em = [email_hash];
    if (phone_hash) user_data.ph = [phone_hash];
    if (cpf_hash) user_data.external_id = [cpf_hash];
    if (name_hash) user_data.fn = [name_hash];

    // Custom data
    const custom_data = {
        content_name: transaction.product_name || 'Purchase',
        value: transaction.amount / 100 || 0,
        currency: 'BRL'
    };

    // Tracking params
    const tracking = data.tracking || {};
    const trackingParams = new URLSearchParams();
    if (tracking.utm_source) trackingParams.append('utm_source', tracking.utm_source);
    if (tracking.utm_medium) trackingParams.append('utm_medium', tracking.utm_medium);
    if (tracking.utm_campaign) trackingParams.append('utm_campaign', tracking.utm_campaign);
    if (tracking.fbclid) trackingParams.append('fbclid', tracking.fbclid);

    const event_source_url = trackingParams.toString() 
        ? `https://seu-dominio.com?${trackingParams.toString()}`
        : 'https://seu-dominio.com';

    // Payload CAPI
    const payload = {
        data: [{
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: transaction.id || `pix_${Date.now()}`,
            action_source: 'website',
            event_source_url,
            user_data,
            custom_data,
        }]
    };

    try {
        const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
        const fbRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const fbBody = await fbRes.json();

        if (!fbRes.ok) {
            console.error('[WEBHOOK] CAPI error:', fbBody);
            return res.status(200).json({ received: true, processed: true, capiError: true });
        }

        console.log('[WEBHOOK] Purchase enviado para Facebook com sucesso');
        return res.status(200).json({ received: true, processed: true, capiSuccess: true });

    } catch (err) {
        console.error('[WEBHOOK] Erro ao enviar Purchase:', err);
        return res.status(200).json({ received: true, processed: false, error: err.message });
    }
}
