import OpenAI from "openai";

async function callGrokApiWithOrder(orderData) {
  // Initialize the OpenAI client with the Grok API baseURL and API key
  const client = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });

  // Format delivery time in a readable format
  const formatDeliveryTime = (isoTime) => {
    if (!isoTime) return "Unknown";
    try {
      const date = new Date(isoTime);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch (e) {
      console.error("Error formatting time:", e);
      return isoTime;
    }
  };

  // Extract customer and delivery information
  const customerName = orderData.event?.contact?.name || "Unknown";
  const deliveryAddress = orderData.event?.address || {};
  const fullAddress = [
    deliveryAddress.name,
    deliveryAddress.street,
    deliveryAddress.street2,
    `${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}`
  ].filter(Boolean).join(", ");
  
  const deliveryTime = formatDeliveryTime(orderData.event?.timestamp);
  const handoffTime = formatDeliveryTime(orderData.event?.catererHandoffFoodTime);
  const headcount = orderData.event?.headcount || "Not specified";
  const orderType = orderData.event?.orderType || "Unknown";
  const deliveryPartner = orderData.event?.thirdPartyDeliveryPartner || "N/A";
  
  // Calculate total items
  const totalItems = orderData.catererCart?.orderItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  // Construct messages for the chat completion
  const messages = [
    {
      role: "system",
      content: "You are a JSON-only response bot specialized in catering operations. You must ALWAYS respond with valid JSON, never with plain text. Format all responses as parseable JSON objects WITHOUT markdown code blocks. Your task is to analyze catering orders and provide detailed preparation instructions for kitchen staff."
    },
    {
      role: "user",
      content: `Parse this catering order into a detailed preparation plan. The response must be ONLY valid JSON with this exact structure:
{
  "order_summary": {
    "date": "YYYY-MM-DD",
    "customer": "Customer Name",
    "delivery_address": "Full Address",
    "delivery_time": "Formatted Time",
    "handoff_time": "Formatted Time",
    "headcount": "Number or Not Specified",
    "order_type": "Delivery Type",
    "delivery_partner": "Partner Name if applicable",
    "total_items": 0,
    "special_notes": "Any special delivery instructions"
  },
  "preparation_items": [
    {
      "item": "Item Name with Customizations",
      "quantity": "X servings (Y oz per serving)",
      "container": "half deep/half shallow/black bowl/other",
      "fill_level": "1/4 full/1/2 full/3/4 full/full",
      "preparation_notes": "Detailed notes on how to prepare and package"
    }
  ],
  "utensil_summary": {
    "serving_spoons": 0,
    "tongs": 0,
    "plates": 0,
    "utensil_rolls": 0,
    "napkins": 0
  },
  "staff_instructions": "Overall instructions for staff preparing the order"
}

IMPORTANT: Return ONLY the JSON object without any markdown formatting, code blocks, or additional text.

Rules for the JSON:
1. Calculate appropriate container types and quantities based on food type and volume
2. For headcount-based items (plates, utensils), use the event headcount if available, otherwise estimate based on total servings
3. Quantity must show servings and oz per serving (e.g., "15 servings (5oz per serving)")
4. Container guidelines:
   - Half Deep Pan (11 3/4"L x 9 3/8"W x 2 9/16"H): Use for hot main dishes, rice, beans (holds ~120oz)
   - Half Shallow Pan (11 3/4"L x 9 3/8"W x 1.6875"H): Use for tortillas, chips, smaller sides (holds ~80oz)
   - Black Bowl sizes: 24oz (small), 36oz (medium), 48oz (large) - Use for cold items, salsas, toppings
5. Fill Level must specify if container is full or partially filled
6. Preparation notes should include:
   - Temperature (hot/cold/room temp)
   - Packaging method (wrapped/covered/separated)
   - Special handling instructions
7. For Mexican food items:
   - Fajitas require tongs (1 per 15 servings)
   - Tacos require serving spoons for toppings (1 per topping)
   - Rice and beans require serving spoons (1 per container)
8. Staff instructions should summarize the overall preparation approach
9. Keep preparation notes concise (under 200 characters each)

Customer Information:
- Name: ${customerName}
- Delivery Address: ${fullAddress}
- Delivery Time: ${deliveryTime}
- Handoff Time: ${handoffTime}
- Headcount: ${headcount}
- Order Type: ${orderType}
- Delivery Partner: ${deliveryPartner}
- Special Instructions: ${deliveryAddress.deliveryInstructions || "None provided"}

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

    // Extract JSON from the response, handling potential markdown code blocks
    let contentToProcess = message.content;
    
    // Check if the response is wrapped in markdown code blocks and extract the JSON
    const jsonCodeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = contentToProcess.match(jsonCodeBlockRegex);
    if (match && match[1]) {
      console.debug("Extracted JSON from markdown code block");
      contentToProcess = match[1];
    }

    // Validate that the response is JSON
    try {
      // Try parsing the content to ensure it's valid JSON
      const jsonContent = JSON.parse(contentToProcess);
      
      // Validate required fields
      if (!jsonContent.order_summary || !Array.isArray(jsonContent.preparation_items) || !jsonContent.utensil_summary) {
        throw new Error('Response missing required fields');
      }

      // If validation passes, return the processed content
      return {
        role: message.role,
        content: jsonContent
      };
    } catch (error) {
      console.error("Invalid JSON response from Grok:", error);
      // Retry the request to Grok
      console.debug("Retrying Grok API call...");
      const retryCompletion = await client.chat.completions.create({
        model: "grok-2-latest",
        messages: messages,
      });
      
      let retryContent = retryCompletion.choices[0].message.content;
      
      // Check again for markdown code blocks
      const retryMatch = retryContent.match(jsonCodeBlockRegex);
      if (retryMatch && retryMatch[1]) {
        retryContent = retryMatch[1];
      }
      
      try {
        const parsedRetryContent = JSON.parse(retryContent);
        return {
          role: retryCompletion.choices[0].message.role,
          content: parsedRetryContent
        };
      } catch (retryError) {
        console.error("Failed to parse JSON after retry:", retryError);
        throw new Error('Unable to get valid JSON response from Grok after retry');
      }
    }
  } catch (error) {
    console.error("Error calling Grok API:", error);
    throw error;
  }
}

export { callGrokApiWithOrder }; 