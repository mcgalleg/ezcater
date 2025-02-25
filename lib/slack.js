async function sendToSlack(blocks) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL is not defined in environment variables.');
    }
  
    const payload = { blocks };
  
    try {
      // Debug log: display payload and masked webhook URL
      console.debug('Sending message to Slack. Payload:', JSON.stringify(payload), 'Webhook URL:', webhookUrl.substring(0, 10) + '...');
  
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
  
      if (!response.ok) {
        throw new Error(`Error sending message to Slack: ${response.status} ${response.statusText}`);
      }
  
      console.debug('Slack message sent successfully.');
      return response;
    } catch (error) {
      console.error('Error sending to Slack:', error);
      throw error;
    }
  }
  
  export { sendToSlack };