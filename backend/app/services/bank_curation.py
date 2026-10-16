"""Kind-aware, read-only shortlist selection over already measured images.

No model, network, database write or source-image edit belongs in this module.
Weights are editable starting points, not measured optimal training ratios.
Caption coverage is lexical evidence, not a classification of image pixels.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

from . import caption_coverage


KINDS = ('character', 'concept', 'style')
DEFAULT_AXIS = {'character': 'framing', 'concept': 'view', 'style': 'subject'}
FRAMING_WEIGHTS = {'face': 4.0, 'bust': 3.0, 'body': 2.0, 'back': 1.0}
TYPICALITY_DECADES = 3.0
AXES = ('framing', 'framing+person', 'subject', *caption_coverage.AXES)
TECHNICAL_FLAGS = frozenset({'blur', 'noise', 'uniform', 'small', 'soft_detail',
                             'bars', 'watermark'})
# Broad content categories only. Unknown content is never assigned a guessed label.
SUBJECT_WORDS = {
    'people': r'person|people|woman|women|man|men|girl|boy|portrait|character',
    'animals': r'animal|dog|cat|horse|bird|wolf|fox|fish|dragon',
    'landscapes': r'landscape|mountain|forest|beach|ocean|valley|desert|seascape',
    'buildings': r'building|architecture|house|castle|temple|cityscape|interior',
    'vehicles': r'vehicle|car|truck|train|aircraft|airplane|motorcycle|spaceship',
    'plants': r'plant|flower|tree|foliage|botanical',
    'objects': r'object|product|vase|bottle|chair|weapon|sword|jewelry|jewellery',
    'food': r'food|fruit|meal|cake|bread|dish',
}
SUBJECT_PATTERNS = {key: re.compile(r'\b(?:' + words + r')\b', re.I)
                    for key, words in SUBJECT_WORDS.items()}


def default_weights(kind, axis):
    if kind == 'character' and axis == 'framing':
        return dict(FRAMING_WEIGHTS)
    if axis == 'subject':
        return dict.fromkeys(SUBJECT_WORDS, 1.0)
    if axis in caption_coverage.AXES:
        return {bucket.id: 1.0 for bucket in caption_coverage.AXES[axis].buckets}
    if axis == 'framing':
        return dict.fromkeys(FRAMING_WEIGHTS, 1.0)
    return {}


def describe():
    """The UI reads defaults here so labels and training heuristics have one owner."""
    axes = [
        {'id': 'framing', 'label': 'Framing', 'buckets': list(FRAMING_WEIGHTS)},
        {'id': 'framing+person', 'label': 'Framing × Person', 'buckets': []},
        {'id': 'subject', 'label': 'Subject Content', 'buckets': list(SUBJECT_WORDS)},
        *[{'id': key, 'label': axis.label, 'buckets': [b.id for b in axis.buckets]}
          for key, axis in caption_coverage.AXES.items()],
    ]
    return {'kinds': [{'id': kind, 'label': kind.title(), 'axis': DEFAULT_AXIS[kind]}
                      for kind in KINDS], 'axes': axes,
            'framing_weights': dict(FRAMING_WEIGHTS),
            'limits': {'references': 16, 'pins': 2000, 'duplicate_limit': 20}}


def _number(value, name, low, high):
    if isinstance(value, bool):
        raise ValueError(f'{name} must be a number')
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f'{name} must be a number') from exc
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f'{name} must be between {low:g} and {high:g}')
    return result


def _ids(value, name, limit):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError(f'{name} must be a list of at most {limit} image ids')
    if any(isinstance(i, bool) or not isinstance(i, int) or i < 1 for i in value):
        raise ValueError(f'{name} must contain positive image ids')
    return list(dict.fromkeys(value))


def options(value):
    """Validate explicit policy requests; old clients may omit the whole policy."""
    if not isinstance(value, dict):
        raise ValueError('selection must be an object')
    kind = value.get('kind', 'character')
    if kind not in KINDS:
        raise ValueError('kind must be character, concept or style')
    axis = value.get('axis') or DEFAULT_AXIS[kind]
    if axis not in AXES or (axis == 'framing+person' and kind != 'character'):
        raise ValueError('the balance axis is not supported for this LoRA kind')
    match = value.get('match', 'image')
    if match not in ('image', 'face') or (match == 'face' and kind != 'character'):
        raise ValueError('face matching is available only for Character selections')
    quality = value.get('prefer_quality', True)
    if not isinstance(quality, bool):
        raise ValueError('prefer_quality must be true or false')
    limit = value.get('duplicate_limit', 1)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 0 <= limit <= 20:
        raise ValueError('duplicate_limit must be an integer between 0 and 20')
    minimum = value.get('min_similarity')
    if minimum not in (None, ''):
        minimum = _number(minimum, 'min_similarity', -1, 1)
    else:
        minimum = None
    weights = value.get('weights', {})
    if not isinstance(weights, dict) or len(weights) > 256:
        raise ValueError('weights must be an object of at most 256 bucket weights')
    clean_weights = {}
    for key, weight in weights.items():
        if not isinstance(key, str) or not key or len(key) > 80:
            raise ValueError('invalid balance bucket key')
        clean_weights[key] = _number(weight, 'bucket weight', 0, 100)
    return {'kind': kind, 'axis': axis, 'match': match, 'prefer_quality': quality,
            'duplicate_limit': limit, 'min_similarity': minimum,
            'weights': clean_weights,
            'reference_ids': _ids(value.get('reference_ids'), 'reference_ids', 16),
            'locked_ids': _ids(value.get('locked_ids'), 'locked_ids', 2000)}


def facets(item):
    """Return only measured labels and lexicon hits. Never return raw caption text."""
    text = ' '.join(filter(None, (item.get('caption'), item.get('tags_text'))))
    text = text.replace('_', ' ')
    result = caption_coverage.scan_caption(text)
    result['subject'] = {key for key, rx in SUBJECT_PATTERNS.items() if rx.search(text)}
    framing = item.get('framing')
    result['framing'] = {framing} if framing in FRAMING_WEIGHTS else set()
    cluster = item.get('face_cluster')
    result['framing+person'] = {f'{framing}#{int(cluster)}'} \
        if result['framing'] and cluster is not None else set()
    return result


def weighted_quotas(sizes, n, weights):
    """Weighted water filling, capped by availability; stable largest remainders."""
    quota = dict.fromkeys(sizes, 0)
    active = [k for k in sorted(sizes) if sizes[k] > 0 and weights.get(k, 0) > 0]
    remaining = min(n, sum(sizes[k] for k in active))
    while remaining and active:
        total = sum(weights[k] for k in active)
        shares = {k: remaining * weights[k] / total for k in active}
        capped = [k for k in active if sizes[k] - quota[k] <= shares[k]]
        if capped:
            for key in capped:
                take = sizes[key] - quota[key]
                quota[key] += take
                remaining -= take
            active = [k for k in active if k not in capped]
            continue
        for key in active:
            take = int(math.floor(shares[key]))
            quota[key] += take
            remaining -= take
        for key in sorted(active, key=lambda k: (-(shares[k] % 1), k))[:remaining]:
            quota[key] += 1
        break
    return quota


def select(items, E, n, policy, *, mode, isolation, reference_vectors=None,
           match_vectors=None, distinct_pairs=(), typicality=0.5):
    """Return a review selection and a bounded receipt; inputs are never mutated.

    The caller supplies provenance-checked vectors and current technical flags.
    Pins override ranking, quotas and duplicate limits, but never the pool scope
    or an unreadable image. Unknown face matches remain available for review.
    """
    import numpy as np
    p = options(policy)
    if mode not in ('similar', 'diverse', 'balanced'):
        raise ValueError('unknown selection mode')
    n = max(1, min(int(n), 2000))
    items = list(items)
    by_id = {item['id']: pos for pos, item in enumerate(items)}
    positions = list(range(len(items)))
    requested_locks = p['locked_ids']
    locked = [by_id[i] for i in requested_locks if i in by_id
              and 'unreadable' not in items[by_id[i]].get('flags', ())]
    if len(locked) > n:
        raise ValueError('the requested count is smaller than the available pinned selection')
    labels = [facets(item) for item in items]
    quality = np.array([
        0.5 ** len(TECHNICAL_FLAGS.intersection(item.get('flags', ())))
        if p['prefer_quality'] else 1.0 for item in items], dtype='float32')
    reference_vectors = reference_vectors or {}
    refs = p['reference_ids']
    if (mode == 'similar' or p['min_similarity'] is not None or p['match'] == 'face') and not refs:
        raise ValueError('select reference images first')
    if refs and any(i not in reference_vectors for i in refs):
        raise ValueError('a reference has no current matching embedding; run the required analysis pass')
    similarities = None
    unknown_match = []
    if refs:
        # Max supports distinct legitimate poses; averaging can erase a rare view.
        R = np.stack([reference_vectors[i] for i in refs]).astype('float32')
        R /= np.linalg.norm(R, axis=1, keepdims=True) + 1e-8
        if p['match'] == 'face':
            vectors = match_vectors or {}
            similarities = np.full(len(items), np.nan, dtype='float32')
            known = [j for j, item in enumerate(items) if item['id'] in vectors]
            if known:
                F = np.stack([vectors[items[j]['id']] for j in known]).astype('float32')
                F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-8
                similarities[known] = np.max(F @ R.T, axis=1)
            unknown_match = [items[j]['id'] for j in positions if not np.isfinite(similarities[j])]
        else:
            similarities = np.max(E @ R.T, axis=1)
    minimum = p['min_similarity']
    eligible = [j for j in positions if 'unreadable' not in items[j].get('flags', ())
                and (j in locked or similarities is None
                     or (np.isfinite(similarities[j])
                         and (minimum is None or similarities[j] >= minimum)))]
    eligible_set = set(eligible)
    reference_below = sum(1 for j in positions if j not in eligible_set
                          and similarities is not None and np.isfinite(similarities[j])
                          and minimum is not None and similarities[j] < minimum)
    factor = quality.copy()
    if typicality > 0 and mode != 'similar' and len(eligible) > n:
        idx = np.asarray(eligible)
        factor[idx] *= 10.0 ** (-TYPICALITY_DECADES * typicality * isolation(E[idx]))
    picked = list(locked)
    picked_set = set(picked)
    distinct = {tuple(sorted(pair)) for pair in distinct_pairs}
    group_members = defaultdict(list)

    def groups(j):
        item = items[j]
        return [(name, item[name]) for name in ('dup_group', 'semantic_dup_group')
                if item.get(name) is not None]

    def register(j):
        for key in groups(j):
            group_members[key].append(j)

    for j in picked:
        register(j)

    def allowed(j):
        if not p['duplicate_limit']:
            return True
        iid = items[j]['id']
        for key in groups(j):
            conflicts = sum(tuple(sorted((iid, items[k]['id']))) not in distinct
                            for k in group_members[key])
            if conflicts >= p['duplicate_limit']:
                return False
        return True

    def add(j):
        picked.append(j)
        picked_set.add(j)
        register(j)

    axis = p['axis']
    buckets = defaultdict(list)
    assignment = {}
    for j in eligible:
        # Multi-label captions stay visible in coverage. One stable primary label
        # avoids counting the same image against several quota slots.
        values = labels[j].get(axis, set())
        key = sorted(values)[0] if values else 'unknown'
        buckets[key].append(j)
        assignment[j] = key
    sizes = {key: len(values) for key, values in buckets.items()}
    weights = {key: 1.0 for key in sizes}
    weights.update(default_weights(p['kind'], axis))
    weights.update(p['weights'])
    # Unknowns have an explicit, editable bucket instead of disappearing.
    sizes.update({key: 0 for key in weights if key not in sizes})
    ideal = weighted_quotas({key: n for key in sizes}, n, weights)
    quota = weighted_quotas(sizes, n, weights)
    bucket_counts = Counter(assignment[j] for j in picked)
    min_distance = np.ones(len(items), dtype='float32')
    if picked:
        for j in picked:
            min_distance = np.minimum(min_distance, 1.0 - E @ E[j])
    centre = E[eligible].mean(axis=0) if eligible else np.zeros(E.shape[1], dtype='float32')
    centre /= np.linalg.norm(centre) + 1e-8
    centrality = np.maximum(0.0, E @ centre) * factor
    coverage_axes = list(caption_coverage.axes_for_kind(p['kind']))
    if p['kind'] == 'character':
        coverage_axes.insert(0, 'framing')
    if p['kind'] == 'style':
        coverage_axes.insert(0, 'subject')
    covered = Counter((aid, value) for j in picked for aid in coverage_axes
                      for value in labels[j].get(aid, ()))
    explanations = {items[j]['id']: 'pinned' for j in picked}
    if similarities is not None:
        ranked = sorted(eligible, key=lambda j: (
            -float((1.0 + similarities[j]) * 0.5 * quality[j])
            if np.isfinite(similarities[j]) else float('inf'), items[j]['id']))
    else:
        ranked = []
    if mode == 'similar':
        for j in ranked:
            if len(picked) >= n:
                break
            if j not in picked_set and allowed(j):
                add(j)
                explanations[items[j]['id']] = 'reference match'
    else:
        while len(picked) < n:
            candidates = [j for j in eligible if j not in picked_set and allowed(j)]
            if not candidates:
                break
            if mode == 'balanced':
                active_keys = {assignment[j] for j in candidates if weights.get(assignment[j], 0) > 0}
                if not active_keys:
                    break
                deficits = [key for key in active_keys if bucket_counts[key] < quota[key]]
                keys = deficits or list(active_keys)
                key = min(keys, key=lambda k: (bucket_counts[k] / weights[k], k))
                candidates = [j for j in candidates if assignment[j] == key]
            # Seed on a quality-weighted representative. Every later pick adds
            # novelty plus a small, diminishing bonus for uncovered known facets.
            def merit(j):
                if not picked:
                    return float(centrality[j])
                gain = sum(1.0 / (1.0 + covered[aid, value]) for aid in coverage_axes
                           for value in labels[j].get(aid, ()))
                return float(max(1e-7, min_distance[j]) * factor[j] * (1.0 + 0.1 * gain))
            nxt = min(candidates, key=lambda j: (-merit(j), items[j]['id']))
            add(nxt)
            bucket_counts[assignment[nxt]] += 1
            explanations[items[nxt]['id']] = 'representative seed' if len(picked) == 1 \
                else ('target coverage' if mode == 'balanced' else 'visual coverage')
            min_distance = np.minimum(min_distance, 1.0 - E @ E[nxt])
            covered.update((aid, value) for aid in coverage_axes for value in labels[nxt].get(aid, ()))
    reports = []
    for key in sorted(sizes):
        fr, _, person = key.partition('#')
        count = sum(assignment[j] == key for j in picked)
        reports.append({'key': key, 'label': key, 'framing': fr,
                        'cluster': int(person) if axis == 'framing+person' and person else None,
                        'available': sizes[key], 'fair_share': ideal.get(key, 0),
                        'selected': count, 'under_target': count < ideal.get(key, 0),
                        'short': sizes[key] < ideal.get(key, 0), 'weight': weights.get(key, 0)})
    coverage = []
    for aid in coverage_axes:
        available = Counter(value for j in eligible for value in labels[j].get(aid, ()))
        selected = Counter(value for j in picked for value in labels[j].get(aid, ()))
        coverage.append({'axis': aid, 'available': dict(available), 'selected': dict(selected),
                         'unknown': sum(not labels[j].get(aid) for j in eligible),
                         'unknown_selected': sum(not labels[j].get(aid) for j in picked)})
    duplicate_omitted = sum(j not in picked_set and not allowed(j) for j in eligible)
    results = []
    for j in picked:
        result = {'id': items[j]['id'], 'reason': explanations[items[j]['id']],
                  'quality_factor': round(float(quality[j]), 4),
                  'flags': list(items[j].get('flags', ()))}
        if similarities is not None and np.isfinite(similarities[j]):
            result['similarity'] = round(float(similarities[j]), 4)
            result['score'] = round(float((1.0 + similarities[j]) * 0.5 * quality[j]), 4)
        results.append(result)
    return {'image_ids': [items[j]['id'] for j in picked], 'results': results,
            'pool': len(items), 'eligible': len(eligible), 'requested': n,
            'selected': len(picked), 'shortfall': max(0, n - len(picked)),
            'axis': axis, 'kind': p['kind'], 'typicality': typicality,
            'buckets': reports if mode == 'balanced' else [], 'coverage': coverage,
            'unlabelled': sizes.get('unknown', 0), 'unknown': 0,
            'unknown_match_ids': unknown_match[:2000],
            'unknown_match_count': len(unknown_match),
            'missing_locked': len(requested_locks) - len(locked),
            'duplicate_omitted': duplicate_omitted, 'below_minimum': reference_below,
            'quality_unknown': sum(item.get('quality_state') is None for item in items),
            'caption_based': True, 'selection_only': True, 'policy': p}
