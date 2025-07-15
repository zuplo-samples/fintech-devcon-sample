import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { verify } from "web-bot-auth";
import { verifierFromJWK } from "web-bot-auth/crypto";

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

app.get("/cards", async (c) => {
  return c.json(CARD_DATA);
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
