import { MAX_PHOTO_CHARS } from '../shared/protocol';

const SIZE = 128;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = url;
  });
}

/**
 * Turns a camera photo (any size, any orientation) into a small square JPEG data URL: centre crop,
 * 128 x 128, compressed until it fits the server's size limit. Done on the phone so only a few KB are sent.
 */
export async function fileToAvatar(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side <= 0) throw new Error('That file is not a readable image.');

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot process photos.');
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);

    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_PHOTO_CHARS) return data;
    }
    throw new Error('The photo is too detailed to send. Try again.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
