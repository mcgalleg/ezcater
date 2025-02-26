// lib/notion.js
import { Client } from '@notionhq/client';

/**
 * Initializes and returns a Notion client
 * @returns {Client} Authenticated Notion client
 */
function getNotionClient() {
  // Check for required environment variables
  const notionToken = process.env.NOTION_API_KEY;
  if (!notionToken) {
    throw new Error('NOTION_API_KEY environment variable is not set');
  }

  try {
    // Create a new Notion client
    const notion = new Client({ auth: notionToken });
    return notion;
  } catch (error) {
    console.error('Error creating Notion client:', error);
    throw new Error(`Failed to create Notion client: ${error.message}`);
  }
}

/**
 * Extracts the UUID portion from a Notion database URL or ID
 * @param {string} databaseId - The database ID or URL
 * @returns {string} The extracted UUID
 */
function extractDatabaseUuid(databaseId) {
  // If it's already a UUID (32 chars with optional hyphens), return it
  if (/^[0-9a-f]{32}$/i.test(databaseId.replace(/-/g, ''))) {
    return databaseId;
  }
  
  // If it's a URL, extract the UUID portion
  const uuidMatch = databaseId.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch && uuidMatch[1]) {
    return uuidMatch[1];
  }
  
  // If we couldn't extract a UUID, throw an error
  throw new Error(`Invalid Notion database ID format: ${databaseId}`);
}

/**
 * Creates a new page in Notion with catering order details
 * @param {Object} orderData - The order data from EZ Cater
 * @param {Object} grokData - The processed data from Grok API
 * @returns {Promise<Object>} The response from Notion API
 */
async function createNotionCateringOrder(orderData, grokData) {
  const rawDatabaseId = process.env.NOTION_DATABASE_ID;
  if (!rawDatabaseId) {
    throw new Error('NOTION_DATABASE_ID environment variable is not set');
  }

  // Extract the UUID portion of the database ID
  const databaseId = extractDatabaseUuid(rawDatabaseId);
  console.debug(`Preparing to create Notion page for order #${orderData.orderNumber} in database ${databaseId}`);

  try {
    // Get authenticated client
    const notion = getNotionClient();
    
    // Format the order data for Notion
    const { properties, children } = formatOrderForNotion(orderData, grokData);
    
    // Create the page in Notion
    console.debug('Creating page in Notion...');
    
    // Log the structure of the first few blocks to help with debugging
    console.debug('First few blocks:', JSON.stringify(children.slice(0, 3), null, 2));
    
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      properties: properties,
      children: children
    });

    console.debug('Notion page created successfully:', response.url);
    return {
      id: response.id,
      url: response.url
    };
  } catch (error) {
    console.error('Error creating page in Notion:', error);
    
    // Add more detailed error logging
    if (error.body) {
      try {
        const errorBody = JSON.parse(error.body);
        console.error('Detailed error:', errorBody);
      } catch (jsonParseError) {
        console.error('Error parsing error body:', jsonParseError);
        console.error('Raw error body:', error.body);
      }
    }
    
    throw error;
  }
}

/**
 * Formats order data into Notion-compatible format
 * @param {Object} orderData - The order data from EZ Cater
 * @param {Object} grokData - The processed data from Grok API
 * @returns {Object} Formatted data for Notion API
 */
