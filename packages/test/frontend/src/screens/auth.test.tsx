import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  forgotPassword: vi.fn(),
  confirmForgotPassword: vi.fn(),
  signOut: vi.fn(),
  getIdToken: vi.fn(),
}));
vi.mock("@movie-date/frontend/services/auth", () => auth);

import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import ForgotPassword from "@movie-date/frontend/screens/ForgotPassword";
import Login from "@movie-date/frontend/screens/Login";
import Register from "@movie-date/frontend/screens/Register";

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderScreen(ui: JSX.Element) {
  return render(
    <MemoryRouter future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ToastProvider>
        {ui}
        <Path />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Login", () => {
  it("validates the password as you type", async () => {
    renderScreen(<Login />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("PASSWORD"), "123");
    expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument();

    await user.type(screen.getByLabelText("PASSWORD"), "456");
    expect(screen.queryByText("Password must be at least 6 characters")).not.toBeInTheDocument();
  });

  it("doesn't submit an invalid form", async () => {
    renderScreen(<Login />);
    await userEvent.click(screen.getByRole("button", { name: "LOG IN" }));

    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("signs in", async () => {
    auth.signIn.mockResolvedValue(undefined);
    renderScreen(<Login />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("EMAIL"), "a@b.co");
    await user.type(screen.getByLabelText("PASSWORD"), "secret1{Enter}");

    expect(auth.signIn).toHaveBeenCalledWith("a@b.co", "secret1");
  });

  it("toasts a failure and lets you retry", async () => {
    auth.signIn.mockRejectedValue(new Error("Incorrect email or password."));
    renderScreen(<Login />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("EMAIL"), "a@b.co");
    await user.type(screen.getByLabelText("PASSWORD"), "secret1");
    await user.click(screen.getByRole("button", { name: "LOG IN" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOG IN" })).toBeEnabled();
  });
});

describe("Register", () => {
  it("shows the old messages on an empty submit", async () => {
    renderScreen(<Register />);
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getAllByText("Required")).toHaveLength(3);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("enforces length and matching passwords", async () => {
    renderScreen(<Register />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("EMAIL"), "a@b.co");
    await user.type(screen.getByLabelText("PASSWORD"), "12345");
    await user.type(screen.getByLabelText("CONFIRM PASSWORD"), "54321");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText("6 characters minimum")).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("signs up", async () => {
    auth.signUp.mockResolvedValue(undefined);
    renderScreen(<Register />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("EMAIL"), "a@b.co");
    await user.type(screen.getByLabelText("PASSWORD"), "secret1");
    await user.type(screen.getByLabelText("CONFIRM PASSWORD"), "secret1");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(auth.signUp).toHaveBeenCalledWith("a@b.co", "secret1");
  });
});

describe("ForgotPassword", () => {
  async function requestCode(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    auth.forgotPassword.mockResolvedValue(undefined);
    await user.type(screen.getByLabelText("EMAIL"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Send Code" }));
    await screen.findByLabelText("CODE");
  }

  it("requires an email", async () => {
    renderScreen(<ForgotPassword />);
    await userEvent.click(screen.getByRole("button", { name: "Send Code" }));

    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
  });

  it("walks through code and new password, then returns to login", async () => {
    auth.confirmForgotPassword.mockResolvedValue(undefined);
    renderScreen(<ForgotPassword />);
    const user = userEvent.setup();

    await requestCode(user);
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("CODE"), "123456");
    await user.type(screen.getByLabelText("NEW PASSWORD"), "secret1");
    await user.type(screen.getByLabelText("CONFIRM PASSWORD"), "secret1");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(auth.confirmForgotPassword).toHaveBeenCalledWith("a@b.co", "123456", "secret1");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/login"));
    expect(await screen.findByText("Password updated. Log in with your new password.")).toBeInTheDocument();
  });

  it("validates the reset form", async () => {
    renderScreen(<ForgotPassword />);
    const user = userEvent.setup();
    await requestCode(user);

    await user.type(screen.getByLabelText("NEW PASSWORD"), "123");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(screen.getByText("6 characters minimum")).toBeInTheDocument();
    expect(auth.confirmForgotPassword).not.toHaveBeenCalled();
  });

  it("stays on the form after a bad code", async () => {
    auth.confirmForgotPassword.mockRejectedValue(new Error("That code isn't right."));
    renderScreen(<ForgotPassword />);
    const user = userEvent.setup();
    await requestCode(user);

    await user.type(screen.getByLabelText("CODE"), "000000");
    await user.type(screen.getByLabelText("NEW PASSWORD"), "secret1");
    await user.type(screen.getByLabelText("CONFIRM PASSWORD"), "secret1");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findByText("That code isn't right.")).toBeInTheDocument();
    expect(screen.getByLabelText("CODE")).toHaveValue("000000");
  });
});
