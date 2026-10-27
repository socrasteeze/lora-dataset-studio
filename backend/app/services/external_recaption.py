"""Recaption a folder LDS did not build, as Anima character booru tags.

Writes one ``<image stem>.txt`` per image into a separate OUTPUT folder. The
source folder is only read: no caption is written beside the images, and no
image is copied or moved. Tags come from PixAI when it is installed, else from
the configured vision model with the Anima booru prompt. Identity tags and the
signature traits are stripped, so they bind to the trigger.

One more file, named after the output folder, holds the summary line: the
trigger, the usual count tags and the signature traits. It is what the trigger
now carries, ready to use as a default prompt.
"""
from __future__ import annotations

import os
from collections import Counter

_IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp')


def _norm(path: str) -> str:
    return os.path.normcase(os.path.realpath(path))


def _draft_tags(paths, *, signature_tags=(), ollama_model=None, progress=None) -> dict:
    """{path: raw tag line}, before identity and signature stripping. A known
    signature list also rides on the vision prompt as omit rules."""
    from . import pixai_tagger
    from .anima_booru import format_anima_caption
    if pixai_tagger.is_installed():
        batch = pixai_tagger.caption_images(paths)
        if not batch.get('ok'):
            raise RuntimeError(batch.get('error') or 'PixAI Tagger failed')
        results = batch.get('results') or {}
        facts = batch.get('image_facts') or {}
        return {p: format_anima_caption(results.get(p), include_character=False,
                                        image_facts=facts.get(p))
                for p in paths if results.get(p)}
    from .face_dataset_service import caption_paths
    from .face_variations import APPEARANCE_DEFAULTS, caption_prompt_for_anima, signature_omit_rule
    from .vision_ollama import anima_auto_vision_model
    return caption_paths(
        paths, prompt=caption_prompt_for_anima('booru', appearance=APPEARANCE_DEFAULTS)
        + signature_omit_rule(signature_tags),
        backend='ollama',
        ollama_model=ollama_model or anima_auto_vision_model(), progress=progress)


def _summary_name(output_dir, paths) -> str:
    """``<output folder name>.txt``, or ``<name>_shared.txt`` when an image has
    that stem, so the summary never replaces a real caption."""
    name = os.path.basename(os.path.normpath(output_dir)) or 'shared'
    stems = {os.path.normcase(os.path.splitext(os.path.basename(p))[0]) for p in paths}
    if os.path.normcase(name) in stems:
        name += '_shared'
    return name + '.txt'


def recaption_external_folder(source_dir, output_dir, trigger, *, signature_tags=None,
                              ollama_model=None, progress=None) -> dict:
    """Caption every image directly inside ``source_dir`` into ``output_dir``.

    ``signature_tags`` None uses the suggested list (traits in 60% of the
    drafts); a list, even an empty one, is used as given. A tag equal to the
    trigger is dropped, so the trigger is written once. Returns {written,
    skipped, output_dir, suggested_signature_tags, signature_tags,
    summary_file, summary}; the summary is None when nothing was written.
    """
    from .anima_booru import anima_character_tags, count_tags, normalize_anima_tag
    from .face_dataset_service import normalize_signature_tags
    from .face_variations import (APPEARANCE_DEFAULTS, drop_identity_tags, drop_signature_tags,
                                  suggest_signature_tags)
    trigger = ' '.join(str(trigger or '').split())
    if not trigger:
        raise ValueError('Enter a trigger word.')
    if not source_dir or not os.path.isdir(source_dir):
        raise ValueError('The source folder does not exist.')
    if not output_dir:
        raise ValueError('Choose an output folder.')
    if _norm(output_dir) == _norm(source_dir):
        raise ValueError('The output folder must not be the source folder.')
    paths = sorted(
        os.path.join(source_dir, name) for name in os.listdir(source_dir)
        if name.lower().endswith(_IMAGE_EXTS)
        and os.path.isfile(os.path.join(source_dir, name)))
    if not paths:
        raise ValueError('The source folder has no images.')
    given = None if signature_tags is None else normalize_signature_tags(signature_tags)
    drafts = _draft_tags(paths, signature_tags=given or (), ollama_model=ollama_model,
                         progress=progress)
    suggested = suggest_signature_tags(list(drafts.values()))
    chosen = suggested if given is None else given
    os.makedirs(output_dir, exist_ok=True)
    trigger_tag = normalize_anima_tag(trigger)
    lines = []
    for path in paths:
        tags = anima_character_tags(drop_signature_tags(
            drop_identity_tags(drafts.get(path) or '', keep_count_tags=True,
                               appearance=APPEARANCE_DEFAULTS), chosen))
        tags = ', '.join(t for t in tags.split(', ') if t and t != trigger_tag)
        if not tags:
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        with open(os.path.join(output_dir, stem + '.txt'), 'w', encoding='utf-8') as fh:
            fh.write(f'{trigger}, {tags}\n')
        lines.append(tags)
    summary_file = summary = None
    if lines:
        usual = Counter(tuple(count_tags(line)) for line in lines).most_common(1)[0][0]
        shared = anima_character_tags(', '.join([*usual, *chosen]))
        summary = f'{trigger}, {shared}' if shared else trigger
        summary_file = os.path.join(output_dir, _summary_name(output_dir, paths))
        with open(summary_file, 'w', encoding='utf-8') as fh:
            fh.write(summary + '\n')
    return {'written': len(lines), 'skipped': len(paths) - len(lines),
            'output_dir': output_dir, 'suggested_signature_tags': suggested,
            'signature_tags': chosen, 'summary_file': summary_file, 'summary': summary}
