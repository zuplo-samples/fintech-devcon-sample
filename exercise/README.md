# Exercise

## Pre-requisites

- Knowledge of JavaScript/TypeScript
- Node (LTS)
- npm (LTS)

See [this guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for installation instruction for your OS.

## Step 1: Setting up your API

Let's use [Hono](https://hono.dev/docs/) to get a simple API going.

```bash
npm create hono@latest
```

```txt
Target directory: fintech-api
Which template do you want to use? nodejs
Do you want to install project dependencies? Yes
Which package manager do you want to use? npm
```

Now, let's start the API

```bash
cd fintech-api/src
npm install
npm run dev
```

If you navigate to http://localhost:3000/ the server will respond:

> Hello Hono!

## Step 2: Verifying Bots/Agents

Let's try and identify bots/agents that might be trying to access our API.

### Testing our API

We set up a little test in the `/agent` directory, so open up a new terminal, and navigate over there. `agent.ts` is a set of tests that will evaluate if you are ready for AI Agents.

To run it run

```bash
npm install
npx tsx agent.ts
```

The first test will try and make an unauthenticated call to your localhost API, and fails if the call goes through without a 401 response.

```bash
Test failed: Expected 401 Unauthorized, but got 200
```

Our API currently allows any Agent or bot to call into it, let's use HTTP Message signatures to force them to identify themselves to make a request.

### Setting Up Bot Auth

Normally, bot/agent access is governed by `robots.txt` and the `UserAgent` header - but any client can spoof their `UserAgent`. Instead, we need a more robust method to identify AI agents and verify they belong to legitimate entities.

We'll use the [`web-both-auth`](https://github.com/cloudflare/web-bot-auth/tree/main/packages/web-bot-auth) package for this. It uses [HTTP Message signatures](https://zuplo.com/blog/2025/06/05/identify-ai-agents-with-http-message-signatures) to identify bots and verify their identities.

Kill your hono server and run:

```bash
npm install web-bot-auth
```

Inside `index.ts` replace the function handler with the following

```ts
...
import { verify } from "web-bot-auth";
import { verifierFromJWK } from "web-bot-auth/crypto";

// available at https://github.com/cloudflareresearch/web-bot-auth/blob/main/examples/rfc9421-keys/ed25519.json
const RFC_9421_ED25519_TEST_KEY = {
  kty: "OKP",
  crv: "Ed25519",
  kid: "test-key-ed25519",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
};

const app = new Hono();

app.get("/", async (c) => {
  const rawRequest = c.req.raw;
  await verify(rawRequest, await verifierFromJWK(RFC_9421_ED25519_TEST_KEY));
  return c.text("Hello Hono!");
});
...
```

Normally, the `Signature-Agent` header would be used to specify where the public key can be retrieved.

Let's restart the server

```bash
npm run dev
```

### Testing Bot Auth

In your `agent` terminal, let's run our test again

```bash
npx tsx agent.ts
```

```txt
Test passed: Unauthorized access correctly blocked.
Test passed: Authorized access correctly granted.
```

Alright, we can now verify that bots traffic is legitimate.

## Step 3: Communicating with AI Agents

Let's make our API a little bit more real. Let's build a simple API for interacting with Credit Cards and their users. After your imports in `index.ts` let's add the following data

```ts
const CARD_DATA = [
  {
    id: "1",
    cardNumber: "4111111111111111",
    cardHolder: "John Doe",
    expiryDate: "12/25",
    cvv: "123",
  },
  {
    id: "2",
    cardNumber: "5500000000000004",
    cardHolder: "Jane Smith",
    expiryDate: "11/24",
    cvv: "456",
  },
  {
    id: "3",
    cardNumber: "340000000000009",
    cardHolder: "Alice Johnson",
    expiryDate: "10/23",
    cvv: "789",
  },
  {
    id: "4",
    cardNumber: "6011000000000012",
    cardHolder: "Bob Brown",
    expiryDate: "09/22",
    cvv: "321",
  },
];
```

Now let's add a new endpoint for the agent to fetch these credit cards

```ts
...
app.get("/cards", async (c) => {
  return c.json(CARD_DATA);
});
```

### Schema Validation

So we currently have a way of fetching credit cards, but no way of adding new ones. Let's fix that!

### Error Handling & Problem Details

### OpenAPI Generation & Zudoku

## Step 4: Governing AI Agents

### Redacting CC Information

### Object Level Authorization

### Bulk Endpoints

## Step 5: Agent Experience

### Building an MCP Server

### Documenting an MCP server as a usecase
