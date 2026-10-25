import gzip
import json

import pytest

from scout.config import _ns
from scout.data import openlibrary as ol

DESC = ("The detective was sure that she had seen the man in the park with his dog and that it was "
        "the same one that had followed her to the station for days, and now it was time to act. ") * 2


def _gz(path, lines):
    with gzip.open(path, "wt") as f:
        f.write("\n".join(lines) + "\n")


def _work(i, year, desc=DESC):
    rec = {"key": f"/works/OL{i}W", "title": f"T{i}", "description": {"type": "/type/text", "value": desc},
           "subjects": ["Mystery"], "first_publish_date": f"March {year}"}
    return f"/type/work\t/works/OL{i}W\t1\t2020-01-01\t{json.dumps(rec)}"


def _cfg():
    return _ns(dict(min_description_chars=200, min_year=1990, max_year=2022, max_zero_ratio=1.0,
                    split=dict(train_until=2015, val_until=2018)))


def test_build_table_labels_and_splits(tmp_path):
    raw = tmp_path / "raw"; raw.mkdir()
    # works 1..6 in 2010 with rising engagement; 7..12 in 2020 (test), work 13 too old, 14 has short blurb
    works = [_work(i, 2010) for i in range(1, 7)] + [_work(i, 2020) for i in range(7, 13)]
    works += [_work(13, 1985), _work(14, 2010, desc="too short")]
    _gz(raw / ol.DUMPS["works"], works)
    log = []
    for i in range(1, 7):                       # work i gets i-1 'already read' events
        log += [f"/works/OL{i}W\t/books/OLx\tAlready Read\t2021-01-01"] * (i - 1)
    log += ["/works/OL12W\t/books/OLx\tWant to Read\t2021-01-01"] * 5
    _gz(raw / ol.DUMPS["reading_log"], log)
    _gz(raw / ol.DUMPS["ratings"], ["/works/OL6W\t/books/OLx\t5\t2021-01-01"])

    df = ol.build_table(raw, tmp_path / "out.jsonl.gz", _cfg())
    assert not {"/works/OL13W", "/works/OL14W"} & set(df.key)             # filtered out
    assert set(df.split) == {"train", "test"}
    tr = df[df.split == "train"].set_index("key")
    assert tr.label["/works/OL6W"] > tr.label["/works/OL2W"] > tr.label["/works/OL1W"]
    # zero-engagement works are capped at ratio 1.0 of engaged works (engaged: OL2..6 and OL12)
    assert (df.engagement == 0).sum() <= (df.engagement > 0).sum()
    assert ol.load_table(tmp_path / "out.jsonl.gz").shape == df.shape


def test_unrecognised_reading_log_fails_loudly(tmp_path):
    _gz(tmp_path / "log.gz", ["a\tb\tnot-a-shelf\t2020"])
    _gz(tmp_path / "rat.gz", [])
    with pytest.raises(RuntimeError, match="not recognised"):
        ol.load_engagement(tmp_path / "log.gz", tmp_path / "rat.gz")
