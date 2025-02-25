This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## EZ Cater Webhook Integration

This application processes webhooks from EZ Cater, extracts order information, and creates beautifully formatted Notion pages for kitchen staff to access.

### Notion Integration

The application uses the Notion API to create detailed pages containing order information. To set up the Notion integration:

1. Create a Notion integration at [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create a database in Notion to store catering orders
3. Share the database with your integration
4. Get the database ID from the URL
5. Add your Notion API key and database ID to your environment variables

For detailed setup instructions, see [NOTION_SETUP.md](./NOTION_SETUP.md).

### Environment Variables

Copy the `.env.example` file to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Required environment variables:
- `EZ_CATER_API_TOKEN`: Your EZ Cater API token
- `WEBHOOK_SECRET`: Secret for webhook signature verification
- `NOTION_API_KEY`: Your Notion API key
- `NOTION_DATABASE_ID`: ID of the Notion database where orders will be created
- `OPENAI_API_KEY`: OpenAI API key for Grok API integration

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
