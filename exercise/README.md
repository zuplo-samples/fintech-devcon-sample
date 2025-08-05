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

Let's make our API a little bit more real. Let's build a simple API for interacting with Credit Cards and their users.

### Setting up Zod & OpenAPI

Before we write an API endpoints, it's important that we have a good understanding of our data model & design. I like using Zod to express my schemas, and will use the integration with Hono to generate an OpenAPI document which will come in handy later. Kill your server abd run the following

```bash
npm install @hono/zod-openapi
```

Now let's use Zod to define our schemas. The first one we are going to describe is our `card` model. Toss the following code in after your imports in `index.ts`

```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const CardSchema = z
  .object({
    id: z
      .string()
      .openapi({
        example: "123",
      })
      .readonly(),
    cardHolderId: z.string().openapi({
      example: "1",
    }),
    cardNumber: z.string().openapi({
      example: "4111111111111111",
    }),
    expiryDate: z.string().openapi({
      example: "12/25",
    }),
    cvv: z.string().openapi({
      example: "123",
    }),
  })
  .openapi("Card");
```

Don't worry that `createRoute` and `OpenAPIHono` aren't used yet, we will get to them in a second.

#### Creating a Route

After your schema in `index.ts` let's add the following placeholder data

```ts
const CARD_DATA = [
  {
    id: "1",
    cardNumber: "4111111111111111",
    cardHolderId: "1",
    expiryDate: "12/25",
    cvv: "123",
  },
  {
    id: "2",
    cardNumber: "5500000000000004",
    cardHolderId: "2",
    expiryDate: "11/24",
    cvv: "456",
  },
  {
    id: "3",
    cardNumber: "340000000000009",
    cardHolderId: "3",
    expiryDate: "10/23",
    cvv: "789",
  },
  {
    id: "4",
    cardNumber: "6011000000000012",
    cardHolderId: "4",
    expiryDate: "09/22",
    cvv: "321",
  },
];
```

Now let's design a new endpoint for the agent to fetch these credit cards

```ts
...
const getCards = createRoute({
  method: "get",
  path: "/cards",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(CardSchema).openapi({
            example: CARD_DATA,
          }),
        },
      },
      description: "Retrieve the cards",
    },
  },
});
```

Since we are schematizing all of our APIs, we also need to update existing endpoints.
First, we need to swap our the server we are using:

Replace

```ts
const app = new Hono();
```

with

```ts
const app = new OpenAPIHono();
```

Finally, we can hook up our endpoint design to our server.

```ts
app.openapi(getCards, (c) => {
  return c.json(CARD_DATA);
});
```

Let's see if this thing works. Run it again

```bash
npm run dev
```

and navigate to `http://localhost:3000/cards`

#### Schema validation

Okay, but what was the point of all of this schematization? Well, it comes in handy when validating requests that are trying to put stuff INTO your data store. Let's spin up a new endpoint:

```ts
const addCard = createRoute({
  method: "post",
  path: "/cards",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CardSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: CardSchema,
        },
      },
      description: "Add a new card",
    },
  },
});

app.openapi(addCard, (c) => {
  const card = c.req.valid("json");
  CARD_DATA.push(card);
  return c.json(card, 201);
});
```

And of course, we need to test this

```bash
npx tsx agent.ts
```

```txt
Test passed: /cards endpoint returned valid data.
Test passed: New card added successfully.
Test passed: Invalid card rejected as expected
```

### OpenAPI Generation

Okay, we have a decent API set up here, but every good API needs documentation. Especially if you want an Agent to be able to understand an access it.

What's nice about the library we are using, is that it actually generates a full OpenAPI document for us. Just add a new route

```ts
app.doc("/docs", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "My Credit Card API",
  },
});
```

Now go to http://localhost:3000/docs and you will get access to a full OpenAPI specification! You can use tools like [Zudoku](https://zudoku.dev/) to render your API documentation

## Step 4: Governing AI Agents

### Redacting CC Information

Let's clean up the API response. Often, it's unnecessary to send back the entire credit card number. Let's go back to our implementation of `getCards` and update how we send data back:

```ts
app.openapi(getCards, (c) => {
  const censorCreditCardNumbers = (card: string) =>
    card.replace(/\d(?=\d{4})/g, "*");
  const censoredCards = CARD_DATA.map((card) => ({
    ...card,
    cardNumber: censorCreditCardNumbers(card.cardNumber),
  }));
  return c.json(censoredCards);
});
```

### Authentication & Object Level Authorization

Okay, let's evolve our API a little bit. It's kind of strange that we are giving AI access to all of our credit cards. Often times, AI makes calls on behalf of some users or entity. In this case, it could be on behalf of a credit card customer. Let's add some basic authentication and authorization to our API to keep our data secure.

#### Adding User Data

Let's add a simple object that we will pretend to be our user table:

```ts
const USER_DATA = [
  {
    id: "1",
    name: "John Doe",
    username: "johndoe",
    password: "password123",
  },
  {
    id: "2",
    name: "Jane Smith",
    username: "janesmith",
    password: "password456",
  },
];
```

We will have the agent send along a header that will tell us which user is making the call. Let's define this header in Zod:

```ts
const BasicAuthSchema = z
  .object({
    Authorization: z.string().optional().openapi({
      example: "Basic <token>",
    }),
  })
  .openapi("BasicAuth");
```

I am going to be using the totally safe and secure Basic Authentication protocol here :)

