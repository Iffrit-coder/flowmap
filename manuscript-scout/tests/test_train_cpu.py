"""End-to-end on CPU with a tiny random Olmo3: LoRA wiring, training loop, checkpoint round trip."""
import json

import numpy as np
import pytest

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")
pytest.importorskip("peft")

from scout.config import load_config
from scout.model import build_score_model, load_checkpoint
from scout.train import fit, predict


class FakeTok:
    def __call__(self, texts, truncation, max_length, padding, return_tensors):
        ids = [[hash(w) % 400 + 1 for w in t.split()][:max_length] or [1] for t in texts]
        L = max(map(len, ids))
        x = torch.zeros(len(ids), L, dtype=torch.long)
        m = torch.zeros(len(ids), L, dtype=torch.long)
        for i, row in enumerate(ids):
            x[i, :len(row)] = torch.tensor(row); m[i, :len(row)] = 1
        return transformers.BatchEncoding({"input_ids": x, "attention_mask": m})


def _tiny_base(tmp_path):
    cfg = transformers.Olmo3Config(
        vocab_size=512, hidden_size=64, intermediate_size=128, num_hidden_layers=4,
        num_attention_heads=4, num_key_value_heads=4, max_position_embeddings=256, pad_token_id=0,
        sliding_window=32, layer_types=["sliding_attention"] * 3 + ["full_attention"])
    torch.manual_seed(0)
    base = transformers.AutoModel.from_config(cfg)
    base.save_pretrained(tmp_path / "base")
    return base


def test_train_learns_and_checkpoint_roundtrips(tmp_path, monkeypatch):
    cfg = load_config("configs/default.yaml", [
        f"model.name={tmp_path / 'base'}", "model.quantize_4bit=false", "model.max_length=32",
        "model.lora.r=8", "train.epochs=6", "train.batch_size=8", "train.grad_accum=1",
        "train.lr=3e-3", "train.head_lr=1e-2", "train.eval_every=10", "train.patience=99",
        "train.eval_batch_size=16"])
    base = _tiny_base(tmp_path)
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    rng = np.random.default_rng(0)
    def make(n):
        good = rng.random(n) < 0.5
        txt = [("sun harvest bright " if g else "storm ledger grim ") * 3 + f"x{rng.integers(50)}" for g in good]
        return txt, np.where(good, 1.0, -1.0) + rng.normal(0, .1, n)
    (trx, try_), (vax, vay) = make(160), make(64)

    model = build_score_model(cfg, base=base, device="cpu")
    assert sum(p.requires_grad for p in model.parameters()) > 0
    assert not any(p.requires_grad for n, p in model.named_parameters() if "base_layer" in n)
    tok = FakeTok()
    best = fit(model, tok, trx, try_, vax, vay, cfg, tmp_path / "run", device="cpu")
    assert best > 0.7, f"tiny model should learn the planted signal, got {best:.2f}"
    assert (tmp_path / "run" / "best" / "head.pt").exists()
    assert json.loads((tmp_path / "run" / "log.jsonl").read_text().splitlines()[0])["step"] == 10

    p1 = predict(model, tok, vax, 32, 16, device="cpu")
    loaded, meta = load_checkpoint(tmp_path / "run" / "best", quantize=False, device="cpu")
    p2 = predict(loaded, tok, vax, 32, 16, device="cpu")
    assert meta["max_length"] == 32
    best_pred = np.load(tmp_path / "run" / "best" / "val_pred.npy")
    assert np.allclose(p2, best_pred, atol=1e-2)
