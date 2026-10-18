"""One scoring rule for suggestions and labeled held-out evaluation."""
import math


def rank_candidates(vector, bank, *, excluded=(), subject_id=None, content_hash=None):
    excluded = set(excluded)
    ranked = []
    for identity_id, (identity, examples) in bank.items():
        if identity_id in excluded:
            continue
        scores = [float(vector @ reference) for reference_id, reference, digest in examples
                  if reference_id != subject_id and digest != content_hash]
        if scores:
            score = max(scores)
            if math.isfinite(score):
                ranked.append((score, identity))
    return sorted(ranked, key=lambda pair: (-pair[0], pair[1].id))


def disposition(ranked, minimum, margin):
    if not ranked:
        return 'unmeasured'
    score = ranked[0][0]
    ambiguous = len(ranked) > 1 and score-ranked[1][0] < margin
    return 'suggested' if score >= minimum and not ambiguous else 'uncertain'
