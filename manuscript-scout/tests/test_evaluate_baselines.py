import numpy as np
import pandas as pd

from scout.baselines import run_baselines
from scout.evaluate import by_group, evaluate


def test_perfect_and_random_predictions():
    rng = np.random.default_rng(0)
    y = rng.normal(size=2000)
    perfect = evaluate(y, y)
    assert perfect["spearman"] > 0.999 and perfect["auc_top_decile"] > 0.999
    assert abs(perfect["lift@10%"] - 10) < 0.5
    rand = evaluate(rng.normal(size=2000), y)
    assert abs(rand["spearman"]) < 0.1 and abs(rand["lift@10%"] - 1) < 0.5
    assert rand["spearman_ci95"][0] < rand["spearman"] < rand["spearman_ci95"][1]


def test_by_group_respects_min_n():
    g = ["a"] * 300 + ["b"] * 50
    r = by_group(np.arange(350.0), np.arange(350.0), g, min_n=200)
    assert list(r) == ["a"]


def test_baselines_find_planted_signal():
    rng = np.random.default_rng(1)
    n = 1500
    hot = rng.random(n) < 0.3
    words = np.array(["river", "castle", "garden", "engine", "violin", "market"])
    desc = [" ".join(rng.choice(words, 12)) + (" zeppelin heist" if h else " ledger quietly") for h in hot]
    df = pd.DataFrame({"description": desc, "subjects": [["Fiction"]] * n,
                       "label": hot * 1.5 + rng.normal(0, .5, n),
                       "split": ["train"] * 1000 + ["val"] * 250 + ["test"] * 250})
    res = run_baselines(df, desc)
    assert res["text_tfidf"][1]["spearman"] > 0.5
    assert abs(res["blurb_length"][1]["spearman"]) < 0.3
