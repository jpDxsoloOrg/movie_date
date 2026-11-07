import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ joinRoom: vi.fn() }));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));

import type { RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import JoinInvite from "@movie-date/frontend/screens/JoinInvite";
import { ApiError } from "@movie-date/frontend/services/api";
import { makeMember, makeRoom, renderWithRoom } from "../support/roomHarness";

function renderInvite(code: string, overrides: Partial<RoomContextValue> = {}) {
  return renderWithRoom(
    <Routes>
      <Route path="/join/:code" element={<JoinInvite />} />
      <Route path="*" element={null} />
    </Routes>,
    overrides,
    `/join/${code}`,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("JoinInvite", () => {
  it("confirms first, naming who you'd leave, and doesn't join on its own", () => {
    renderInvite("XYZ234");

    expect(screen.getByRole("heading", { name: "Join room XYZ234?" })).toBeInTheDocument();
    expect(screen.getByText(/You're in room ABC234 with Sam\./)).toBeInTheDocument();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it("counts the others in a bigger room", () => {
    const room = makeRoom({
      members: [makeMember("me", "Me", true), makeMember("u2", "Sam"), makeMember("u3", "Ari"), makeMember("u4", "Jo")],
    });
    renderInvite("XYZ234", { room });
    expect(screen.getByText(/with Sam and 2 others\./)).toBeInTheDocument();
  });

  it("still asks someone alone in their room", () => {
    renderInvite("XYZ234", { room: makeRoom({ members: [makeMember("me", "Me", true)] }) });
    expect(screen.getByText(/You're in room ABC234\./)).toBeInTheDocument();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it("joins on confirmation, normalising the code, and goes home", async () => {
    const joined = makeRoom({ id: "room-2", code: "XYZ234" });
    api.joinRoom.mockResolvedValue(joined);
    const { context } = renderInvite("xyz234");

    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));

    await waitFor(() => expect(context.setRoom).toHaveBeenCalledWith(joined));
    expect(api.joinRoom).toHaveBeenCalledWith("XYZ234");
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("Stay Here goes home without joining", async () => {
    renderInvite("XYZ234");
    await userEvent.click(screen.getByRole("button", { name: "Stay Here" }));

    expect(api.joinRoom).not.toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("recognises your own room", () => {
    renderInvite("abc234");

    expect(screen.getByText("You're already in this room")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join Room" })).not.toBeInTheDocument();
  });

  it("rejects a malformed code without calling the API", () => {
    renderInvite("nope");

    expect(screen.getByText("Invalid room code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join Room" })).not.toBeInTheDocument();
  });

  it("shows an unknown code's error with no retry", async () => {
    api.joinRoom.mockRejectedValue(new ApiError("Invalid room code", "VALIDATION"));
    renderInvite("XYZ234");

    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid room code");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go Home" })).toBeInTheDocument();
  });

  it("retries a network failure", async () => {
    const joined = makeRoom({ id: "room-2", code: "XYZ234" });
    api.joinRoom.mockRejectedValueOnce(new ApiError("Can't reach the server.", "NETWORK")).mockResolvedValue(joined);
    const { context } = renderInvite("XYZ234");

    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(context.setRoom).toHaveBeenCalledWith(joined));
  });
});
