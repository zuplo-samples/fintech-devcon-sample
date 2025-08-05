import { signatureHeaders } from "web-bot-auth";
import { signerFromJWK } from "web-bot-auth/crypto";

// This is a testing-only private key/public key pair described in RFC 9421 Appendix B.1.4
// Also available at https://github.com/cloudflareresearch/web-bot-auth/blob/main/examples/rfc9421-keys/ed25519.json
const RFC_9421_ED25519_TEST_KEY = {
  kty: "OKP",
  crv: "Ed25519",
  kid: "test-key-ed25519",
  d: "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
};

async function testNoSignatureFails() {
  const response = await fetch("http://localhost:3000/");
  if (response.status !== 401) {
    throw new Error(`Expected 401 Unauthorized, but got ${response.status}`);
  }
}

async function testSignaturePasses() {
  const request = new Request("http://localhost:3000/");
  const now = new Date();
  const headers = await signatureHeaders(
    request,
    await signerFromJWK(RFC_9421_ED25519_TEST_KEY),
    {
      created: now,
      expires: new Date(now.getTime() + 300_000), // now + 5 min
    }
  );
  const response = await fetch("http://localhost:3000/", {
    method: "GET",
    headers: {
      Signature: headers["Signature"],
      "Signature-Input": headers["Signature-Input"],
    },
  });
  if (response.status !== 200) {
    throw new Error(`Expected 200 OK, but got ${response.status}`);
  }
}

async function testCardEndpoint() {
  const response = await fetch("http://localhost:3000/cards");
  if (response.status !== 200) {
    throw new Error(`Expected 200 OK, but got ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Expected an array of cards, but got something else");
  }
}

async function testAddCard() {
  const newCard = {
    id: "4",
    cardNumber: "4111111111111111",
    cardHolderId: "3",
    expiryDate: "12/25",
    cvv: "123",
  };
  const response = await fetch("http://localhost:3000/cards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newCard),
  });
  if (response.status !== 201) {
    throw new Error(`Expected 201 Created, but got ${response.status}`);
  }
}

async function testAddInvalidCard() {
  const invalidCard = {
    id: 5,
    cardNumber: "1234567890123456",
    cardHolderId: "Invalid Card",
    expiryDate: "01/20",
    cvv: "000",
  };
  const response = await fetch("http://localhost:3000/cards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invalidCard),
  });
  if (response.status !== 400) {
    throw new Error(`Expected 400 Bad Request, but got ${response.status}`);
  }
}

async function testOpenAPIGeneration() {
  const response = await fetch("http://localhost:3000/docs");
  if (response.status !== 200) {
    throw new Error(`Expected 200 OK from /docs, but got ${response.status}`);
  }
  const data = await response.json();
  if (!data.openapi || !data.info || !data.paths) {
    throw new Error(
      "Expected OpenAPI document structure, but got something else"
    );
  }
}

async function testFetchCardsAuthenticated() {
  const userId = "1"; // Assuming we want to fetch cards for user with ID 1
  const basicAuthHeader = "Basic " + btoa("johndoe:password123");
  const response = await fetch("http://localhost:3000/cards", {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader,
    },
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200 OK on /cards, but got ${response.status}`);
  }
  const data = await response.json();
  const hasOtherUserCards = data.some((card) => card.cardHolderId !== userId);
  if (hasOtherUserCards) {
    throw new Error("Expected only cards for user ID 1, but got others");
  }
}

async function testAddCardsBulk() {
  const newCards = [
    {
      id: "5",
      cardNumber: "4111111111111111",
      cardHolderId: "1",
      expiryDate: "12/26",
      cvv: "123",
    },
    {
      id: "6",
      cardNumber: "4111111111111112",
      cardHolderId: "2",
      expiryDate: "01/27",
      cvv: "456",
    },
  ];
  const response = await fetch("http://localhost:3000/cards/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newCards),
  });
  if (response.status !== 201) {
    throw new Error(
      `Expected 201 Created on /cards/bulk, but got ${response.status}`
    );
  }
}

async function testReplaceCardMcpTool() {
  const replaceCardParams = {
    cardLastFour: "1111",
    basicAuthToken: btoa("johndoe:password123"),
  };
  const response = await fetch("http://localhost:3000/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: JSON.stringify({
      method: "tools/call",
      params: {
        name: "Replace credit card",
        arguments: replaceCardParams,
      },
    }),
  });
  if (response.status !== 202) {
    throw new Error(
      `Expected 202 Accepted on /mcp, but got ${response.status}`
    );
  }
}

async function runTest() {
  // First, call into localhost without a signature
  await testNoSignatureFails();
  console.log("Test passed: Unauthorized access correctly blocked.");

  // Then, call into localhost with a valid signature
  await testSignaturePasses();
  console.log("Test passed: Authorized access correctly granted.");

  // Test the /cards endpoint
  await testCardEndpoint();
  console.log("Test passed: /cards endpoint returned valid data.");
  // Test adding a new card
  await testAddCard();
  console.log("Test passed: New card added successfully.");
  // Test adding an invalid card
  await testAddInvalidCard();
  console.log("Test passed: Invalid card rejected as expected.");
  // Test OpenAPI generation
  await testOpenAPIGeneration();
  console.log("Test passed: OpenAPI generation returned valid document.");
  // Test fetching cards with authentication
  await testFetchCardsAuthenticated();
  console.log("Test passed: User-specific cards fetched successfully.");
  // Test adding cards in bulk
  await testAddCardsBulk();
  console.log("Test passed: Bulk card addition successful.");
  // Test replacing a card using MCP tool
  await testReplaceCardMcpTool();
  console.log(
    "Test passed: MCP tool for replacing card executed successfully."
  );
}

runTest()
  .then(() => {
    console.log("All Tests Complete: You are now AI Agent ready.");
  })
  .catch((error) => {
    console.error("Test failed:", error);
  });
