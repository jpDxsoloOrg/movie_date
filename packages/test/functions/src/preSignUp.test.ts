import { handler } from "@movie-date/functions/preSignUp";
import type { PreSignUpTriggerEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";

describe("preSignUp", () => {
  it("confirms the user and verifies their email", async () => {
    const event = {
      response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
    } as PreSignUpTriggerEvent;
    const result = await handler(event);
    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(true);
    expect(result.response.autoVerifyPhone).toBe(false);
  });
});
