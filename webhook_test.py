import hmac
import hashlib
import time
import requests
import json

# Configuration
ENDPOINT_URL = "http://localhost:3000/api/webhook"  # Your local Next.js webhook endpoint
WEBHOOK_SECRET = "9269fb55c9289fe2670e8e9416610c4c3dbeab9fc47e80ec5423d472845cdfe8"  # Must match the WEBHOOK_SECRET in your .env.local

# Sample ezCater webhook payload
PAYLOAD = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "parent_type": "Caterer",
    "parent_id": "987fcdeb-12d3-4e5f-6789-123456789abc",
    "entity_type": "Order",
    "entity_id": "456fcdeb-12d3-4e5f-6789-123456789def",
    "key": "accepted",
    "occurred_at": "2025-02-21T12:00:00Z"
}

def generate_signature(timestamp, payload, secret):
    """Generate the HMAC-SHA256 signature for the webhook."""
    # Convert payload to a JSON string without extra spaces
    payload_str = json.dumps(payload, separators=(',', ':'))
    # Concatenate timestamp and payload
    data = f"{timestamp}.{payload_str}"
    # Compute HMAC-SHA256 signature
    signature = hmac.new(
        secret.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return f"{timestamp}.{signature}"

def test_webhook():
    """Send a test webhook request to the endpoint."""
    # Get current Unix timestamp
    timestamp = int(time.time())
    
    # Generate the X-Ezcater-Signature header
    signature = generate_signature(timestamp, PAYLOAD, WEBHOOK_SECRET)
    
    # Headers for the request
    headers = {
        "X-Ezcater-Signature": signature,
        "Content-Type": "application/json"
    }
    
    # Convert payload to JSON string for the request body
    payload_json = json.dumps(PAYLOAD, separators=(',', ':'))
    
    # Send the POST request
    try:
        response = requests.post(
            ENDPOINT_URL,
            headers=headers,
            data=payload_json
        )
        
        # Print the response
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        # Check if the request was successful
        if response.status_code == 200:
            print("Webhook test successful!")
        else:
            print("Webhook test failed. Check the response for details.")
            
    except requests.exceptions.RequestException as e:
        print(f"Error sending request: {e}")

if __name__ == "__main__":
    print("Testing webhook endpoint...")
    test_webhook()