import {
  generateRoomCode,
  isValidRoomCode,
  normaliseRoomCode,
  ROOM_CODE_ALPHABET,
} from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("generateRoomCode", () => {
  it("produces valid codes", () => {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });

  it("skips bytes that would bias the alphabet, fetching more if needed", () => {
    let calls = 0;
    const code = generateRoomCode((buffer) => {
      calls += 1;
      return buffer.fill(calls === 1 ? 255 : 0);
    });
    expect(calls).toBe(2);
    expect(code).toBe(ROOM_CODE_ALPHABET[0]!.repeat(6));
  });

  it("leaves out characters people misread", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[ILO01]/);
  });
});

describe("normaliseRoomCode", () => {
  it("forgives case, spaces and dashes", () => {
    expect(normaliseRoomCode(" abc-d 23\n")).toBe("ABCD23");
  });
});

describe("isValidRoomCode", () => {
  it.each(["ABCD2", "ABCD234", "ABCDE1", "abcd23", ""])("rejects %j", (code) => {
    expect(isValidRoomCode(code)).toBe(false);
  });
});
