import { serve } from "@hono/node-server";
import { verify } from "web-bot-auth";
import { verifierFromJWK } from "web-bot-auth/crypto";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MCPServer } from "@zuplo/mcp/server";
import { CustomValidator } from "@zuplo/mcp/tools/custom";
import { HTTPStreamableTransport } from "@zuplo/mcp/transport/httpstreamable";

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

const BasicAuthSchema = z
  .object({
    Authorization: z.string().optional().openapi({
      example: "Basic <token>",
    }),
  })
  .openapi("BasicAuth");

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

// available at https://github.com/cloudflareresearch/web-bot-auth/blob/main/examples/rfc9421-keys/ed25519.json
const RFC_9421_ED25519_TEST_KEY = {
  kty: "OKP",
  crv: "Ed25519",
  kid: "test-key-ed25519",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
};

const app = new OpenAPIHono();

app.get("/", async (c) => {
  const rawRequest = c.req.raw;
  try {
    await verify(rawRequest, await verifierFromJWK(RFC_9421_ED25519_TEST_KEY));
  } catch (error) {
    return c.newResponse("Failed signature check", {
      status: 401,
      statusText: "Unauthorized",
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
  return c.text("Hello Hono!");
});

const getCards = createRoute({
  method: "get",
  path: "/cards",
  request: {
    headers: BasicAuthSchema,
  },
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

app.openapi(getCards, (c) => {
  const censorCreditCardNumbers = (card: string) =>
    card.replace(/\d(?=\d{4})/g, "*");
  const censoredCards = CARD_DATA.map((card) => ({
    ...card,
    cardNumber: censorCreditCardNumbers(card.cardNumber),
  }));

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
  return c.json(censoredCards);
});

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

app.doc("/docs", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "My Credit Card API",
  },
});

const server = new MCPServer({
  name: "Credit Card MCP",
  version: "0.0.0",
});

// HTTP Streamable Transport
const transport = new HTTPStreamableTransport();
await transport.connect();
server.withTransport(transport);

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
      cardNumber: "4111111111122222", // New card number for demonstration
      cardHolderId: userId,
      expiryDate: "12/26", // New expiry date for demonstration
      cvv: "123", // New CVV for demonstration
    };
    CARD_DATA[cardIndex] = newCard;
    return {
      content: [{ type: "text", text: JSON.stringify(newCard) }],
      isError: false,
    };
  },
});

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

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
