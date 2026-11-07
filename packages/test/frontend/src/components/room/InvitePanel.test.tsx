import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvitePanel } from "@movie-date/frontend/components/room/InvitePanel";
import { renderWithRoom } from "../../support/roomHarness";

const link = `${window.location.origin}/join/ABC234`;
const writeText = vi.fn();

function stubNavigator(name: "share" | "clipboard", value: unknown): void {
  Object.defineProperty(navigator, name, { value, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
});

afterEach(() => {
  stubNavigator("share", undefined);
});

describe("InvitePanel", () => {
  it("shows the code and the invite link", () => {
    renderWithRoom(<InvitePanel code="ABC234" />);
    expect(screen.getByText("ABC234")).toBeInTheDocument();
    expect(screen.getByLabelText("Invite link")).toHaveValue(link);
  });

  it("copies the link", async () => {
    renderWithRoom(<InvitePanel code="ABC234" />);
    stubNavigator("clipboard", { writeText });
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(await screen.findByText("Invite link copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(link);
  });

  it("copies the code", async () => {
    renderWithRoom(<InvitePanel code="ABC234" />);
    stubNavigator("clipboard", { writeText });
    fireEvent.click(screen.getByRole("button", { name: "Copy room code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABC234"));
  });

  it("says so when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderWithRoom(<InvitePanel code="ABC234" />);
    stubNavigator("clipboard", { writeText });
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });

  it("hides Share where Web Share isn't available", () => {
    renderWithRoom(<InvitePanel code="ABC234" />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("shares the link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator("share", share);
    renderWithRoom(<InvitePanel code="ABC234" />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: link }));
  });

  it("stays quiet when the share sheet is dismissed", async () => {
    stubNavigator("share", vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
    renderWithRoom(<InvitePanel code="ABC234" />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(screen.queryByText(/Couldn't open sharing/)).not.toBeInTheDocument();
  });

  it("reports a real share failure", async () => {
    stubNavigator("share", vi.fn().mockRejectedValue(new Error("nope")));
    renderWithRoom(<InvitePanel code="ABC234" />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByText(/Couldn't open sharing/)).toBeInTheDocument();
  });

  it("draws a QR code of the link on request", async () => {
    renderWithRoom(<InvitePanel code="ABC234" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show QR Code" }));

    const code = await screen.findByRole("img", { name: `QR code for ${link}` });
    expect(code.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);

    await userEvent.click(screen.getByRole("button", { name: "Hide QR Code" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
