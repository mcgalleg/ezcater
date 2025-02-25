// lib/googleDrive.js
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Authenticates with Google Drive API using service account credentials
 * @returns {google.auth.JWT} Authenticated JWT client
 */
function getAuthClient() {
  // Check for required environment variables
  const credentials = process.env.GOOGLE_DRIVE_CREDENTIALS;
  if (!credentials) {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS environment variable is not set');
  }

  try {
    // Parse the credentials JSON string
    const parsedCredentials = JSON.parse(credentials);
    
    // Create a JWT client using the service account credentials
    const client = new google.auth.JWT(
      parsedCredentials.client_email,
      null,
      parsedCredentials.private_key,
      ['https://www.googleapis.com/auth/drive.file']
    );

    return client;
  } catch (error) {
    console.error('Error creating Google Drive auth client:', error);
    throw new Error(`Failed to create Google Drive auth client: ${error.message}`);
  }
}

/**
 * Creates a markdown file and uploads it to Google Drive
 * @param {string} content - The markdown content to upload
 * @param {string} fileName - The name of the file to create
 * @returns {Promise<Object>} The response from Google Drive API
 */
async function uploadMarkdownToGoogleDrive(content, fileName) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable is not set');
  }

  console.debug(`Preparing to upload markdown file "${fileName}" to Google Drive folder: ${folderId}`);

  try {
    // Get authenticated client
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // Create a temporary file
    const tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, content);

    console.debug(`Created temporary file at: ${tempFilePath}`);

    // Upload file to Google Drive
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'text/markdown',
      body: fs.createReadStream(tempFilePath)
    };

    console.debug('Uploading file to Google Drive...');
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink'
    });

    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    console.debug('Temporary file cleaned up');

    console.debug('File uploaded successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error);
    throw error;
  }
}

/**
 * Formats order data into a well-structured markdown document
 * @param {Object} orderData - The order data from EZ Cater
 * @param {Object} grokData - The processed data from Grok API
 * @returns {string} Formatted markdown content
 */
function formatOrderAsMarkdown(orderData, grokData) {
  try {
    // Parse Grok response if it's a string
    let jsonData;
    if (typeof grokData.content === 'string') {
      try {
        jsonData = JSON.parse(grokData.content);
      } catch (error) {
        console.error("Failed to parse Grok response:", error);
        // Use a simplified format if parsing fails
        return formatSimpleMarkdown(orderData, grokData.content);
      }
    } else {
      jsonData = grokData.content;
    }

    // Extract order details
    const order = orderData;
    const orderNumber = order.orderNumber;
    const customerName = order.orderCustomer?.fullName || 'N/A';
    const pickupTime = jsonData.pickupTime;
    const orderDate = jsonData.date;
    
    // Create markdown content
    let markdown = `# Catering Order #${orderNumber}\n\n`;
    
    // Add header section with key details
    markdown += `## Order Details\n\n`;
    markdown += `**Customer:** ${customerName}  \n`;
    markdown += `**Date:** ${orderDate}  \n`;
    markdown += `**Pickup Time:** ${pickupTime}  \n`;
    markdown += `**Headcount:** ${order.event?.headcount || 'N/A'}  \n\n`;
    
    // Add divider
    markdown += `---\n\n`;
    
    // Add items section
    markdown += `## Order Items\n\n`;
    
    // Create a table for the items
    markdown += `| Item | Quantity | Pan Type | Fill Level |\n`;
    markdown += `|------|----------|----------|------------|\n`;
    
    // Add each item to the table
    jsonData.table.forEach(row => {
      markdown += `| ${row.Item} | ${row.Quantity} | ${row['Pan Type']} | ${row['Fill Level']} |\n`;
    });
    
    markdown += `\n`;
    
    // Add utensil summary
    markdown += `## Required Utensils\n\n`;
    
    const summary = jsonData.utensil_summary;
    if (summary.serving_spoons > 0 || summary.tongs > 0 || summary.plates > 0 || summary.utensil_rolls > 0) {
      if (summary.serving_spoons > 0) markdown += `* **${summary.serving_spoons}** serving spoons\n`;
      if (summary.tongs > 0) markdown += `* **${summary.tongs}** tongs\n`;
      if (summary.plates > 0) markdown += `* **${summary.plates}** plates\n`;
      if (summary.utensil_rolls > 0) markdown += `* **${summary.utensil_rolls}** utensil rolls\n`;
    } else {
      markdown += `* None required\n`;
    }
    
    // Add special instructions if available
    if (order.catererCart?.tableware?.specialInstructions) {
      markdown += `\n## Special Instructions\n\n`;
      markdown += `${order.catererCart.tableware.specialInstructions}\n`;
    }
    
    // Add footer with timestamp
    markdown += `\n---\n\n`;
    markdown += `*Generated on ${new Date().toLocaleString()}*\n`;
    
    return markdown;
  } catch (error) {
    console.error('Error formatting markdown:', error);
    // Fallback to simple format if there's an error
    return formatSimpleMarkdown(orderData, grokData.content);
  }
}

/**
 * Creates a simplified markdown format when structured data is unavailable
 * @param {Object} orderData - The order data from EZ Cater
 * @param {string} grokContent - The raw content from Grok API
 * @returns {string} Formatted markdown content
 */
function formatSimpleMarkdown(orderData, grokContent) {
  const order = orderData;
  const orderNumber = order.orderNumber;
  const customerName = order.orderCustomer?.fullName || 'N/A';
  
  let markdown = `# Catering Order #${orderNumber}\n\n`;
  
  markdown += `**Customer:** ${customerName}  \n`;
  if (order.event?.catererHandoffFoodTime) {
    markdown += `**Pickup Time:** ${new Date(order.event.catererHandoffFoodTime).toLocaleString()}  \n`;
  }
  markdown += `**Headcount:** ${order.event?.headcount || 'N/A'}  \n\n`;
  
  markdown += `---\n\n`;
  markdown += `## Order Breakdown\n\n`;
  
  // Format the raw Grok content as a code block
  markdown += "```\n";
  markdown += grokContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  markdown += "\n```\n\n";
  
  // Add order items if available
  if (order.catererCart?.orderItems && order.catererCart.orderItems.length > 0) {
    markdown += `## Order Items\n\n`;
    
    order.catererCart.orderItems.forEach(item => {
      markdown += `* **${item.quantity}x ${item.name}**`;
      if (item.specialInstructions) {
        markdown += `  \n  *Special instructions: ${item.specialInstructions}*`;
      }
      markdown += `\n`;
    });
  }
  
  markdown += `\n---\n\n`;
  markdown += `*Generated on ${new Date().toLocaleString()}*\n`;
  
  return markdown;
}

export {
  uploadMarkdownToGoogleDrive,
  formatOrderAsMarkdown
}; 