// pages/api/webhook.js
import { sql } from '@vercel/postgres';
import { createHmac } from 'crypto';
import { processWebhookData } from '../../lib/helpers';
import { callGrokApiWithOrder } from '../../lib/grok';
import { uploadMarkdownToGoogleDrive, formatOrderAsMarkdown } from '../../lib/googleDrive';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  console.debug("Starting to read raw body");
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    req.on('data', chunk => {
      console.debug(`Received body chunk of size: ${chunk.length}`);
      chunks.push(chunk);
    });

    req.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyString = bodyBuffer.toString('utf8');
      console.debug(`Finished reading body, total size: ${bodyString.length}`);
      resolve(bodyString);
    });

    req.on('error', err => {
      console.error("Error reading request body:", err);
      reject(err);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.debug("Received webhook request", { method: req.method, headers: req.headers });

  const signatureHeader = req.headers['x-ezcater-signature'];
  if (!signatureHeader) {
    console.debug("Missing signature header");
    return res.status(401).json({ error: 'Missing signature header' });
  }

  const [timestamp, signature] = signatureHeader.split('.');
  if (!timestamp || !signature) {
    console.debug("Invalid signature format");
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error("Failed to read raw body:", error);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
    if (!payload || typeof payload !== 'object') {
      console.error("Invalid JSON payload format");
      return res.status(400).json({ error: 'Invalid JSON payload format' });
    }
    
    // Add detailed payload logging
    console.debug("Parsed webhook payload:", {
      id: payload.id,
      parent_type: payload.parent_type,
      parent_id: payload.parent_id,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      key: payload.key
    });
  } catch (error) {
    console.error("Failed to parse JSON payload:", error);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  if (!payload.id || !payload.entity_id) {
    console.error("Missing required payload fields", { 
      hasId: !!payload.id, 
      hasEntityId: !!payload.entity_id 
    });
    return res.status(400).json({ error: 'Missing required payload fields' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error("WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const computedPayload = `${timestamp}.${rawBody}`;
  const computedSignature = createHmac('sha256', secret)
    .update(computedPayload)
    .digest('hex');

  if (computedSignature !== signature) {
    console.debug("Signature verification failed");
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const now = Math.floor(Date.now() / 1000);
  const fiveMinutes = 5 * 60;
  const timestampDiff = Math.abs(now - parseInt(timestamp, 10));
  
  if (timestampDiff > fiveMinutes) {
    console.debug("Timestamp too old");
    return res.status(401).json({ error: 'Timestamp too old or invalid' });
  }

  try {
    // Store webhook request
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
    console.debug("Webhook request stored successfully");

    // Process webhook data using helper
    const result = await processWebhookData(payload);
    console.debug("Webhook processing result:", result);

    // Check if processing failed
    if (result.error) {
      console.error("Webhook processing error:", result.error);
      return res.status(500).json({ 
        message: result.message,
        error: result.error 
      });
    }

    let grokResult = null;
    if (result.data?.order) {
      grokResult = await callGrokApiWithOrder(result.data.order);
      console.debug("Grok API response:", grokResult);

      let jsonData;
      try {
        jsonData = JSON.parse(grokResult.content);
      } catch (error) {
        console.error("Failed to parse Grok response:", error);
        
        // Create a markdown file with the raw content
        const orderData = result.data.order;
        const markdownContent = formatOrderAsMarkdown(orderData, grokResult);
        
        // Generate a filename with order number and timestamp
        const orderNumber = orderData.orderNumber || 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `Order_${orderNumber}_${timestamp}.md`;
        
        // Upload to Google Drive
        const uploadResult = await uploadMarkdownToGoogleDrive(markdownContent, fileName);
        console.debug("Markdown file uploaded to Google Drive:", uploadResult);
        
        return res.status(200).json({ 
          message: 'Webhook processed but Grok response parsing failed. Markdown file uploaded to Google Drive.', 
          result, 
          grokResult,
          driveFile: uploadResult
        });
      }

      // Format the order data as markdown
      const orderData = result.data.order;
      const markdownContent = formatOrderAsMarkdown(orderData, grokResult);
      
      // Generate a filename with order number and timestamp
      const orderNumber = orderData.orderNumber || 'unknown';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Order_${orderNumber}_${timestamp}.md`;
      
      // Upload to Google Drive
      const uploadResult = await uploadMarkdownToGoogleDrive(markdownContent, fileName);
      console.debug("Markdown file uploaded to Google Drive:", uploadResult);
    }

    return res.status(200).json({ 
      message: result.message || 'Webhook processed successfully', 
      result, 
      grokResult 
    });

  } catch (error) {
    console.error('Webhook handling error:', error);
    return res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message 
    });
  }
}