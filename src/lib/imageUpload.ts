export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 720,
  maxLength = 150000
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধুমাত্র ছবির ফাইল (JPG, PNG, WebP) আপলোড করা যাবে।');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('ছবিটি পড়া যায়নি।'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('ব্রাউজার ইমেজ প্রসেসিং সাপোর্ট করছে না।');
    }

    const renderWithParams = (w: number, h: number, quality: number) => {
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', quality);
    };

    const qualities = [0.8, 0.68, 0.56, 0.45];
    for (const q of qualities) {
      const result = renderWithParams(width, height, q);
      if (result.length <= maxLength) {
        return result;
      }
    }

    // Fallback smaller dimensions if original was very large/complex
    const smallerW = Math.max(1, Math.round(width * 0.7));
    const smallerH = Math.max(1, Math.round(height * 0.7));
    return renderWithParams(smallerW, smallerH, 0.52);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
