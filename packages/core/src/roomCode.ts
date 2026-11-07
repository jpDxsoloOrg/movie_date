/** Omits I, L, O, 0 and 1, which people misread when a code is said aloud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

/** Fills a buffer with cryptographically strong bytes. */
export type RandomBytes = (buffer: Uint8Array) => Uint8Array;

const secureRandomBytes: RandomBytes = (buffer) => globalThis.crypto.getRandomValues(buffer);

/** Bytes at or above this are rejected: keeping them would bias the early letters. */
const UNBIASED_BYTE_LIMIT = 256 - (256 % ROOM_CODE_ALPHABET.length);

export function generateRoomCode(randomBytes: RandomBytes = secureRandomBytes): string {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of randomBytes(new Uint8Array(ROOM_CODE_LENGTH * 2))) {
      if (byte < UNBIASED_BYTE_LIMIT && code.length < ROOM_CODE_LENGTH) {
        code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

/** Forgives what people do when typing or pasting a code: case, spaces, dashes. */
export function normaliseRoomCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((character) => ROOM_CODE_ALPHABET.includes(character))
  );
}
