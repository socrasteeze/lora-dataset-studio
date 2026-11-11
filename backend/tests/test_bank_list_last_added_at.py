"""The bank list reports when a folder scan last added images."""
from datetime import datetime


def test_list_banks_reports_last_added_at(app, tmp_path):
    from app.extensions import db
    from app.models import BankImage, ImageBank
    from app.services import image_bank_service as banks

    with app.app_context():
        early = ImageBank(user_id="local", name="Early",
                          source_path=str(tmp_path / "early"))
        late = ImageBank(user_id="local", name="Late",
                         source_path=str(tmp_path / "late"))
        empty = ImageBank(user_id="local", name="Empty",
                          source_path=str(tmp_path / "empty"))
        db.session.add_all([early, late, empty])
        db.session.flush()
        db.session.add_all([
            BankImage(bank_id=early.id, relpath="shot-a.webp",
                      created_at=datetime(2026, 1, 1)),
            BankImage(bank_id=early.id, relpath="shot-b.webp",
                      created_at=datetime(2026, 6, 1)),
            BankImage(bank_id=late.id, relpath="shot-c.webp",
                      created_at=datetime(2026, 3, 1)),
        ])
        db.session.commit()
        rows = {row["name"]: row for row in banks.list_banks("local")}
        assert rows["Early"]["last_added_at"].startswith("2026-06-01")
        assert rows["Late"]["last_added_at"].startswith("2026-03-01")
        assert rows["Empty"]["last_added_at"] is None
