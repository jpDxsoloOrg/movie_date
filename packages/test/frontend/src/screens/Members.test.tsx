import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ leaveRoom: vi.fn() }));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));

import Members from "@movie-date/frontend/screens/Members";
import { ApiError } from "@movie-date/frontend/services/api";
import { makeMember, makeRoom, renderWithRoom } from "../support/roomHarness";

beforeEach(() => vi.clearAllMocks());

async function openConfirm(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: "Leave Room" }));
  return screen.getByRole("dialog", { name: "Leave this room?" });
}

describe("Members", () => {
  it("lists members, marks you, and shows no emails", () => {
    renderWithRoom(<Members />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("You")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Sam")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText("You")).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("shows a member's avatar and falls back when it fails to load", async () => {
    const room = makeRoom({
      members: [{ ...makeMember("u2", "Sam"), avatarUrl: "https://x.test/a.jpg" }],
    });
    const { container } = renderWithRoom(<Members />, { room });

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://x.test/a.jpg");

    image?.dispatchEvent(new Event("error"));
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
  });

  it("invites someone when you're alone", () => {
    renderWithRoom(<Members />, { room: makeRoom({ members: [makeMember("me", "Me", true)] }) });
    expect(screen.getByText("It's just you so far")).toBeInTheDocument();
  });

  it("has the invite panel for this room", () => {
    renderWithRoom(<Members />);
    expect(screen.getByLabelText("Invite link")).toHaveValue(`${window.location.origin}/join/ABC234`);
  });

  it("says what makes a match, and links to where it's changed", () => {
    renderWithRoom(<Members />, { room: makeRoom({ matchThreshold: 2 }) });

    expect(screen.getByText("2 yeses make a match.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/settings");
  });

  it("refreshes the room on arrival", async () => {
    const { context } = renderWithRoom(<Members />);
    await waitFor(() => expect(context.refreshRoom).toHaveBeenCalled());
  });

  it("offers a retry when the refresh fails, keeping the list", async () => {
    const refreshRoom = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    renderWithRoom(<Members />, { refreshRoom });

    expect(await screen.findByRole("alert")).toHaveTextContent("out of date");
    expect(screen.getByText("Sam")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("says when live updates are down", () => {
    renderWithRoom(<Members />, { realtimeStatus: "offline" });
    expect(screen.getByText("Reconnecting. Live updates are paused.")).toBeInTheDocument();
  });

  it("confirms before leaving, and Cancel leaves you in the room", async () => {
    renderWithRoom(<Members />);
    const dialog = await openConfirm();

    expect(api.leaveRoom).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.leaveRoom).not.toHaveBeenCalled();
  });

  it("leaves, applies the new room and goes home", async () => {
    const fresh = makeRoom({ id: "room-2", code: "NEW234" });
    api.leaveRoom.mockResolvedValue(fresh);
    const { context } = renderWithRoom(<Members />, {}, "/members");
    const dialog = await openConfirm();

    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(context.setRoom).toHaveBeenCalledWith(fresh));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("stays put and says why when leaving fails", async () => {
    api.leaveRoom.mockRejectedValue(new ApiError("Can't reach the server.", "NETWORK"));
    const { context } = renderWithRoom(<Members />, {}, "/members");
    const dialog = await openConfirm();

    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
    expect(context.setRoom).not.toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent("/members");
    expect(within(dialog).getByRole("button", { name: "Leave" })).toBeEnabled();
  });
});
