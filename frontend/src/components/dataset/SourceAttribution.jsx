import PexelsAttribution from './PexelsAttribution';
import WebImageSource from './WebImageSource';
import ImageSourceAttribution from './ImageSourceAttribution';
import { SOURCE_NAMES } from '../shared/imageSources.js';

/**
 * Provenance is recorded for a GROWING list of scraper sources (Pexels today,
 * web search, and more platforms already tracked as debt). Each platform keeps
 * its own fail-closed renderer — the wording and links a photo credit needs are
 * not the wording and links a "found on this page" note needs — but every
 * render site only wants ONE tile: "show whatever provenance this image has,
 * or nothing". Stacking a new `<XAttribution>` at every render site (grid tile,
 * lightbox, …) for each new platform is exactly what would not scale past a
 * couple of sources; this is the single dispatch point instead.
 *
 * Adding platform #3 is one new line in PLATFORM_RENDERERS plus its own small
 * component — never a change at a render site.
 */
const PLATFORM_RENDERERS = {
  pexels: PexelsAttribution,
  websearch: WebImageSource,
  ...Object.fromEntries(Object.keys(SOURCE_NAMES).map((key) => [key, ImageSourceAttribution])),
};

export default function SourceAttribution({ metadata, className = '' }) {
  const platform = metadata && typeof metadata === 'object' ? metadata.platform : null;
  const Renderer = metadata?.acquisition === true ? ImageSourceAttribution : PLATFORM_RENDERERS[platform];
  // The acquisition renderer validates public source links. Legacy renderers
  // retain their own host allowlists. A platform or acquisition marker alone
  // never bypasses the chosen renderer's payload validation.
  if (!Renderer) return null;
  return <Renderer metadata={metadata} className={className} />;
}