We need a way of taking a basic auth token and decoding (base64) so here's a function that will do this for you:

```ts
const authenticateUser = (header: string) => {
  const basicToken = header.split(" ")[1];
  if (!basicToken) {
    return null;
  }
  const decodedToken = Buffer.from(basicToken, "base64").toString("utf-8");
  const [username, password] = decodedToken.split(":");
  const user = USER_DATA.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) {
    return null;
  }
  return user.id;
};
```

Now, let's go back to the implementation of `getCards` and tailor the response. First, we need to augment our design (`getCards`) of the endpoint to add the new header:

```ts
...
request: {
  headers: BasicAuthSchema,
},
...
```

Now, we can modify the implementation. Add the following code before the final return:

```ts
...
const authHeader = c.req.header("Authorization");
let userId = null;
if (authHeader) {
  userId = authenticateUser(authHeader);
}
if (userId) {
  const userCards = censoredCards.filter(
    (card) => card.cardHolderId === userId
  );
  return c.json(userCards);
}
...
```

As always, you can run `agent.ts` script to verify this works:

```bash
npx tsx agent.ts
```

```txt
Test passed: User-specific cards fetched successfully.
```

**Bonus**: See if you can add object level authorization to the `addCard` function. If a user tries to add a credit card for a different user, send back a Problem Details error message.

### Bulk Endpoints

Very often, agents will try and perform the same type of task multiple times in a row to automate it. We should make everyone's lives easier by exposing a bulk endpoint. Let's expose one for adding credit cards.

See if you can figure this out before I give you the answer below

please

have

some

patience

and

try

this

on

your

own

OK, here it is

```ts
const addCardsBulk = createRoute({
  method: "post",
  path: "/cards/bulk",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.array(CardSchema),
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.array(CardSchema),
        },
      },
      description: "Add multiple new cards",
    },
  },
});

app.openapi(addCardsBulk, (c) => {
  const cards = c.req.valid("json");
  CARD_DATA.push(...cards);
  return c.json(cards, 201);
});
```

## Step 5: Build an MCP Server with a chunky tool

First thing we are going to want to do is get an MCP server set up, Luckily, we can reuse most of our code. Let's get the right packages installed first:

```bash
npm install @zuplo/mcp
```

### Setting up a Server

At the top of your file, add the following imports

```ts
import { MCPServer } from "@zuplo/mcp/server";
import { HTTPStreamableTransport } from "@zuplo/mcp/transport/httpstreamable";
import { CustomValidator } from "@zuplo/mcp/tools/custom";
```

From there, you can define your MCP server:

```ts
const server = new MCPServer({
  name: "Credit Card MCP",
  version: "0.0.0",
});

// HTTP Streamable Transport
const transport = new HTTPStreamableTransport();
await transport.connect();
server.withTransport(transport);
```

### Defining a chunky tool

Now, let's define a tool that does more than a single resource access. It should try and solve a real user problem. How about replacing a credit card?

```ts
const replaceCardSchema = z.object({
  cardLastFour: z
    .string()
    .describe("The last four digits of the card to replace"),
  basicAuthToken: z.string().describe("The user token for authentication"),
});

server.addTool({
  name: "Replace credit card",
  description: "Replaces a user's credit card",
  validator: new CustomValidator(
    z.toJSONSchema(replaceCardSchema),
    (input: unknown) => {
      const parsed = replaceCardSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          data: null,
          errorData: parsed.error,
          errorMessage: "Invalid input data",
        };
      }
      return {
        success: true,
        data: parsed.data,
        errorData: null,
      };
    }
  ),
  handler: async (params) => {
    const { cardLastFour, basicAuthToken } = params;
    // Implement the logic to replace the credit card
    const authHeader = `Basic ${Buffer.from(basicAuthToken).toString(
      "base64"
    )}`;
    const userId = authenticateUser(authHeader);
    if (!userId) {
      throw new Error("Unauthorized: Invalid user credentials");
    }
    const cardIndex = CARD_DATA.findIndex(
      (card) =>
        card.cardNumber.endsWith(cardLastFour) && card.cardHolderId === userId
    );
    if (cardIndex === -1) {
      throw new Error("Card not found for the user");
    }
    const newCard = {
      id: (CARD_DATA.length + 1).toString(),
      cardNumber: "4111111111111111",
      cardHolderId: userId,
      expiryDate: "12/26",
      cvv: "123",
    };
    CARD_DATA[cardIndex] = newCard;
    return {
      content: [{ type: "text", text: JSON.stringify(newCard) }],
      isError: false,
    };
  },
});
```

Now we just have to add a new endpoint to serve our MCP server from:

```ts
app.post("/mcp", async (c) => {
  try {
    const request = c.req.raw;
    return transport.handleRequest(request);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

### Testing

Testing MCP is easy using the default toolset. We are going to use [MCP Inspector](https://github.com/modelcontextprotocol/inspector).

```bash
npx @modelcontextprotocol/inspector
```

This will install the inspector and run it. Make sure your server is running and point the inspector to your endpoint: http://localhost:3000/mcp

Let's replace John Doe's credit card. First, execute `List Tools` to find our tool. Open it up an enter

`1111` for `cardLastFour` and `johndoe:password123` for `basicAuthToken` and then run the tool!

Restart your server and run the final iteration of the `agent.ts` script.

```bash
npx tsx agent.ts
```

```txt
Test passed: MCP tool for replacing card executed successfully.
All Tests Complete: You are now AI Agent ready.
```

Congrats!
