// SECURITY NOTE:
// Placeholder only. Do not ship with base64 pseudo-encryption.
export async function encryptMessage(_chatId: string, plainText: string) {
  return {
    encryptedContent: Buffer.from(plainText, "utf8").toString("base64"),
    nonce: "dev-nonce",
  };
}

export async function decryptMessage(_chatId: string, encryptedContent: string) {
  try {
    return Buffer.from(encryptedContent, "base64").toString("utf8");
  } catch {
    return "[unable to decrypt]";
  }
}

