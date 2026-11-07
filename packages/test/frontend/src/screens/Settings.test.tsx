import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ updateRoomSettings: vi.fn() }));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));

import Settings from "@movie-date/frontend/screens/Settings";
import { ApiError, type Member } from "@movie-date/frontend/services/api";
import { fakeRoomContext, makeMember, makeRoom, Providers, renderWithRoom } from "../support/roomHarness";

function people(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => makeMember(`u${index}`, `Person ${index}`, index === 0));
}

const slider = (): HTMLElement => screen.getByLabelText("Matches Required");
const majority = (): HTMLElement => screen.getByRole("checkbox", { name: "Require Majority" });
const saveButton = (): HTMLElement => screen.getByRole("button", { name: "Save Settings" });

beforeEach(() => vi.clearAllMocks());

describe("Settings", () => {
  it("runs the slider from 2 to the member count", () => {
    renderWithRoom(<Settings />, { room: makeRoom({ members: people(5), matchThreshold: 3 }) });

    expect(slider()).toHaveAttribute("min", "2");
    expect(slider()).toHaveAttribute("max", "5");
    expect(slider()).toHaveValue("3");
  });

  it("keeps a minimum of 2 and explains itself in a small room", () => {
    renderWithRoom(<Settings />, { room: makeRoom({ members: people(1) }) });

    expect(slider()).toHaveAttribute("max", "2");
    expect(slider()).toBeDisabled();
    expect(screen.getByText("Invite more people to raise this.")).toBeInTheDocument();
  });

  it("has nothing to save until something changes", () => {
    renderWithRoom(<Settings />, { room: makeRoom({ members: people(5) }) });
    expect(saveButton()).toBeDisabled();
  });

  it("saves the slider value and applies the room", async () => {
    const updated = makeRoom({ members: people(5), matchThreshold: 4 });
    api.updateRoomSettings.mockResolvedValue(updated);
    const { context } = renderWithRoom(<Settings />, { room: makeRoom({ members: people(5) }) });

    fireEvent.change(slider(), { target: { value: "4" } });
    await userEvent.click(saveButton());

    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
    expect(api.updateRoomSettings).toHaveBeenCalledWith(4, false);
    expect(context.setRoom).toHaveBeenCalledWith(updated);
  });

  it("Require Majority locks the slider at half the room, rounded up", async () => {
    api.updateRoomSettings.mockResolvedValue(makeRoom());
    renderWithRoom(<Settings />, { room: makeRoom({ members: people(7) }) });

    await userEvent.click(majority());

    expect(slider()).toBeDisabled();
    expect(slider()).toHaveValue("4");

    await userEvent.click(saveButton());
    await waitFor(() => expect(api.updateRoomSettings).toHaveBeenCalledWith(4, true));
  });

  it("never drops Require Majority below 2", async () => {
    renderWithRoom(<Settings />, { room: makeRoom({ members: people(3) }) });
    await userEvent.click(majority());
    expect(slider()).toHaveValue("2");
  });

  it("unticking keeps the value and frees the slider", async () => {
    const room = makeRoom({ members: people(7), matchThreshold: 4, requireMajority: true });
    renderWithRoom(<Settings />, { room });
    expect(slider()).toBeDisabled();

    await userEvent.click(majority());

    expect(slider()).toBeEnabled();
    expect(slider()).toHaveValue("4");
  });

  it("follows the room live while unedited", () => {
    const first = fakeRoomContext({ room: makeRoom({ members: people(6), requireMajority: true, matchThreshold: 3 }) });
    const { rerender } = render(
      <Providers context={first}>
        <Settings />
      </Providers>,
    );
    expect(slider()).toHaveValue("3");

    const grown = { ...first, room: makeRoom({ members: people(8), requireMajority: true, matchThreshold: 4 }) };
    rerender(
      <Providers context={grown}>
        <Settings />
      </Providers>,
    );
    expect(slider()).toHaveValue("4");
  });

  it("keeps your edit and says why when saving fails", async () => {
    api.updateRoomSettings.mockRejectedValue(new ApiError("Can't reach the server.", "NETWORK"));
    const { context } = renderWithRoom(<Settings />, { room: makeRoom({ members: people(5) }) });

    fireEvent.change(slider(), { target: { value: "4" } });
    await userEvent.click(saveButton());

    expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
    expect(context.setRoom).not.toHaveBeenCalled();
    expect(slider()).toHaveValue("4");
    expect(saveButton()).toBeEnabled();
  });
});
