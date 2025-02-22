// lib/helpers.js
import axios from 'axios';

export async function processWebhookData(payload) {
  // Example: Extract items from the webhook payload and calculate something
  const { items } = payload;

  // Simulate processing (e.g., calling an LLM like OpenAI)
  let prompt = 'Process the following items:\n';
  items.forEach((item, index) => {
    prompt += `${index + 1}. ${item.name} - Quantity: ${item.quantity}\n`;
  });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/completions',
      {
        model: 'gpt-3.5-turbo',
        prompt,
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const result = response.data.choices[0].text.trim();
    return result;
  } catch (error) {
    console.error('Error calling API:', error);
    throw new Error('Failed to process webhook data');
  }
}