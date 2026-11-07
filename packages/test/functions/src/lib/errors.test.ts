import {
  INTERNAL_ERROR_MESSAGE,
  InvalidRoomCodeError,
  NotFoundError,
  toClientError,
  ValidationError,
} from "@movie-date/functions/lib/errors";
import { describe, expect, it } from "vitest";

describe("toClientError", () => {
  it("passes app errors through", () => {
    const error = new NotFoundError("No such room");
    expect(toClientError(error)).toBe(error);
    expect(error.name).toBe("NOT_FOUND");
  });

  it("hides anything else", () => {
    const safe = toClientError(new Error("arn:aws:dynamodb:secret-table"));
    expect(safe.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(safe.code).toBe("INTERNAL");
  });
});

describe("InvalidRoomCodeError", () => {
  it("carries the spec's exact message", () => {
    const error = new InvalidRoomCodeError();
    expect(error.message).toBe("Invalid room code");
    expect(error).toBeInstanceOf(ValidationError);
  });
});
