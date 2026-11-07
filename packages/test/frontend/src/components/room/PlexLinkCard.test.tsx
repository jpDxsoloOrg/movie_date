import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  startPlexLink: vi.fn(),
  confirmPlexLink: vi.fn(),
  unlinkPlex: vi.fn(),
}));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));

import { PlexLinkCard } from "@movie-date/frontend/components/room/PlexLinkCard";
import { ApiError } from "@movie-date/frontend/services/api";
import { makeMember, makeProfile, makeRoom, renderWithRoom } from "../../support/roomHarness";

const codeField = (): HTMLElement => screen.getByLabelText("6-digit code");

async function requestCode(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Email Me a Code" }));
  await screen.findByLabelText("6-digit code");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.startPlexLink.mockResolvedValue({ sent: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlexLinkCard", () => {
  it("offers the link without calling the API on its own", () => {
    renderWithRoom(<PlexLinkCard />);

    expect(screen.getByRole("heading", { name: "Plex Request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email Me a Code" })).toBeInTheDocument();
    expect(api.startPlexLink).not.toHaveBeenCalled();
  });

  it("says so when a roommate has already linked", () => {
    renderWithRoom(<PlexLinkCard />, { room: makeRoom({ plexAvailable: true }) });
    expect(screen.getByText(/already linked theirs/)).toBeInTheDocument();
  });

  it("asks for the code without claiming an account exists", async () => {
    renderWithRoom(<PlexLinkCard />);
    await requestCode();

    expect(api.startPlexLink).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/a code is on its way/)).toHaveTextContent(/^If me@example\.com has a Plex Request account/);
    expect(codeField()).toHaveFocus();
  });

  it("stays on the first step and says why when Plex Request is down", async () => {
    api.startPlexLink.mockRejectedValue(new ApiError("Plex Request is unavailable right now", "UPSTREAM"));
    renderWithRoom(<PlexLinkCard />);

    await userEvent.click(screen.getByRole("button", { name: "Email Me a Code" }));

    expect(await screen.findByText("Plex Request is unavailable right now")).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email Me a Code" })).toBeEnabled();
  });

  it("lets someone with a code from earlier enter it without another email", async () => {
    api.confirmPlexLink.mockResolvedValue(makeProfile({ plexLinked: true }));
    renderWithRoom(<PlexLinkCard />);

    await userEvent.click(screen.getByRole("button", { name: "I Have a Code" }));
    await userEvent.type(codeField(), "123456{Enter}");

    await waitFor(() => expect(api.confirmPlexLink).toHaveBeenCalledWith("123456"));
    expect(api.startPlexLink).not.toHaveBeenCalled();
  });

  it("keeps only digits, including from a paste with spaces", async () => {
    renderWithRoom(<PlexLinkCard />);
    await requestCode();

    fireEvent.change(codeField(), { target: { value: " 12 34-56 789" } });

    expect(codeField()).toHaveValue("123456");
  });

  it("wants all six digits before spending an attempt", async () => {
    renderWithRoom(<PlexLinkCard />);
    await requestCode();

    await userEvent.type(codeField(), "123");
    await userEvent.click(screen.getByRole("button", { name: "Link Account" }));

    expect(screen.getByText("Enter all 6 digits")).toBeInTheDocument();
    expect(api.confirmPlexLink).not.toHaveBeenCalled();
  });

  it("links with the code and applies the profile", async () => {
    const linked = makeProfile({ plexLinked: true });
    api.confirmPlexLink.mockResolvedValue(linked);
    const { context } = renderWithRoom(<PlexLinkCard />);
    await requestCode();

    await userEvent.type(codeField(), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Link Account" }));

    expect(await screen.findByText("Plex Request linked")).toBeInTheDocument();
    expect(context.setMe).toHaveBeenCalledWith(linked);
  });

  it("shows a wrong code's error by the field and allows another try", async () => {
    api.confirmPlexLink.mockRejectedValue(new ApiError("That code isn't right, or it has expired.", "VALIDATION"));
    const { context } = renderWithRoom(<PlexLinkCard />);
    await requestCode();

    await userEvent.type(codeField(), "000000{Enter}");

    expect(await screen.findByText("That code isn't right, or it has expired.")).toBeInTheDocument();
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(context.setMe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Link Account" })).toBeEnabled();

    await userEvent.type(codeField(), "{Backspace}");
    expect(screen.queryByText("That code isn't right, or it has expired.")).not.toBeInTheDocument();
  });

  it("holds Resend for the server's minute, then sends again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithRoom(<PlexLinkCard />);
    fireEvent.click(screen.getByRole("button", { name: "Email Me a Code" }));
    await screen.findByLabelText("6-digit code");

    expect(screen.getByRole("button", { name: "Resend in 60s" })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("button", { name: "Resend in 30s" })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const resend = screen.getByRole("button", { name: "Resend Code" });
    expect(resend).toBeEnabled();

    fireEvent.click(resend);
    await waitFor(() => expect(api.startPlexLink).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: /^Resend in/ })).toBeDisabled();
  });

  it("goes back to the first step", async () => {
    renderWithRoom(<PlexLinkCard />);
    await requestCode();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Email Me a Code" })).toHaveFocus();
  });

  describe("once linked", () => {
    const me = makeProfile({ plexLinked: true });

    const openConfirm = async (): Promise<HTMLElement> => {
      await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
      return screen.getByRole("dialog", { name: "Unlink Plex Request?" });
    };

    it("shows the linked address and no way to start again", () => {
      renderWithRoom(<PlexLinkCard />, { me });

      expect(screen.getByText("Linked")).toBeInTheDocument();
      expect(screen.getByText("me@example.com")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Email Me a Code" })).not.toBeInTheDocument();
    });

    it("confirms before unlinking, and Cancel keeps the link", async () => {
      renderWithRoom(<PlexLinkCard />, { me });
      const dialog = await openConfirm();

      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.unlinkPlex).not.toHaveBeenCalled();
    });

    it("warns about the room's filter according to who else is there", async () => {
      renderWithRoom(<PlexLinkCard />, { me, room: makeRoom({ members: [makeMember("me", "Me", true)] }) });
      const dialog = await openConfirm();

      expect(dialog).toHaveTextContent("the Plex filter goes away.");
      expect(dialog).not.toHaveTextContent("someone else");
    });

    it("unlinks and applies the profile", async () => {
      const unlinked = makeProfile({ plexLinked: false });
      api.unlinkPlex.mockResolvedValue(unlinked);
      const { context } = renderWithRoom(<PlexLinkCard />, { me });
      const dialog = await openConfirm();

      await userEvent.click(within(dialog).getByRole("button", { name: "Unlink" }));

      expect(await screen.findByText("Plex Request unlinked")).toBeInTheDocument();
      expect(context.setMe).toHaveBeenCalledWith(unlinked);
    });

    it("keeps the dialog open and says why when unlinking fails", async () => {
      api.unlinkPlex.mockRejectedValue(new ApiError("Can't reach the server.", "NETWORK"));
      const { context } = renderWithRoom(<PlexLinkCard />, { me });
      const dialog = await openConfirm();

      await userEvent.click(within(dialog).getByRole("button", { name: "Unlink" }));

      expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
      expect(context.setMe).not.toHaveBeenCalled();
      expect(within(dialog).getByRole("button", { name: "Unlink" })).toBeEnabled();
    });
  });
});
