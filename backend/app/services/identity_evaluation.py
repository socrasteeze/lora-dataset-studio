"""Explicit accuracy receipts over human-labeled, disjoint artwork groups."""
import hashlib
import json

from . import identity_learning as learning
from .identity_matching import disposition, rank_candidates
from ..extensions import db
from ..models import IdentityAssignment, IdentityEvidence, IdentitySubject


def evaluate(user, data):
    import numpy as np
    kind = learning._kind(data.get('kind'))
    model = learning.FACE_MODEL if kind == 'person' else learning.CLIP_MODEL
    references, holdouts = data.get('references'), data.get('holdouts')
    if (not isinstance(references, list) or not 1 <= len(references) <= 2000
            or not isinstance(holdouts, list) or not 1 <= len(holdouts) <= 2000):
        raise ValueError('Choose between 1 and 2000 references and holdouts.')
    minimum, margin = learning.match_settings(kind, data)
    bank, reference_hashes, reference_groups = {}, set(), set()
    contract, reference_ids = [], set()

    def evidence(item):
        if not isinstance(item, dict) or not isinstance(item.get('artwork_group'), str) or not item['artwork_group'].strip():
            raise ValueError('Every sample needs an artwork group.')
        subject = db.session.get(IdentitySubject, item.get('subject_id'))
        if subject is None or subject.user_id != user:
            raise ValueError('A subject is unavailable in this profile.')
        row = IdentityEvidence.query.filter_by(subject_id=subject.id, model_key=model).first()
        if row is None or not learning._live_evidence(subject, row):
            raise ValueError('Analyze every sample with the same current model first.')
        return subject, row, learning.normalized_vector(
            np.frombuffer(row.vector, dtype='<f4'), row.dimension)

    for item in references:
        subject, row, vector = evidence(item)
        identity = learning._identity(user, item.get('identity_id'))
        assignment = db.session.get(IdentityAssignment, (subject.id, identity.id))
        if (identity.kind != kind or not assignment or assignment.state != 'confirmed'
                or not assignment.learn or not subject.single_subject
                or assignment.content_hash != row.content_hash):
            raise ValueError('References require confirmed, eligible subject examples.')
        if subject.id in reference_ids:
            raise ValueError('Reference subjects must be unique.')
        reference_ids.add(subject.id)
        reference_groups.add(item['artwork_group'])
        reference_hashes.add(row.content_hash)
        bank.setdefault(identity.id, (identity, []))[1].append((subject.id, vector, row.content_hash))
        contract.append(['reference', subject.id, identity.id, row.content_hash, item['artwork_group']])

    counts = {'total': len(holdouts), 'correct': 0, 'wrong_name': 0, 'abstained': 0,
              'known_missed': 0, 'unknown_rejected': 0, 'unknown_named': 0}
    seen = set()
    for item in holdouts:
        subject, row, vector = evidence(item)
        if (subject.id in seen or subject.id in reference_ids
                or row.content_hash in reference_hashes
                or item['artwork_group'] in reference_groups):
            raise ValueError('Holdout artwork, subjects and source bytes must be disjoint from references.')
        seen.add(subject.id)
        expected = item.get('identity_id')
        if expected is not None and learning._identity(user, expected).kind != kind:
            raise ValueError('Holdout identity kind differs from the model.')
        ranked = rank_candidates(vector, bank, subject_id=subject.id, content_hash=row.content_hash)
        prediction = ranked[0][1].id if disposition(ranked, minimum, margin) == 'suggested' else None
        if prediction is None:
            counts['abstained'] += 1
            counts['unknown_rejected' if expected is None else 'known_missed'] += 1
        elif prediction == expected:
            counts['correct'] += 1
        else:
            counts['wrong_name'] += 1
            counts['unknown_named'] += expected is None
        contract.append(['holdout', subject.id, expected, row.content_hash, item['artwork_group']])
    answered = counts['total']-counts['abstained']
    return {**counts, 'model_key': model, 'minimum': minimum, 'margin': margin,
            'reference_count': len(references), 'answered': answered,
            'wrong_name_rate_answered': counts['wrong_name']/answered if answered else None,
            'coverage': answered/counts['total'],
            'corpus_hash': hashlib.sha256(json.dumps(sorted(contract), sort_keys=True).encode()).hexdigest(),
            'synthetic_accuracy_claim': False}
