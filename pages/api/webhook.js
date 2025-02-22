// pages/api/webhook.js
import { processWebhookData } from '../../lib/helpers';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the webhook request (example using a secret header)
  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Process the webhook payload
  const payload = req.body;
  try {
    const result = await processWebhookData(payload);
    res.status(200).json({ message: 'Webhook processed successfully', result });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}