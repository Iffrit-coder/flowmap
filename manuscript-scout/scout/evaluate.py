"""Ranking metrics. We care about who lands at the top of the pile, not about RMSE."""
import math

import numpy as np
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score

TOP_FRACS = (0.01, 0.05, 0.10)


def _spearman(pred, y):
    return float(spearmanr(pred, y).statistic)


def evaluate(pred, y, top_quantile=0.9, n_boot=300, seed=0) -> dict:
    """pred/y: 1-D arrays; y is the cohort-normalised label (higher = more popular)."""
    pred, y = np.asarray(pred, float), np.asarray(y, float)
    n = len(y)
    rel = y >= np.quantile(y, top_quantile)          # "truly top decile" ground truth
    base_rate = rel.mean()
    order = np.argsort(-pred, kind="stable")
    out = {"n": n, "spearman": _spearman(pred, y)}

    rng = np.random.default_rng(seed)
    boots = [_spearman(pred[i], y[i]) for i in (rng.integers(0, n, n) for _ in range(n_boot))]
    out["spearman_ci95"] = [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))]

    out["auc_top_decile"] = float(roc_auc_score(rel, pred)) if 0 < rel.sum() < n else float("nan")
    for frac in TOP_FRACS:
        k = max(1, math.ceil(frac * n))
        prec = float(rel[order[:k]].mean())
        out[f"precision@{int(frac * 100)}%"] = prec
        out[f"lift@{int(frac * 100)}%"] = prec / base_rate if base_rate else float("nan")
    return out


def by_group(pred, y, groups, min_n=200) -> dict:
    pred, y, groups = np.asarray(pred, float), np.asarray(y, float), np.asarray(groups)
    res = {}
    for g in sorted(set(groups)):
        m = groups == g
        if m.sum() >= min_n:
            res[g] = {"n": int(m.sum()), "spearman": _spearman(pred[m], y[m])}
    return res


def markdown_table(results: dict) -> str:
    cols = ["spearman", "auc_top_decile", "precision@1%", "lift@1%", "precision@5%",
            "lift@5%", "precision@10%", "lift@10%"]
    lines = ["| model | " + " | ".join(cols) + " |", "|" + "---|" * (len(cols) + 1)]
    for name, m in results.items():
        lines.append(f"| {name} | " + " | ".join(f"{m[c]:.3f}" for c in cols) + " |")
    return "\n".join(lines)
