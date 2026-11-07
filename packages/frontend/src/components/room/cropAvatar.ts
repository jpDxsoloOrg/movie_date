export const AVATAR_SIZE = 512;
export const AVATAR_CONTENT_TYPE = "image/jpeg";

const JPEG_QUALITY = 0.85;
const UNREADABLE_IMAGE = "That image couldn't be read. Try a JPEG or PNG.";

export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

export function centreSquare(width: number, height: number): SquareCrop {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(UNREADABLE_IMAGE));
    image.src = url;
  });
}

async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(UNREADABLE_IMAGE))),
      AVATAR_CONTENT_TYPE,
      JPEG_QUALITY,
    );
  });
}

/**
 * Going through an <img> rather than reading the bytes means the browser applies
 * EXIF rotation, so phone photos don't come out sideways.
 */
export async function cropAvatar(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const { x, y, size } = centreSquare(image.naturalWidth, image.naturalHeight);
    if (size === 0) throw new Error(UNREADABLE_IMAGE);

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(UNREADABLE_IMAGE);

    // JPEG has no alpha, so a transparent PNG would otherwise turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await toJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
