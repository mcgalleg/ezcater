// pages/api/webhook.js
import { processWebhookData } from '../../lib/helpers';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;

  try {
    // Store the webhook payload in the database
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
    `;

    // Process the payload (optional, based on your use case)
    const result = await processWebhookData(payload);

    res.status(200).json({ message: 'Webhook processed and stored successfully', result });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Failed to process or store webhook' });
  }
}