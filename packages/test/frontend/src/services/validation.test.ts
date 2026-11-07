import { describe, expect, it } from "vitest";
import {
  validateConfirmPassword,
  validateLoginPassword,
  validateNewPassword,
  validateRequired,
} from "@movie-date/frontend/services/validation";

describe("old form validators", () => {
  it("login password: six characters", () => {
    expect(validateLoginPassword("12345")).toBe("Password must be at least 6 characters");
    expect(validateLoginPassword("123456")).toBeNull();
  });

  it("required", () => {
    expect(validateRequired("")).toBe("Required");
    expect(validateRequired("a")).toBeNull();
  });

  it("register password", () => {
    expect(validateNewPassword("")).toBe("Required");
    expect(validateNewPassword("12345")).toBe("6 characters minimum");
    expect(validateNewPassword("123456")).toBeNull();
  });

  it("confirm password", () => {
    expect(validateConfirmPassword("", "secret1")).toBe("Required");
    expect(validateConfirmPassword("secret2", "secret1")).toBe("Passwords do not match");
    expect(validateConfirmPassword("secret1", "secret1")).toBeNull();
  });
});
