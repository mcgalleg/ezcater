// pages/api/webhook.js
import { sql } from '@vercel/postgres';
import { createHmac } from 'crypto';
import { processWebhookData } from '../../lib/helpers';

// Helper to get raw body (since signature verification needs unparsed payload)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the signature header
  const signatureHeader = req.headers['x-ezcater-signature'];
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing signature header' });
  }

  // Extract timestamp and signature
  const [timestamp, signature] = signatureHeader.split('.');
  if (!timestamp || !signature) {
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  // Get raw body for signature verification
  const rawBody = await getRawBody(req);
  const payload = JSON.parse(rawBody); // Parse for further processing

  // Verify the signature
  const secret = process.env.WEBHOOK_SECRET;
  const computedPayload = `${timestamp}.${rawBody}`;
  const computedSignature = createHmac('sha256', secret)
    .update(computedPayload)
    .digest('hex');

  if (computedSignature !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Optional: Check timestamp to prevent replay attacks (e.g., within 5 minutes)
  const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
  const fiveMinutes = 5 * 60;
  if (Math.abs(now - parseInt(timestamp, 10)) > fiveMinutes) {
    return res.status(401).json({ error: 'Timestamp too old or invalid' });
  }

  // Store and process the payload
  try {
    await sql`
      INSERT INTO webhook_requests (id, parent_type, parent_id, entity_type, entity_id, key, occurred_at)
      VALUES (
        ${payload.id},
        ${payload.parent_type},
        ${payload.parent_id},
        ${payload.entity_type},
        ${payload.entity_id},
        ${payload.key},
        ${payload.occurred_at}
      )
      ON CONFLICT (id) DO NOTHING
    `;

    // Process the payload (e.g., with your helper function)
    //const result = await processWebhookData(payload);

    res.status(200).json({ message: 'Webhook processed and stored', result });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Failed to process or store webhook' });
  }
}

// Disable Next.js default body parsing to get raw body
export const config = {
  api: {
    bodyParser: false,
  },
};