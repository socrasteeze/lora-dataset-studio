import { useEffect, useRef } from 'react';
import { createReviewImagePreloader } from './reviewImagePreload.js';

export function useReviewImagePreload(urls) {
  const preload = useRef(null);
  if (!preload.current) preload.current = createReviewImagePreloader();
  useEffect(() => { preload.current(urls); }, [urls]);
}
