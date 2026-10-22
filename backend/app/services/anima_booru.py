"""Anima booru tag order and escaping. Pure: no config, no model, no I/O.

PixAI returns category maps. Anima wants those tags in a fixed order, with
spaces instead of underscores, parentheses escaped once, and ``score_N`` tags
left unchanged. Safety and count tags stay. Character names stay only when the
caller asks for them.
"""
from __future__ import annotations

import re

_SCORE_RE = re.compile(r'^score_\d+(?:_up)?$', re.I)
_YEAR_RE = re.compile(r'^year \d{4}$')
_COUNT_RE = re.compile(
    r'^(?:solo|solo focus|multiple girls|multiple boys|no humans|'
    r'\d+\+?(?:girl|girls|boy|boys|other|others))$')

_QUALITY = frozenset({
    'masterpiece', 'best quality', 'high quality', 'normal quality',
    'low quality', 'worst quality',
})
_META = frozenset({
    'highres', 'absurdres', 'lowres', 'incredibly absurdres',
})
_SAFETY = frozenset({
    'safe', 'sensitive', 'nsfw', 'explicit', 'general', 'questionable',
})
_RATING_ALIAS = {
    'rating:g': 'general',
    'rating:s': 'sensitive',
    'rating:q': 'questionable',
    'rating:e': 'explicit',
    'rating_g': 'general',
    'rating_s': 'sensitive',
    'rating_q': 'questionable',
    'rating_e': 'explicit',
}
_BUCKETS = (
    'quality', 'meta', 'year', 'safety', 'count',
    'character', 'copyright', 'artist', 'general',
)
_COPYRIGHT_CATEGORIES = frozenset({'copyright', 'series'})
_ARTIST_CATEGORIES = frozenset({'artist'})


def _escape_parens(text: str) -> str:
    """Escape ``(`` and ``)`` once. An already-escaped pair is left alone."""
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == '\\' and i + 1 < len(text) and text[i + 1] in '()':
            out.append(text[i:i + 2])
            i += 2
            continue
        if ch in '()':
            out.append('\\' + ch)
        else:
            out.append(ch)
        i += 1
    return ''.join(out)


def normalize_anima_tag(tag: str) -> str:
    """One booru tag in Anima form.

    ``score_9`` and ``score_8_up`` keep their underscores. Every other
    underscore becomes a space. Parentheses are escaped, and a backslash that
    is already there is not doubled.
    """
    raw = ' '.join((tag or '').split())
    if not raw:
        return ''
    compact = raw.replace(' ', '_')
    if _SCORE_RE.fullmatch(compact):
        return compact.lower()
    spaced = ' '.join(raw.replace('_', ' ').split())
    return _escape_parens(spaced.lower())


def _rating_word(raw: str) -> str | None:
    key = (raw or '').strip().lower().replace(' ', '_')
    return _RATING_ALIAS.get(key)


def _bucket(normalized: str, category: str) -> str:
    cat = (category or '').strip().lower()
    if cat == 'character':
        return 'character'
    if cat in _COPYRIGHT_CATEGORIES:
        return 'copyright'
    if cat in _ARTIST_CATEGORIES:
        return 'artist'
    if cat in ('rating', 'safety'):
        return 'safety'
    if cat == 'year' or _YEAR_RE.fullmatch(normalized) or normalized == 'newest':
        return 'year'
    if cat == 'quality' or normalized in _QUALITY or _SCORE_RE.fullmatch(normalized.replace(' ', '_')):
        return 'quality'
    if cat == 'meta':
        return 'meta'
    if normalized in _META:
        return 'meta'
    if normalized in _SAFETY:
        return 'safety'
    if _COUNT_RE.fullmatch(normalized):
        return 'count'
    return 'general'


def _as_artist(normalized: str) -> str:
    body = normalized[1:] if normalized.startswith('@') else normalized
    for prefix in ('artist:', 'artist '):
        if body.startswith(prefix):
            body = body[len(prefix):].strip()
    body = body.strip()
    return f'@{body}' if body else ''


def _category_maps(results) -> list[tuple[str, dict]]:
    if not isinstance(results, dict):
        return []
    maps = []
    for category, scores in results.items():
        if isinstance(scores, dict):
            maps.append((str(category), scores))
    return maps


def format_anima_booru(results, *, include_character: bool) -> str:
    """Category maps -> one comma-separated Anima tag line.

    Order: quality, meta, year, safety, count, character, series/copyright,
    ``@artist``, then everything else. Higher PixAI scores come first inside a
    group. Character names are omitted when ``include_character`` is false.
    """
    grouped = {name: [] for name in _BUCKETS}
    seen = set()
    index = 0
    for category, scores in _category_maps(results):
        ranked = []
        for key, value in scores.items():
            raw = str(key).strip()
            if not raw:
                continue
            try:
                score = float(value)
            except (TypeError, ValueError):
                score = 0.0
            ranked.append((-score, index, raw))
            index += 1
        ranked.sort()
        for neg, _index, raw in ranked:
            alias = _rating_word(raw) if category.strip().lower() in ('rating', 'safety') else None
            normalized = alias or normalize_anima_tag(raw)
            if not normalized:
                continue
            bucket = _bucket(normalized, category)
            if bucket == 'character' and not include_character:
                continue
            if bucket == 'artist':
                normalized = _as_artist(normalized)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            grouped[bucket].append(normalized)
    ordered = []
    for name in _BUCKETS:
        ordered.extend(grouped[name])
    return ', '.join(ordered)


def hybrid_grounding(tags: str) -> str:
    """The sentence that hands PixAI tags to the vision model."""
    shown = ' '.join((tags or '').split()) or '(none)'
    return (
        f'Tags detected: {shown}; describe the scene, pose, clothing and '
        'background in 1-3 sentences, consistent with these tags. '
        'Do not repeat the tag list. Write one paragraph with no line breaks.'
    )


def compose_hybrid_caption(tags: str, prose: str) -> str:
    """``tags. prose`` on one line. Either half may be empty."""
    tag_line = ' '.join((tags or '').split()).strip().rstrip('.')
    prose_line = ' '.join((prose or '').split()).strip()
    if tag_line and prose_line:
        return f'{tag_line}. {prose_line}'
    return tag_line or prose_line
