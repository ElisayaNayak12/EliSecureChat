export function encryptMessage(plainText: string): string {
  return btoa(unescape(encodeURIComponent(plainText)));
}

export function decryptMessage(encrypted: string): string {
  try {
    return decodeURIComponent(escape(atob(encrypted)));
  } catch {
    return "[Unable to decrypt]";
  }
}

