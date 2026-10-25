"""Cheap baselines. If the fine-tuned LLM cannot beat these, it is not worth the GPU hours.

* ``blurb_length``    - log length of the blurb alone. Catches "well-catalogued books are
                         popular books" artefacts in the data.
* ``subjects_tfidf``  - genre/subject tags only. How far does genre alone get you?
* ``text_tfidf``      - the full model input, bag of n-grams.
* ``embed_ridge``     - frozen sentence embeddings (optional, needs sentence-transformers).
"""
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge

from scout.evaluate import evaluate
from scout.text import clean_subjects

ALPHAS = (0.3, 1, 3, 10, 30)


def _fit_ridge(Xtr, ytr, Xva, yva):
    from scipy.stats import spearmanr
    best = None
    for a in ALPHAS:
        m = Ridge(alpha=a).fit(Xtr, ytr)
        s = spearmanr(m.predict(Xva), yva).statistic
        s = -np.inf if np.isnan(s) else s      # constant features (e.g. one genre) give NaN
        if best is None or s > best[0]:
            best = (s, m)
    return best[1]


def _tfidf_ridge(tr_txt, va_txt, te_txt, ytr, yva, **kw):
    vec = TfidfVectorizer(sublinear_tf=True, min_df=3, **kw)
    Xtr = vec.fit_transform(tr_txt)
    model = _fit_ridge(Xtr, ytr, vec.transform(va_txt), yva)
    return model.predict(vec.transform(te_txt))


def run_baselines(df, texts, use_embeddings=False):
    """df has split/label/description/subjects; texts are the model inputs, aligned with df."""
    tr, va, te = (np.flatnonzero((df.split == s).to_numpy()) for s in ("train", "val", "test"))
    y = df.label.to_numpy()
    texts = np.asarray(texts, dtype=object)
    preds = {}

    preds["blurb_length"] = np.log1p(df.description.str.len().to_numpy()[te])

    subj = np.asarray([" ".join(s.replace(" ", "_") for s in clean_subjects(x, 20))
                       for x in df.subjects], dtype=object)
    preds["subjects_tfidf"] = _tfidf_ridge(subj[tr], subj[va], subj[te], y[tr], y[va], token_pattern=r"\S+")
    preds["text_tfidf"] = _tfidf_ridge(texts[tr], texts[va], texts[te], y[tr], y[va],
                                       ngram_range=(1, 2), max_features=300_000)
    if use_embeddings:
        from sentence_transformers import SentenceTransformer
        enc = SentenceTransformer("BAAI/bge-small-en-v1.5")
        emb = lambda idx: enc.encode(list(texts[idx]), batch_size=64, normalize_embeddings=True,
                                     show_progress_bar=True)
        Etr, Eva, Ete = emb(tr), emb(va), emb(te)
        preds["embed_ridge"] = _fit_ridge(Etr, y[tr], Eva, y[va]).predict(Ete)

    return {name: (p, evaluate(p, y[te])) for name, p in preds.items()}
