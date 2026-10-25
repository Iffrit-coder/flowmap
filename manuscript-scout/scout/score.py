"""Rank a folder of manuscripts/pitches with a trained checkpoint.

Input: a folder of ``<id>.txt`` files, each holding a back-cover style premise (the
stage-1 model was trained on blurbs, so it must be shown a blurb-style synopsis, not
chapters). Output: a CSV ranked by predicted percentile.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from scout.text import build_blurb_input


def calibration_from_val(val_pred) -> list[float]:
    """101 quantiles of validation predictions, used to turn raw scores into percentiles."""
    return [float(q) for q in np.quantile(val_pred, np.linspace(0, 1, 101))]


def to_percentile(scores, quantiles) -> np.ndarray:
    return np.interp(scores, quantiles, np.linspace(0, 100, 101))


def read_folder(folder, include_title=False):
    ids, texts = [], []
    for p in sorted(Path(folder).glob("*.txt")):
        body = p.read_text(encoding="utf-8", errors="replace").strip()
        if body:
            ids.append(p.stem)
            texts.append(build_blurb_input(body, [], p.stem if include_title else None))
    return ids, texts


def run(model, tokenizer, meta, ckpt_dir, folder, out_csv, batch_size=8):
    from scout.train import predict
    ids, texts = read_folder(folder, meta.get("include_title", False))
    raw = predict(model, tokenizer, texts, meta["max_length"], batch_size)
    cal = json.loads((Path(ckpt_dir) / "calibration.json").read_text())
    df = pd.DataFrame({"id": ids, "score": raw, "percentile": to_percentile(raw, cal)})
    df = df.sort_values("score", ascending=False).reset_index(drop=True)
    df.insert(0, "rank", df.index + 1)
    df.to_csv(out_csv, index=False)
    return df
