// Keep only nearby decoded images. Failed loads can be retried on navigation.
export function createReviewImagePreloader(makeImage = () => new Image()) {
  const images = new Map();
  return (urls) => {
    const nearby = new Set(urls.filter(Boolean));
    for (const url of images.keys()) {
      if (!nearby.has(url)) images.delete(url);
    }
    for (const url of nearby) {
      if (images.has(url)) continue;
      const image = makeImage();
      images.set(url, image);
      image.onerror = () => {
        if (images.get(url) === image) images.delete(url);
      };
      image.onload = () => { image.decode?.().catch(() => {}); };
      image.src = url;
    }
  };
}
