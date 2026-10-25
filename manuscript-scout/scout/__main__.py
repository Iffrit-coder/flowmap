import argparse
import json
import sys
from pathlib import Path

import numpy as np

from scout.config import load_config


def _tokenizer(name):
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(name)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    return tok


def _load(cfg):
    from scout.data.openlibrary import load_table
    from scout.text import build_inputs
    df = load_table(Path(cfg.data.dir) / "works.jsonl.gz")
    return df, build_inputs(df, cfg.data.view, cfg.data.include_title)


def cmd_download(cfg, a):
    from scout.data.openlibrary import download
    download(Path(cfg.data.dir) / "raw")


def cmd_build(cfg, a):
    from scout.data.openlibrary import build_table
    df = build_table(Path(cfg.data.dir) / "raw", Path(cfg.data.dir) / "works.jsonl.gz", cfg.data)
    print(df.split.value_counts().to_string())
    print(f"{len(df):,} works; {(df.engagement > 0).mean():.0%} with any engagement")


def cmd_baselines(cfg, a):
    from scout.evaluate import markdown_table
    from scout.baselines import run_baselines
    df, texts = _load(cfg)
    res = run_baselines(df, texts, use_embeddings=a.embeddings)
    out = Path(cfg.train.out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / "baselines.json").write_text(json.dumps({k: v[1] for k, v in res.items()}, indent=2))
    print(markdown_table({k: v[1] for k, v in res.items()}))


def cmd_zeroshot(cfg, a):
    import torch
    from transformers import AutoModelForCausalLM
    from scout.evaluate import evaluate
    from scout.model import _quant_config
    from scout.zeroshot import judge
    df, texts = _load(cfg)
    te = np.flatnonzero((df.split == "test").to_numpy())
    te = np.random.default_rng(0).permutation(te)[: a.n]
    tok = _tokenizer(a.model)
    model = AutoModelForCausalLM.from_pretrained(
        a.model, dtype=torch.bfloat16, quantization_config=_quant_config(), device_map={"": 0}).eval()
    s = judge(model, tok, [texts[i] for i in te], max_length=cfg.model.max_length)
    m = evaluate(s, df.label.to_numpy()[te])
    print(json.dumps(m, indent=2))
    out = Path(cfg.train.out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / "zeroshot.json").write_text(json.dumps(m, indent=2))


def cmd_smoke(cfg, a):
    from scout.smoke import run
    if a.model:
        cfg.model.name = a.model
    run(cfg, a.batch_size, a.seq_len)


def cmd_train(cfg, a):
    from scout.model import build_score_model
    from scout.train import fit
    df, texts = _load(cfg)
    texts = np.asarray(texts, dtype=object)
    tr, va = (np.flatnonzero((df.split == s).to_numpy()) for s in ("train", "val"))
    y = df.label.to_numpy()
    tok = _tokenizer(cfg.model.name)
    model = build_score_model(cfg)
    best = fit(model, tok, texts[tr], y[tr], texts[va], y[va], cfg, cfg.train.out_dir)
    print(f"best val spearman {best:.3f}")
    ck = Path(cfg.train.out_dir) / "best"
    from scout.score import calibration_from_val
    (ck / "calibration.json").write_text(json.dumps(calibration_from_val(np.load(ck / "val_pred.npy"))))


def cmd_eval(cfg, a):
    from scout.evaluate import by_group, evaluate, markdown_table
    from scout.model import load_checkpoint
    from scout.text import coarse_genre
    from scout.train import predict
    df, texts = _load(cfg)
    te = np.flatnonzero((df.split == "test").to_numpy())
    ck = Path(cfg.train.out_dir) / "best"
    model, meta = load_checkpoint(ck)
    tok = _tokenizer(meta["base_model"])
    p = predict(model, tok, [texts[i] for i in te], meta["max_length"], cfg.train.eval_batch_size)
    y = df.label.to_numpy()[te]
    res = {"olmo_lora": evaluate(p, y)}
    out = Path(cfg.train.out_dir)
    base = out / "baselines.json"
    if base.exists():
        res = {**json.loads(base.read_text()), **res}
    print(markdown_table(res))
    groups = [coarse_genre(s) for s in df.subjects.to_numpy()[te]]
    gres = by_group(p, y, groups)
    print("\nper-genre Spearman:")
    for g, v in gres.items():
        print(f"  {g:28s} n={v['n']:6d}  rho={v['spearman']:.3f}")
    (out / "test_results.json").write_text(json.dumps({"overall": res, "by_genre": gres}, indent=2))
    np.save(out / "test_pred.npy", p)


def cmd_score(cfg, a):
    from scout.model import load_checkpoint
    from scout.score import run
    ck = Path(cfg.train.out_dir) / "best"
    model, meta = load_checkpoint(ck)
    df = run(model, _tokenizer(meta["base_model"]), meta, ck, a.folder, a.out)
    print(df.head(20).to_string(index=False))


def main():
    ap = argparse.ArgumentParser(prog="scout")
    ap.add_argument("--config", default="configs/default.yaml")
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VAL", help="override config, e.g. train.lr=2e-4")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("download"); sub.add_parser("build")
    b = sub.add_parser("baselines"); b.add_argument("--embeddings", action="store_true")
    z = sub.add_parser("zeroshot"); z.add_argument("--model", default="allenai/Olmo-3-7B-Instruct"); z.add_argument("--n", type=int, default=2000)
    s = sub.add_parser("smoke"); s.add_argument("--model"); s.add_argument("--batch-size", type=int); s.add_argument("--seq-len", type=int)
    sub.add_parser("train"); sub.add_parser("eval")
    sc = sub.add_parser("score"); sc.add_argument("folder"); sc.add_argument("--out", default="ranking.csv")
    a = ap.parse_args()
    cfg = load_config(a.config, a.set)
    globals()[f"cmd_{a.cmd}"](cfg, a)


if __name__ == "__main__":
    sys.exit(main())
