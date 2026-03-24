# Testing Guide — Encrypted Operations

## Prerequisites

```bash
npm run build:mesh          # Build mesh config from template + secrets
npm run start:mesh -- --port 5001   # Start mesh locally (port 5000 is reserved on macOS)
```

Mesh endpoint: `http://localhost:5001/graphql`

---

## 1. Salesforce REST — `encryptedCreateLead`

### Step 1: Encrypt the payload

```bash
npm run encrypt:rest-payload -- '{"Leads":[{"name":"John Doe","mobile":"9876543210","pincode":"400001","LeadSource":"Website","utm_url":"https://example.com/contact","IsCallable":true}]}'
```

Output: a Base64 encrypted envelope, e.g. `MTI4OjoxMDAwMDo6...`

### Step 2: Call the mutation

**cURL:**

```bash
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedCreateLead(input: $input) { encrypted operationName payload } }",
    "variables": {
      "input": {
        "encrypted": true,
        "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
      }
    }
  }'
```

**GraphQL Client (Postman / Altair / Apollo Sandbox):**

Query:
```graphql
mutation EncryptedCreateLead($input: EncryptedOperationInput!) {
  encryptedCreateLead(input: $input) {
    encrypted
    operationName
    payload
  }
}
```

Variables:
```json
{
  "input": {
    "encrypted": true,
    "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
  }
}
```

### Step 3: Decrypt the response

```bash
npm run decrypt -- "<RESPONSE_PAYLOAD_VALUE>"
```

Expected output:
```json
{"status":"200","leadId":"00QBh00000FpgarMAB"}
```

### Salesforce body format

The JSON you pass to `encrypt:rest-payload` is the exact body sent to Salesforce:

```json
{
  "Leads": [
    {
      "name": "John Doe",
      "mobile": "9876543210",
      "pincode": "400001",
      "LeadSource": "Website",
      "utm_url": "https://example.com/contact",
      "IsCallable": true
    }
  ]
}
```

Multiple leads can be sent in a single request by adding more objects to the `Leads` array.

Available fields: `name`, `email`, `mobile`, `pincode`, `LeadSource`, `utm_url`, `city`, `state`, `area`, `description`, `nature`, `LeadId`, `FraudScore`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_adgroup`, `utm_content`, `utm_device`, `utm_matchtype`, `utm_adid`, `utm_keyword`, `utm_term`, `gclid`, `campaign_id`, `form_type`, `CampaignName`, `AdGroupName`, `IsCallable`, `PaintingSurface`, `Lead_Score`, `Fraud_Status`, `Referral_Source`, `FraudCategory`, `FraudSubCategory`, `LeadCRMNumber`, `LeadCRMStatus`, `LeadBusinessValue`, `DFACLatestOutcalledDate`, `Extra1`–`Extra4`.

---

## 2. Commerce GraphQL — `encryptedGenerateCustomerToken`

### Step 1: Encrypt the payload

```bash
npm run encrypt:payload -- 'mutation { generateCustomerToken(email: "customer@example.com", password: "MyPassword123") { token } }'
```

### Step 2: Call the mutation

**cURL:**

```bash
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedGenerateCustomerToken(input: $input) { encrypted operationName payload } }",
    "variables": {
      "input": {
        "encrypted": true,
        "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
      }
    }
  }'
```

**GraphQL Client:**

Query:
```graphql
mutation EncryptedGenerateToken($input: EncryptedOperationInput!) {
  encryptedGenerateCustomerToken(input: $input) {
    encrypted
    operationName
    payload
  }
}
```

Variables:
```json
{
  "input": {
    "encrypted": true,
    "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
  }
}
```

### Step 3: Decrypt the response

```bash
npm run decrypt -- "<RESPONSE_PAYLOAD_VALUE>"
```

Expected output:
```json
{"data":{"generateCustomerToken":{"token":"eyJhbGciOiJIUzI1NiIs..."}}}
```

---

## 3. Commerce GraphQL — `encryptedCreateCustomer`

### Step 1: Encrypt the payload

```bash
npm run encrypt:payload -- 'mutation { createCustomer(input: { firstname: "Jane", lastname: "Doe", email: "jane.doe@example.com", password: "MyPassword123", is_subscribed: false }) { customer { firstname lastname email } } }'
```

### Step 2: Call the mutation

**cURL:**

```bash
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedCreateCustomer(input: $input) { encrypted operationName payload } }",
    "variables": {
      "input": {
        "encrypted": true,
        "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
      }
    }
  }'
```

**GraphQL Client:**

Query:
```graphql
mutation EncryptedCreateCustomer($input: EncryptedOperationInput!) {
  encryptedCreateCustomer(input: $input) {
    encrypted
    operationName
    payload
  }
}
```

Variables:
```json
{
  "input": {
    "encrypted": true,
    "payload": "<PASTE_ENCRYPTED_ENVELOPE>"
  }
}
```

### Step 3: Decrypt the response

```bash
npm run decrypt -- "<RESPONSE_PAYLOAD_VALUE>"
```

Expected output:
```json
{"data":{"createCustomer":{"customer":{"firstname":"Jane","lastname":"Doe","email":"jane.doe@example.com"}}}}
```

---

## Quick Reference

| Operation | Source Type | Encrypt Command | Mutation Name |
|-----------|-----------|----------------|---------------|
| Create Lead | REST (Salesforce) | `npm run encrypt:rest-payload -- '{...}'` | `encryptedCreateLead` |
| Generate Token | GraphQL (Commerce) | `npm run encrypt:payload -- 'mutation {...}'` | `encryptedGenerateCustomerToken` |
| Create Customer | GraphQL (Commerce) | `npm run encrypt:payload -- 'mutation {...}'` | `encryptedCreateCustomer` |

## One-liner (encrypt → call → decrypt)

**REST (Salesforce):**
```bash
ENC=$(npm run -s encrypt:rest-payload -- '{"Leads":[{"name":"test","mobile":"9876543210","pincode":"400001","LeadSource":"Website","utm_url":"https://example.com","IsCallable":true}]}') && \
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { encryptedCreateLead(input: { encrypted: true, payload: \\\"${ENC}\\\" }) { encrypted operationName payload } }\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d,indent=2))" && \
echo "---" && \
npm run -s decrypt -- "$(curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { encryptedCreateLead(input: { encrypted: true, payload: \\\"${ENC}\\\" }) { encrypted operationName payload } }\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['encryptedCreateLead']['payload'])")"
```

**GraphQL (Commerce):**
```bash
ENC=$(npm run -s encrypt:payload -- 'mutation { generateCustomerToken(email: "customer@example.com", password: "MyPassword123") { token } }') && \
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { encryptedGenerateCustomerToken(input: { encrypted: true, payload: \\\"${ENC}\\\" }) { encrypted operationName payload } }\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d,indent=2))"
```

## Useful Commands

```bash
npm run build:mesh            # Rebuild mesh.json from sources + secrets
npm run validate              # Validate mesh config and secrets
npm run encrypt -- "text"     # Encrypt a raw string value
npm run decrypt -- "envelope" # Decrypt an envelope string
npm test                      # Run unit tests
```
