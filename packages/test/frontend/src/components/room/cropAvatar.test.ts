import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_SIZE, centreSquare, cropAvatar } from "../../../../../frontend/src/components/room/cropAvatar";

class FakeImage {
  static width = 1000;
  static height = 600;
  static fails = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = FakeImage.width;
  naturalHeight = FakeImage.height;

  set src(_url: string) {
    queueMicrotask(() => (FakeImage.fails ? this.onerror?.() : this.onload?.()));
  }
}

const context = {
  fillStyle: "",
  imageSmoothingQuality: "low",
  fillRect: vi.fn(),
  drawImage: vi.fn(),
};
const result = new Blob(["jpeg"], { type: "image/jpeg" });
let toBlob: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  FakeImage.width = 1000;
  FakeImage.height = 600;
  FakeImage.fails = false;
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = vi.fn(() => "blob:source");
  URL.revokeObjectURL = vi.fn();
  toBlob = vi.fn((done: BlobCallback) => done(result));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
  HTMLCanvasElement.prototype.toBlob = toBlob as never;
});

afterEach(() => vi.unstubAllGlobals());

describe("centreSquare", () => {
  it("takes the middle of a landscape image", () => {
    expect(centreSquare(1000, 600)).toEqual({ x: 200, y: 0, size: 600 });
  });

  it("takes the middle of a portrait image", () => {
    expect(centreSquare(600, 1000)).toEqual({ x: 0, y: 200, size: 600 });
  });
});

describe("cropAvatar", () => {
  it("draws the centre square onto a 512px canvas and returns a JPEG", async () => {
    await expect(cropAvatar(new Blob(["x"]))).resolves.toBe(result);

    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(FakeImage),
      200,
      0,
      600,
      600,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    expect(toBlob.mock.calls[0]?.[1]).toBe("image/jpeg");
    expect(AVATAR_SIZE).toBe(512);
  });

  it("paints a background first, so transparency doesn't turn black", async () => {
    await cropAvatar(new Blob(["x"]));
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects an image the browser can't decode, and releases the URL", async () => {
    FakeImage.fails = true;
    await expect(cropAvatar(new Blob(["x"]))).rejects.toThrow("couldn't be read");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  it("rejects an image with no size", async () => {
    FakeImage.width = 0;
    await expect(cropAvatar(new Blob(["x"]))).rejects.toThrow("couldn't be read");
  });

  it("rejects when the canvas can't encode", async () => {
    toBlob.mockImplementation((done: BlobCallback) => done(null));
    await expect(cropAvatar(new Blob(["x"]))).rejects.toThrow("couldn't be read");
  });
});
