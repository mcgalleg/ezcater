import OpenAI from "openai";

async function callGrokApiWithOrder(orderData) {
  // Initialize the OpenAI client with the Grok API baseURL and API key
  const client = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });

  // Construct messages for the chat completion
  const messages = [
    {
      role: "system",
      content: "You are a JSON-only response bot. You must ALWAYS respond with valid JSON, never with plain text. Format all responses as parseable JSON objects.",
    },
    {
      role: "user",
      content: `Parse this catering order into JSON format. The response must be ONLY valid JSON with this exact structure:
{
  "date": "YYYY-MM-DD",
  "pickupTime": "HH:MM AM/PM",
  "table": [
    {
      "Item": "Item Name",
      "Quantity": "X servings (Y oz per serving)",
      "Pan Type": "half deep/half shallow/black bowl",
      "Fill Level": "1/4 full/1/2 full/3/4 full/full"
    }
  ],
  "utensil_summary": {
    "serving_spoons": 0,
    "tongs": 0,
    "plates": 0,
    "utensil_rolls": 0
  }
}

Rules for the JSON:
1. Use headcount only for plates and utensil rolls
2. Quantity must show servings and oz per serving (e.g., "15 servings (5oz per serving)")
3. Use catering pans for hot food, black bowls for cold fixings
4. Fill Level must specify if pan/bowl is full or partially filled
5. Pan sizes: Half Deep=11 3/4"L x 9 3/8"W x 2 9/16"H, Half Shallow=11 3/4"L x 9 3/8"W x 1.6875"H
6. Black Bowl sizes: 24oz, 36oz, 48oz
7. Fajitas are served with tongs
8. Fixings are provided in specialInstructions

Order Data:
${JSON.stringify(orderData, null, 2)}`,
    },
  ];

  try {
    // Call the Grok API using the chat completions endpoint
    const completion = await client.chat.completions.create({
      model: "grok-2-latest",
      messages: messages,
    });
    
    const message = completion.choices[0].message;
    console.log("Grok API raw response:", message);

    // Validate that the response is JSON
    try {
      // Try parsing the content to ensure it's valid JSON
      const jsonContent = JSON.parse(message.content);
      
      // Validate required fields
      if (!jsonContent.date || !jsonContent.pickupTime || !Array.isArray(jsonContent.table) || !jsonContent.utensil_summary) {
        throw new Error('Response missing required fields');
      }

      // If validation passes, return the original message
      return message;
    } catch (error) {
      console.error("Invalid JSON response from Grok:", error);
      // Retry the request to Grok
      console.debug("Retrying Grok API call...");
      const retryCompletion = await client.chat.completions.create({
        model: "grok-2-latest",
        messages: messages,
      });
      return retryCompletion.choices[0].message;
    }
  } catch (error) {
    console.error("Error calling Grok API:", error);
    throw error;
  }
}

export { callGrokApiWithOrder }; 