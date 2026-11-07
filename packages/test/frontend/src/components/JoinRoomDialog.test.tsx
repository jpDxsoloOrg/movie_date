import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ joinRoom: vi.fn() }));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));

import JoinRoomDialog from "@movie-date/frontend/components/JoinRoomDialog";
import { ApiError } from "@movie-date/frontend/services/api";
import { makeRoom, renderWithRoom } from "../support/roomHarness";

beforeEach(() => vi.clearAllMocks());

describe("JoinRoomDialog", () => {
  it("renders nothing while closed", () => {
    renderWithRoom(<JoinRoomDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses the field and upper-cases what's typed", async () => {
    renderWithRoom(<JoinRoomDialog open onClose={vi.fn()} />);
    const field = screen.getByLabelText("Enter Room Code");
    expect(field).toHaveFocus();

    await userEvent.type(field, "abc");
    expect(field).toHaveValue("ABC");
  });

  it("takes a pasted code with its hyphen and stops at the code's length", () => {
    renderWithRoom(<JoinRoomDialog open onClose={vi.fn()} />);
    const field = screen.getByLabelText("Enter Room Code");

    fireEvent.change(field, { target: { value: "abc-234xyz" } });

    expect(field).toHaveValue("ABC234");
  });

  it("normalises the code, applies the room and goes home", async () => {
    const joined = makeRoom({ id: "room-2", code: "XYZ234" });
    api.joinRoom.mockResolvedValue(joined);
    const onClose = vi.fn();
    const { context } = renderWithRoom(<JoinRoomDialog open onClose={onClose} />);

    await userEvent.type(screen.getByLabelText("Enter Room Code"), "xyz-234{Enter}");

    await waitFor(() => expect(context.setRoom).toHaveBeenCalledWith(joined));
    expect(api.joinRoom).toHaveBeenCalledWith("XYZ234");
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });

  it("asks for a code before calling the API", async () => {
    renderWithRoom(<JoinRoomDialog open onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Enter a room code")).toBeInTheDocument();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it("shows the backend's error and stays open for another try", async () => {
    api.joinRoom.mockRejectedValue(new ApiError("Invalid room code", "VALIDATION"));
    const onClose = vi.fn();
    const { context } = renderWithRoom(<JoinRoomDialog open onClose={onClose} />);

    await userEvent.type(screen.getByLabelText("Enter Room Code"), "NOPE22{Enter}");

    expect(await screen.findByText("Invalid room code")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(context.setRoom).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("cancels without joining", async () => {
    const onClose = vi.fn();
    renderWithRoom(<JoinRoomDialog open onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });
});
