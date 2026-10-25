"""Build the stage-1 dataset from Open Library's official bulk dumps (CC0).

No page scraping: the dumps are published for exactly this kind of reuse. The engagement
signal is how many Open Library readers shelved a work ("want to read", "currently
reading", "already read"). That is a *popularity proxy*, not sales: it skews to the
site's own audience and to older works, so labels are turned into percentiles within each
first-publication-year cohort.
"""
import gzip
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.stats import norm
from tqdm import tqdm

from scout.text import looks_english

BASE = "https://openlibrary.org/data/"
# Verify names/format at https://openlibrary.org/developers/dumps if a download 404s.
DUMPS = {
    "works": "ol_dump_works_latest.txt.gz",
    "reading_log": "ol_dump_reading-log_latest.txt.gz",
    "ratings": "ol_dump_ratings_latest.txt.gz",
}
USER_AGENT = "manuscript-scout/0.1 (research; contact: set-your-email)"
SHELVES = {"want to read": 0, "currently reading": 1, "already read": 2}
_YEAR_RE = re.compile(r"\b(1[5-9]\d\d|20\d\d)\b")


def download(dest_dir, which=("reading_log", "ratings", "works")):
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name in which:
        dest = dest_dir / DUMPS[name]
        if dest.exists():
            print(f"have {dest}")
            continue
        part = dest.with_suffix(dest.suffix + ".part")
        with requests.get(BASE + DUMPS[name], stream=True, timeout=60,
                          headers={"User-Agent": USER_AGENT}) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            with open(part, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc=name) as bar:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
                    bar.update(len(chunk))
        part.rename(dest)


def _open(path):
    return gzip.open(path, "rt", encoding="utf-8", errors="replace")


def load_engagement(reading_log_path, ratings_path):
    """work key -> dict(want, reading, read, n_ratings, mean_rating)."""
    shelves = defaultdict(lambda: [0, 0, 0])
    first_lines, matched = [], 0
    with _open(reading_log_path) as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(first_lines) < 3:
                first_lines.append(parts)
            if len(parts) < 3:
                continue
            idx = SHELVES.get(parts[2].strip().lower())
            if idx is not None:
                shelves[parts[0]][idx] += 1
                matched += 1
    if matched == 0:
        raise RuntimeError(f"reading-log format not recognised; first rows: {first_lines}")

    ratings = defaultdict(lambda: [0, 0.0])
    with _open(ratings_path) as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            try:
                val = float(parts[2])
            except ValueError:
                continue
            ratings[parts[0]][0] += 1
            ratings[parts[0]][1] += val

    out = {}
    for key in set(shelves) | set(ratings):
        w, c, r = shelves.get(key, (0, 0, 0))
        n, s = ratings.get(key, (0, 0.0))
        out[key] = dict(want=w, reading=c, read=r, n_ratings=n,
                        mean_rating=(s / n) if n else None)
    return out


def iter_works(path):
    with _open(path) as f:
        for line in f:
            parts = line.split("\t", 4)
            if len(parts) < 5:
                continue
            try:
                yield json.loads(parts[4])
            except json.JSONDecodeError:
                continue


def parse_work(rec, min_desc_chars):
    desc = rec.get("description")
    if isinstance(desc, dict):
        desc = desc.get("value")
    if not isinstance(desc, str) or len(desc) < min_desc_chars or not looks_english(desc):
        return None
    m = _YEAR_RE.search(str(rec.get("first_publish_date", "")))
    if not m:
        return None
    return dict(
        key=rec.get("key"),
        title=rec.get("title", ""),
        description=desc,
        subjects=[s for s in rec.get("subjects", []) if isinstance(s, str)],
        year=int(m.group(1)),
    )


def build_table(raw_dir, out_path, cfg):
    raw_dir = Path(raw_dir)
    eng = load_engagement(raw_dir / DUMPS["reading_log"], raw_dir / DUMPS["ratings"])
    rows = []
    for rec in tqdm(iter_works(raw_dir / DUMPS["works"]), desc="works"):
        row = parse_work(rec, cfg.min_description_chars)
        if row is None or not (cfg.min_year <= row["year"] <= cfg.max_year):
            continue
        row.update(eng.get(row["key"], dict(want=0, reading=0, read=0, n_ratings=0, mean_rating=None)))
        rows.append(row)
    return finalize_table(pd.DataFrame(rows), cfg, out_path)


def finalize_table(df, cfg, out_path=None, seed=13):
    df = df.copy()
    df["engagement"] = df["want"] + df["reading"] + df["read"]
    # Percentile within the year cohort, computed on the FULL population (zeros included)
    # before any subsampling, so a label of 0.9 always means "top 10% of that year's works".
    df["pct"] = df.groupby("year")["engagement"].rank(pct=True, method="average")
    df["label"] = norm.ppf(df["pct"].clip(0.001, 0.999))

    engaged = df[df.engagement > 0]
    zeros = df[df.engagement == 0]
    n_keep = int(cfg.max_zero_ratio * len(engaged))
    if len(zeros) > n_keep:
        zeros = zeros.sample(n=n_keep, random_state=seed)
    df = pd.concat([engaged, zeros]).sort_values(["year", "key"]).reset_index(drop=True)

    s = cfg.split
    df["split"] = np.where(df.year <= s.train_until, "train",
                           np.where(df.year <= s.val_until, "val", "test"))
    if out_path is not None:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_json(out_path, orient="records", lines=True, compression="infer")
    return df


def load_table(path):
    return pd.read_json(path, orient="records", lines=True, compression="infer")
