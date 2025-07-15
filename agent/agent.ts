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

async function runTest() {
  // First, call into localhost without a signature
  await testNoSignatureFails();
  console.log("Test passed: Unauthorized access correctly blocked.");

  // Then, call into localhost with a valid signature
  await testSignaturePasses();
  console.log("Test passed: Authorized access correctly granted.");
}

runTest()
  .then(() => {
    console.log("Test Complete: You are now AI Agent ready.");
  })
  .catch((error) => {
    console.error("Test failed:", error);
  });
