// lib/helpers.js

const fetch = require('node-fetch');
const { print } = require('graphql'); // For converting AST to string if needed

// GraphQL Query as a string
const GET_ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      uuid
      deliveryId
      caterer {
        uuid
        name
        storeNumber
        live
        address {
          name
          street
          street2
          street3
          city
          state
          stateName
          zip
          deliveryInstructions
        }
      }
      catererCart {
        feesAndDiscounts {
          name
          cost {
            currency
            subunits
            subunitsV2
          }
        }
        orderItems {
          uuid
          name
          quantity
          menuItemSizeId
          menuItemSizeName
          noteToCaterer
          posItemId
          specialInstructions
          totalInSubunits {
            currency
            subunits
            subunitsV2
          }
          customizations {
            customizationId
            customizationTypeId
            customizationTypeName
            name
            posCustomizationId
            quantity
          }
          labelFor
        }
        tableware {
          specialInstructions
          tablewareChoices {
            choiceUuid
            isIncluded
            itemCount
            name
          }
        }
        totals {
          catererTotalDue
        }
      }
      event {
        address {
          name
          street
          street2
          street3
          city
          state
          stateName
          zip
          deliveryInstructions
        }
        catererHandoffFoodTime
        contact {
          name
          phone
        }
        customerProvidedName
        headcount
        orderType
        thirdPartyDeliveryPartner
        timeZoneIdentifier
        timeZoneOffset
        timestamp
      }
      isTaxExempt
      lifecycle {
        orderIsCurrently
      }
      orderCustomer {
        firstName
        fullName
        lastName
      }
      orderNumber
      orderSourceType
      taxableAddress {
        name
        street
        street2
        street3
        city
        state
        stateName
        zip
        deliveryInstructions
      }
      totals {
        customerTotalDue {
          currency
          subunits
          subunitsV2
        }
        pointOfSaleIntegrationFee {
          currency
          subunits
          subunitsV2
        }
        salesTax {
          currency
          subunits
          subunitsV2
        }
        salesTaxRemittance {
          currency
          subunits
          subunitsV2
        }
        subTotal {
          currency
          subunits
          subunitsV2
        }
        tip {
          currency
          subunits
          subunitsV2
        }
      }
    }
  }
`;

/**
 * Queries the EZ Cater API for order details
 * @param {string} orderUuid - The UUID of the order to fetch
 * @returns {Promise<Object>} The order data
 */
async function fetchOrderFromEzCater(orderUuid) {
  // Update the API URL to the correct endpoint
  const apiUrl = 'https://api.ezcater.com/graphql'; // Changed from api.ezcater.io to api.ezcater.com
  const apiToken = process.env.EZ_CATER_API_TOKEN;

  console.debug(`Attempting to fetch order with UUID: ${orderUuid}`);
  console.debug(`Using API URL: ${apiUrl}`);
  
  if (!apiToken) {
    console.error('EZ_CATER_API_TOKEN environment variable is not set');
    throw new Error('EZ_CATER_API_TOKEN environment variable is not set');
  } else {
    console.debug('API token is set');
  }

  if (!orderUuid || typeof orderUuid !== 'string') {
    console.error(`Invalid order UUID: ${orderUuid}`);
    throw new Error('Valid order UUID is required');
  }

  const variables = {
    id: orderUuid
  };

  try {
    console.debug('Sending GraphQL request to EZ Cater API...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        query: GET_ORDER_QUERY,
        variables,
      }),
    });

    console.debug(`API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API request failed: ${response.status}`, errorText);
      throw new Error(`EZ Cater API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.debug('Successfully received API response');

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    if (!result.data?.order) {
      console.error('No order data in API response');
      throw new Error('No order data returned from EZ Cater API');
    }

    return result.data.order;
  } catch (error) {
    console.error('Error fetching order from EZ Cater:', error);
    throw error;
  }
}

/**
 * Process webhook data and fetch additional order details if needed
 * @param {Object} payload - The webhook payload
 * @returns {Promise<Object>} Processed data with order details
 */
async function processWebhookData(payload) {
  try {
    console.debug('Processing webhook payload:', JSON.stringify(payload, null, 2));
    
    // Check if entity_id exists
    if (!payload.entity_id) {
      console.debug('Missing entity_id in payload');
      return { data: null, message: 'Missing entity_id in webhook payload' };
    }
    
    // Check entity_type case-insensitively
    if (payload.entity_type?.toLowerCase() !== 'order') {
      console.debug(`Invalid entity_type: ${payload.entity_type}, expected 'order'`);
      return { data: null, message: `Not an order webhook (entity_type: ${payload.entity_type})` };
    }

    console.debug(`Fetching order data for entity_id: ${payload.entity_id}`);
    const orderData = await fetchOrderFromEzCater(payload.entity_id);
    console.debug('Order data retrieved successfully');
    
    return {
      data: { order: orderData },
      message: 'Order data retrieved successfully'
    };
  } catch (error) {
    console.error('Error processing webhook data:', error);
    return {
      data: null,
      error: error.message,
      message: 'Failed to process webhook data'
    };
  }
}

module.exports = {
  fetchOrderFromEzCater,
  processWebhookData
};