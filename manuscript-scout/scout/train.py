"""Plain PyTorch loop: regression on the cohort-normalised popularity label."""
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
from scipy.stats import spearmanr
from tqdm import tqdm

from scout.model import save_checkpoint


def encode(tokenizer, texts, max_length):
    return tokenizer(list(texts), truncation=True, max_length=max_length, padding=True,
                     return_tensors="pt")


@torch.no_grad()
def predict(model, tokenizer, texts, max_length, batch_size, device="cuda", desc="predict"):
    model.eval()
    texts = list(texts)
    order = np.argsort([len(t) for t in texts])        # similar lengths -> little padding
    out = np.zeros(len(texts), dtype=np.float32)
    for i in tqdm(range(0, len(texts), batch_size), desc=desc, leave=False):
        idx = order[i:i + batch_size]
        enc = encode(tokenizer, [texts[j] for j in idx], max_length).to(device)
        with torch.autocast(device_type=torch.device(device).type, dtype=torch.bfloat16):
            out[idx] = model(enc["input_ids"], enc["attention_mask"]).float().cpu().numpy()
    return out


def _batches(n, batch_size, lengths, rng):
    """Shuffle, then sort inside mega-batches so padding stays small but order is random."""
    perm = rng.permutation(n)
    mega = batch_size * 32
    batches = []
    for i in range(0, n, mega):
        chunk = sorted(perm[i:i + mega], key=lambda j: lengths[j])
        batches += [chunk[k:k + batch_size] for k in range(0, len(chunk), batch_size)]
    rng.shuffle(batches)
    return batches


def _lr_lambda(total, warmup):
    def f(step):
        if step < warmup:
            return (step + 1) / max(1, warmup)
        p = (step - warmup) / max(1, total - warmup)
        return 0.5 * (1 + math.cos(math.pi * min(1.0, p)))
    return f


def fit(model, tokenizer, tr_texts, tr_y, va_texts, va_y, cfg, out_dir, device="cuda"):
    t = cfg.train
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(t.seed)
    torch.manual_seed(t.seed)

    tr_texts, tr_y = list(tr_texts), np.asarray(tr_y, dtype=np.float32)
    if t.max_train_examples:
        keep = rng.permutation(len(tr_texts))[: t.max_train_examples]
        tr_texts, tr_y = [tr_texts[i] for i in keep], tr_y[keep]
    lengths = [len(x) for x in tr_texts]

    lora_params = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("head.")]
    opt = torch.optim.AdamW(
        [{"params": lora_params, "lr": t.lr},
         {"params": model.head.parameters(), "lr": t.head_lr}],
        weight_decay=t.weight_decay)
    steps_per_epoch = math.ceil(len(tr_texts) / (t.batch_size * t.grad_accum))
    total = steps_per_epoch * t.epochs
    sched = torch.optim.lr_scheduler.LambdaLR(opt, _lr_lambda(total, int(t.warmup_ratio * total)))

    meta = {"base_model": cfg.model.name, "max_length": cfg.model.max_length,
            "view": cfg.data.view, "include_title": cfg.data.include_title}
    log = open(out_dir / "log.jsonl", "a")
    best, bad, step, t0 = -np.inf, 0, 0, time.time()
    mse = torch.nn.MSELoss()

    def evaluate_now():
        nonlocal best, bad
        p = predict(model, tokenizer, va_texts, cfg.model.max_length, t.eval_batch_size, device, "val")
        rho = float(spearmanr(p, va_y).statistic)
        rec = {"step": step, "val_spearman": rho, "elapsed_s": round(time.time() - t0)}
        log.write(json.dumps(rec) + "\n"); log.flush()
        print(rec)
        if rho > best:
            best, bad = rho, 0
            save_checkpoint(model, out_dir / "best", meta)
            np.save(out_dir / "best" / "val_pred.npy", p)
        else:
            bad += 1
        model.train()

    model.train()
    for epoch in range(t.epochs):
        batches = _batches(len(tr_texts), t.batch_size, lengths, rng)
        pbar = tqdm(batches, desc=f"epoch {epoch + 1}/{t.epochs}")
        for i, idx in enumerate(pbar, 1):
            enc = encode(tokenizer, [tr_texts[j] for j in idx], cfg.model.max_length).to(device)
            y = torch.tensor(tr_y[idx], device=device)
            with torch.autocast(device_type=torch.device(device).type, dtype=torch.bfloat16):
                pred = model(enc["input_ids"], enc["attention_mask"])
            loss = mse(pred.float(), y) / t.grad_accum
            loss.backward()
            if i % t.grad_accum == 0 or i == len(batches):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
                step += 1
                pbar.set_postfix(loss=f"{loss.item() * t.grad_accum:.3f}")
                if step % t.eval_every == 0:
                    evaluate_now()
                    if bad >= t.patience:
                        print("early stop"); return best
    evaluate_now()
    return best