function formatOrderForNotion(orderData, grokData) {
  try {
    // Parse Grok response if it's a string
    let jsonData;
    if (typeof grokData.content === 'string') {
      try {
        jsonData = JSON.parse(grokData.content);
      } catch (error) {
        console.error("Failed to parse Grok response:", error);
        // Use a simplified format if parsing fails
        return formatSimpleNotionPage(orderData, grokData.content);
      }
    } else {
      jsonData = grokData.content;
    }

    // Extract order details from the new Grok format
    const order = orderData;
    const orderNumber = order.orderNumber;
    
    // Get order summary from Grok data
    const orderSummary = jsonData.order_summary || {};
    const customerName = orderSummary.customer || order.orderCustomer?.fullName || order.event?.contact?.name || 'N/A';
    const orderDate = orderSummary.date;
    const headcount = orderSummary.headcount || order.event?.headcount || 'N/A';
    const deliveryAddress = orderSummary.delivery_address;
    
    // Format date for Notion if available
    let formattedDate = null;
    if (orderDate) {
      try {
        // Only take the date portion (YYYY-MM-DD)
        formattedDate = new Date(orderDate).toISOString().slice(0, 10);
      } catch (e) {
        console.warn('Could not parse order date:', e);
      }
    }

    // New variables sourced directly from the event
    const companyName = order.event?.address?.name || 'N/A';

    // Create properties for the Notion page
    const properties = {
      "Order Number": {
        rich_text: [
          {
            text: {
              content: `${orderNumber}`
            }
          }
        ]
      },
      "Contact": {
        rich_text: [
          {
            text: {
              content: customerName + (order.event?.contact?.phone ? ` | ${order.event.contact.phone}` : '')
            }
          }
        ]
      },
      "Company": {
        title: [
          {
            text: {
              content: companyName
            }
          }
        ]
      },
      "Headcount": {
        number: typeof headcount === 'number'
                  ? headcount
                  : (parseInt(headcount) || 0)
      },
      "Delivery Address": {
        rich_text: [
          {
            text: { content: deliveryAddress || 'N/A' }
          }
        ]
      },
      "Special Notes": {
        rich_text: [
          {
            text: { content: orderSummary.special_notes || 'None' }
          }
        ]
      }
    };

    // If we have a valid date, add it as a date property
    if (formattedDate) {
      properties["Date"] = {
        date: {
          start: formattedDate
        }
      };
    }

    // Add "Pickup Time" property sourced from event.catererHandoffFoodTime (time only)
    if (order.event?.catererHandoffFoodTime) {
      properties["Pickup Time"] = {
        rich_text: [
          {
            text: {
              content: new Date(order.event.catererHandoffFoodTime)
                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          }
        ]
      };
    }

    // Create the content blocks for the Notion page
    const children = [
      // Header section with order summary
      // Preparation items section
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Preparation Items" } }]
        }
      }
    ];

    // Add preparation items as a table
    if (jsonData.preparation_items && jsonData.preparation_items.length > 0) {
      const tableBlock = {
        object: "block",
        type: "table",
        table: {
          table_width: 4,
          has_column_header: true,
          has_row_header: false,
          children: [
            {
              type: "table_row",
              table_row: {
                cells: [
                  [{ type: "text", text: { content: "Item" } }],
                  [{ type: "text", text: { content: "Quantity" } }],
                  [{ type: "text", text: { content: "Container" } }],
                  [{ type: "text", text: { content: "Serving Utensil" } }]
                ]
              }
            }
          ]
        }
      };

      jsonData.preparation_items.forEach(item => {
        // Split the item name by " with " to separate the main entree from its details.
        let parts = (item.item || 'N/A').split(" with ");
        let mainItemName = parts[0];
        
        // Initialize proteinValue.
        let proteinValue = "";
        
        // First, try to get protein info from customizations if available.
        let customizations = item.customizations;
        if (customizations && Array.isArray(customizations) && customizations.length > 0) {
          const proteinCustomization = customizations.find(custom => {
            return custom.customizationTypeName &&
                   custom.customizationTypeName.toLowerCase().includes("protein");
          });
          if (proteinCustomization && proteinCustomization.name) {
            proteinValue = proteinCustomization.name;
          }
        }
        
        // Fallback: if no protein from customizations, use the first element as protein.
        if (parts.length > 1) {
          let details = parts[1]; // e.g., "Steak and Spanish Rice"
          let detailsParts = [];
          if (details.includes(" and ")) {
            detailsParts = details.split(" and ").map(s => s.trim());
          } else if (details.includes(",")) {
            detailsParts = details.split(",").map(s => s.trim());
          } else {
            detailsParts = [details.trim()];
          }

          // If no protein from customizations, use the first element as protein.
          if (!proteinValue && detailsParts.length > 0) {
            proteinValue = detailsParts[0];
            detailsParts = detailsParts.slice(1);
          } else if (proteinValue && detailsParts.length > 0 && detailsParts[0].toLowerCase() === proteinValue.toLowerCase()) {
            // If external protein matches the first detail, remove it.
            detailsParts = detailsParts.slice(1);
          }

          // Append the protein to the main entree name.
          if (proteinValue) {
            mainItemName += " - " + proteinValue;
          }

          // For any leftover side items, add separate rows.
          detailsParts.forEach(sideItem => {
            tableBlock.table.children.push({
              type: "table_row",
              table_row: {
                cells: [
                  [{ type: "text", text: { content: sideItem } }],
                  [{ type: "text", text: { content: item.quantity || 'N/A' } }],
                  [{ type: "text", text: { content: item.container || 'N/A' } }],
                  [{ type: "text", text: { content: item.servingUtensil || 'N/A' } }]
                ]
              }
            });
          });
        } else if (proteinValue) {
          mainItemName += " - " + proteinValue;
        }
        
        const containerInfo = `${item.container || 'N/A'} (${item.fill_level || 'N/A'})`;
        
        tableBlock.table.children.push({
          type: "table_row",
          table_row: {
            cells: [
              [{ type: "text", text: { content: mainItemName } }],
              [{ type: "text", text: { content: item.quantity || 'N/A' } }],
              [{ type: "text", text: { content: containerInfo } }],
              [{ type: "text", text: { content: item.servingUtensil || 'N/A' } }]
            ]
          }
        });
      });

      children.push(tableBlock);
    } else {
      // If no preparation items, add a fallback message
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: "No preparation items specified." } },
          ]
        }
      });
    }

    // Add utensil summary section
    children.push(
      {
        object: "block",
        type: "divider",
        divider: {}
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Utensil Summary" } }]
        }
      }
    );

    // Add utensil details
    if (jsonData.utensil_summary) {
      const utensilSummary = jsonData.utensil_summary;
      
      // Create a bulleted list for utensils
      Object.entries(utensilSummary).forEach(([key, value]) => {
        const formattedKey = key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              { type: "text", text: { content: `${formattedKey}: ${value}` } }
            ]
          }
        });
      });
    } else {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: "No utensil information available." } },
          ]
        }
      });
    }

    // Add original order details section
    children.push(
      {
        object: "block",
        type: "divider",
        divider: {}
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Original Order Items" } }]
        }
      }
    );

    // Add original order items
    if (order.catererCart?.orderItems && order.catererCart.orderItems.length > 0) {
      order.catererCart.orderItems.forEach(item => {
        // Format customizations as a string
        let customizationsText = '';
        if (item.customizations && item.customizations.length > 0) {
          customizationsText = item.customizations.map(c => 
            `${c.customizationTypeName}: ${c.name} (x${c.quantity})`
          ).join(', ');
        }

        // Add item details
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              { type: "text", text: { content: item.name }, annotations: { bold: true } },
              { type: "text", text: { content: ` (Quantity: ${item.quantity})` } },
            ]
          }
        });

        // Add customizations if available
        if (customizationsText) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                { type: "text", text: { content: "Customizations: " }, annotations: { italic: true } },
                { type: "text", text: { content: customizationsText } },
              ]
            }
          });
        }

        // Add special instructions if available
        if (item.specialInstructions) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                { type: "text", text: { content: "Special Instructions: " }, annotations: { italic: true } },
                { type: "text", text: { content: item.specialInstructions } },
              ]
            }
          });
        }

        // Add a divider between items
        children.push({
          object: "block",
          type: "divider",
          divider: {}
        });
      });
    } else {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: "No order items available." } },
          ]
        }
      });
    }

    return { properties, children };
  } catch (error) {
    console.error("Error formatting order for Notion:", error);
    return formatSimpleNotionPage(orderData, "Error formatting order data: " + error.message);
  }
}

