"""Banks that share a name, shown as one card.

WHY GROUPING BY NAME AND NOT BY MERGING
---------------------------------------
The ask was "let two folders share images while living in separate folders".
Doing that for real means one bank spanning two folders — but ``ImageBank
.source_path`` is a single non-nullable column and every ``BankImage.relpath``
is relative to it (models.py). Making a bank multi-folder changes the most
load-bearing rule in the whole bank service, and copying bytes instead was
already evaluated and rejected upstream ("Banks never share their files. It
costs the bytes.").

Grouping by NAME avoids all of it. Every BankImage still belongs to exactly one
bank, every write still lands on a row that knows its own bank, and not one path
resolver changes. What the user gets is what they asked for: one card, combined
counts, one queue action, one promote.

THE RULE — deliberately four lines, so it can live on both sides
----------------------------------------------------------------
* key = ``name.strip()``, **exact and case-sensitive**
* a bank with ``keep_separate`` is never a member
* a group exists at **two or more** members
* ``lead_id`` = the smallest member id

Case-insensitive grouping is rejected on purpose: silently merging "Telegram"
and "telegram" costs a support thread, while failing to merge them is fixed by
an obvious rename.

The rule is implemented twice — here and in ``frontend/src/components/bank/
bankGroups.js``. That is deliberate, not an oversight: publishing the group on
the row instead would break the in-place rename patch on the bank list, which
exists precisely because ``GET /api/banks`` force-re-walks every source folder
and cannot be re-fetched to redraw one label. Both implementations are pinned to
the same table of cases in their tests.
"""
from ..models import ImageBank


def group_key(bank) -> str | None:
    """The grouping key of a bank row or dict, or None when it never groups."""
    if bank is None:
        return None
    name = getattr(bank, 'name', None) if not isinstance(bank, dict) else bank.get('name')
    separate = (getattr(bank, 'keep_separate', None) if not isinstance(bank, dict)
                else bank.get('keep_separate'))
    if separate:
        return None
    key = str(name or '').strip()
    return key or None


def build_groups(banks) -> dict:
    """{key: [bank ids ascending]} for every key with 2+ members. Singletons are
    absent — a group of one is just a bank."""
    buckets = {}
    for bank in banks or []:
        key = group_key(bank)
        if key is None:
            continue
        bank_id = bank['id'] if isinstance(bank, dict) else bank.id
        buckets.setdefault(key, []).append(bank_id)
    return {k: sorted(v) for k, v in buckets.items() if len(v) >= 2}


def member_ids(user_id, bank_id) -> list:
    """Every bank in ``bank_id``'s group, ascending — ``[bank_id]`` when it is
    not in one.

    THE AUTHORITY for the queue and promote routes, always re-derived from the
    database. A client-supplied member list would let a stale card (a rename in
    another tab, a bank deleted a second ago) drive a promote into the wrong
    dataset or a queue full of banks that no longer share a name.
    """
    bank = ImageBank.query.filter_by(id=bank_id, user_id=user_id).first()
    if bank is None:
        return []
    key = group_key(bank)
    if key is None:
        return [bank.id]
    rows = ImageBank.query.filter_by(user_id=user_id).all()
    ids = sorted(b.id for b in rows if group_key(b) == key)
    return ids if len(ids) >= 2 else [bank.id]


def set_keep_separate(user_id, bank_id, value) -> bool:
    """Opt one bank in or out of grouping. Returns the stored value; raises
    ValueError when the bank is unknown."""
    from ..extensions import db
    bank = ImageBank.query.filter_by(id=bank_id, user_id=user_id).first()
    if bank is None:
        raise ValueError('bank not found')
    bank.keep_separate = bool(value)
    db.session.commit()
    return bank.keep_separate
