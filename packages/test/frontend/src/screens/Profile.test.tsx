import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ updateProfile: vi.fn(), uploadAvatar: vi.fn() }));
const crop = vi.hoisted(() => ({ cropAvatar: vi.fn() }));
vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api,
}));
vi.mock("../../../../frontend/src/components/room/cropAvatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../frontend/src/components/room/cropAvatar")>()),
  cropAvatar: crop.cropAvatar,
}));

import Profile from "@movie-date/frontend/screens/Profile";
import { ApiError } from "@movie-date/frontend/services/api";
import { makeProfile, renderWithRoom } from "../support/roomHarness";

const cropped = new Blob(["jpeg"], { type: "image/jpeg" });
const photo = new File(["raw"], "me.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  crop.cropAvatar.mockResolvedValue(cropped);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

async function pickPhoto(file: File = photo): Promise<void> {
  await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Choose a profile photo"), file);
}

describe("Profile", () => {
  it("starts from the current profile", () => {
    const me = makeProfile({ displayName: "Jo", avatarUrl: "https://x.test/a.jpg" });
    const { container } = renderWithRoom(<Profile />, { me });

    expect(screen.getByLabelText("Display Name")).toHaveValue("Jo");
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "https://x.test/a.jpg");
  });

  it("requires a display name", async () => {
    renderWithRoom(<Profile />);
    await userEvent.clear(screen.getByLabelText("Display Name"));
    await userEvent.type(screen.getByLabelText("Display Name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Please enter a display name")).toBeInTheDocument();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("saves a trimmed name and updates the profile everywhere", async () => {
    const saved = makeProfile({ displayName: "Jo" });
    api.updateProfile.mockResolvedValue(saved);
    const { context } = renderWithRoom(<Profile />);

    await userEvent.clear(screen.getByLabelText("Display Name"));
    await userEvent.type(screen.getByLabelText("Display Name"), " Jo ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Profile saved!")).toBeInTheDocument();
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: "Jo", avatarKey: undefined });
    expect(api.uploadAvatar).not.toHaveBeenCalled();
    expect(context.setMe).toHaveBeenCalledWith(saved);
  });

  it("previews a picked photo without uploading it yet", async () => {
    const { container } = renderWithRoom(<Profile />);
    await pickPhoto();

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:preview"));
    expect(crop.cropAvatar).toHaveBeenCalledWith(photo);
    expect(api.uploadAvatar).not.toHaveBeenCalled();
  });

  it("uploads the cropped JPEG on save and stores its key", async () => {
    api.uploadAvatar.mockResolvedValue("avatars/me/key");
    api.updateProfile.mockResolvedValue(makeProfile());
    const { container } = renderWithRoom(<Profile />);

    await pickPhoto();
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Profile saved!");
    expect(api.uploadAvatar).toHaveBeenCalledWith(cropped, "image/jpeg");
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: "Me", avatarKey: "avatars/me/key" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("keeps the photo after a failed upload, so Save can retry", async () => {
    api.uploadAvatar.mockRejectedValue(new ApiError("That image couldn't be uploaded.", "UNKNOWN"));
    const { container, context } = renderWithRoom(<Profile />);

    await pickPhoto();
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That image couldn't be uploaded.")).toBeInTheDocument();
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(context.setMe).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toHaveAttribute("src", "blob:preview");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("doesn't upload twice when only the profile update failed", async () => {
    api.uploadAvatar.mockResolvedValue("avatars/me/key");
    api.updateProfile.mockRejectedValueOnce(new ApiError("Try again.", "NETWORK")).mockResolvedValue(makeProfile());
    const { container } = renderWithRoom(<Profile />);

    await pickPhoto();
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Try again.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Profile saved!");
    expect(api.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(api.updateProfile).toHaveBeenLastCalledWith({ displayName: "Me", avatarKey: "avatars/me/key" });
  });

  it("turns away a file that isn't an image", async () => {
    renderWithRoom(<Profile />);
    await pickPhoto(new File(["text"], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByText("That file isn't an image.")).toBeInTheDocument();
    expect(crop.cropAvatar).not.toHaveBeenCalled();
  });

  it("reports an image that can't be read", async () => {
    crop.cropAvatar.mockRejectedValue(new Error("That image couldn't be read. Try a JPEG or PNG."));
    renderWithRoom(<Profile />);
    await pickPhoto();

    expect(await screen.findByText(/couldn't be read/)).toBeInTheDocument();
  });
});
