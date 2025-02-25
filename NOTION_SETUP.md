# Setting Up Notion Integration for Catering Orders

This guide will help you set up a Notion database to store catering orders from EZ Cater.

## Prerequisites

1. A Notion account
2. Admin access to create integrations and databases

## Step 1: Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Name your integration (e.g., "EZ Cater Orders")
4. Select the workspace where you want to use this integration
5. Set the capabilities required:
   - Read content
   - Update content
   - Insert content
6. Click "Submit" to create your integration
7. Copy the "Internal Integration Token" (this will be your `NOTION_API_KEY`)

## Step 2: Create a Notion Database

1. In Notion, create a new page where you want to store your catering orders
2. Create a new database (full page or inline)
3. Add the following properties to your database with the exact property types:
   - **Customer** (Title): The primary field for customer name
   - **Order Number** (Text): The order identification number
   - **Date** (Date): Order date
   - **Pickup Time** (Text): Time for pickup
   - **Headcount** (Number): Number of people
   - **Status** (Status): With options like "Pending", "In Progress", "Completed"

   > **Important**: The property types must match exactly as listed above. The integration will fail if the property types don't match.

## Step 3: Share the Database with your Integration

1. Open your database in Notion
2. Click the "..." menu in the top right corner
3. Select "Add connections"
4. Find and select your integration from Step 1
5. This gives your integration permission to access this database

## Step 4: Get the Database ID

1. Open your database in Notion
2. Look at the URL in your browser. It will look something like:
   ```
   https://www.notion.so/workspace/83c75a39f33b4b8c9bb6a4c0000d3c6e?v=...
   ```
3. The database ID is the part after the workspace name and before the question mark:
   ```
   83c75a39f33b4b8c9bb6a4c0000d3c6e
   ```
   
   **Important**: You only need the 32-character UUID portion. If your URL looks different, the UUID might be in a different position. It's a 32-character hexadecimal string, sometimes with hyphens (like `83c75a39-f33b-4b8c-9bb6-a4c0000d3c6e`).

4. Copy this ID (this will be your `NOTION_DATABASE_ID`)

## Step 5: Update Environment Variables

1. Add the following variables to your `.env` file:
   ```
   NOTION_API_KEY=your_notion_api_key
   NOTION_DATABASE_ID=your_notion_database_id
   ```
   
   **Note**: For the `NOTION_DATABASE_ID`, you can paste either the full URL or just the UUID portion. The application will automatically extract the UUID.

2. Restart your application

## Testing the Integration

After setting up the integration, you can test it by:

1. Triggering a webhook from EZ Cater (or using a test payload)
2. Check your Notion database to see if a new page was created
3. Verify that all the order details are correctly displayed

## Customizing the Notion Page Layout

The default layout includes:
- Order details (customer, date, pickup time, headcount)
- Order items in a table format
- Required utensils as a bulleted list
- Special instructions in a callout block

You can customize this layout by modifying the `formatOrderForNotion` function in `lib/notion.js`.

## Troubleshooting

- **Permission errors**: Make sure your integration has been properly connected to the database
- **Property type errors**: Ensure your database has all the required properties with the exact property types listed in Step 2
- **Database ID errors**: If you're getting validation errors about the database ID, make sure you're using just the UUID portion of the database ID (32 characters, with or without hyphens)
- **API rate limits**: Notion has rate limits that may affect high-volume operations 