/**
 * Creates a simplified Notion page format when structured data is unavailable
 * @param {Object} orderData - The order data from EZ Cater
 * @param {string} grokContent - The raw content from Grok API
 * @returns {Object} Formatted data for Notion API
 */
function formatSimpleNotionPage(orderData, grokContent) {
  const order = orderData;
  const orderNumber = order.orderNumber;
  const customerName = order.orderCustomer?.fullName || 'N/A';
  
  // Create minimal properties for the Notion page (only title)
  const properties = {
    "Order Number": {
      rich_text: [
        {
          text: {
            content: `${orderNumber}`
          }
        }
      ]
    }
  };

  // Format pickup time if available
  if (order.event?.catererHandoffFoodTime) {
    const pickupTime = new Date(order.event.catererHandoffFoodTime).toLocaleString();
    properties["Pickup Time"] = {
      rich_text: [
        {
          text: {
            content: pickupTime
          }
        }
      ]
    };
  }

  // Format headcount if available
  if (order.event?.headcount) {
    properties["Headcount"] = {
      number: typeof order.event.headcount === 'number' ? order.event.headcount : null
    };
  }

  // Create the content blocks for the Notion page
  const children = [
    // Header section
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Order Details" } }]
      }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { 
            type: "text", 
            text: { content: "Customer: " },
            annotations: { bold: true }
          },
          { type: "text", text: { content: customerName } },
        ]
      }
    }
  ];

  // Add pickup time if available
  if (order.event?.catererHandoffFoodTime) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { 
            type: "text", 
            text: { content: "Pickup Time: " },
            annotations: { bold: true }
          },
          { type: "text", text: { content: new Date(order.event.catererHandoffFoodTime).toLocaleString() } },
        ]
      }
    });
  }

  // Add headcount if available
  if (order.event?.headcount) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { 
            type: "text", 
            text: { content: "Headcount: " },
            annotations: { bold: true }
          },
          { type: "text", text: { content: `${order.event.headcount}` } },
        ]
      }
    });
  }

  // Add divider
  children.push({
    object: "block",
    type: "divider",
    divider: {}
  });

  // Add order breakdown section
  children.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: "Order Breakdown" } }]
    }
  });

  // Add the raw Grok content as a code block
  children.push({
    object: "block",
    type: "code",
    code: {
      rich_text: [
        { 
          type: "text", 
          text: { 
            content: grokContent
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0)
              .join('\n')
          }
        }
      ],
      language: "plain text"
    }
  });

  // Add order items if available
  if (order.catererCart?.orderItems && order.catererCart.orderItems.length > 0) {
    children.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Order Items" } }]
      }
    });
    
    order.catererCart.orderItems.forEach(item => {
      const listItem = {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            { 
              type: "text", 
              text: { content: `${item.quantity}x ${item.name}` },
              annotations: { bold: true }
            }
          ]
        }
      };
      
      children.push(listItem);
      
      // Add special instructions as a nested item if available
      if (item.specialInstructions) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              { 
                type: "text", 
                text: { content: `Special instructions: ${item.specialInstructions}` },
                annotations: { italic: true }
              }
            ]
          }
        });
      }
    });
  }

  // Add footer with timestamp
  children.push(
    {
      object: "block",
      type: "divider",
      divider: {}
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { 
            type: "text", 
            text: { content: `Generated on ${new Date().toLocaleString()}` },
            annotations: { italic: true }
          }
        ]
      }
    }
  );

  return { properties, children };
}

export {
  getNotionClient,
  createNotionCateringOrder
};