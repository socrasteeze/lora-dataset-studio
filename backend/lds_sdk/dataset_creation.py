"""Host-owned Dataset destinations and allocation for bundled media lanes."""


def destination(kind):
    from app.creation_destinations import destination as resolve
    return resolve(kind)


def normalize_category(value):
    from app.creation_destinations import normalize_category as normalize
    return normalize(value)


def reserve_folder(root, prefix, *, name, category, minimum):
    from app.creation_destinations import reserve_folder as reserve
    return reserve(root, prefix, name=name, category=category, minimum=minimum)
