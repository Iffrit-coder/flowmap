"""Run this first on the PC: does the model load in 4-bit, how much VRAM does a training
step need, and how fast is it?  Also the quickest way to test a different base model."""
import time

import torch

from scout.model import build_score_model


def run(cfg, batch_size=None, seq_len=None):
    assert torch.cuda.is_available(), "no CUDA device visible"
    props = torch.cuda.get_device_properties(0)
    print(f"GPU: {props.name}  VRAM: {props.total_memory / 2**30:.1f} GiB  "
          f"bf16: {torch.cuda.is_bf16_supported()}")
    bs, L = batch_size or cfg.train.batch_size, seq_len or cfg.model.max_length
    t0 = time.time()
    model = build_score_model(cfg)
    print(f"loaded {cfg.model.name} in {time.time() - t0:.0f}s; "
          f"{torch.cuda.memory_allocated() / 2**30:.2f} GiB resident")
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"trainable params: {trainable / 1e6:.1f}M")

    model.train()
    ids = torch.randint(5, 50000, (bs, L), device="cuda")
    mask = torch.ones_like(ids)
    torch.cuda.reset_peak_memory_stats()
    times = []
    for _ in range(4):
        torch.cuda.synchronize(); t = time.time()
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out = model(ids, mask)
        out.float().pow(2).mean().backward()
        model.zero_grad(set_to_none=True)
        torch.cuda.synchronize(); times.append(time.time() - t)
    peak = torch.cuda.max_memory_allocated() / 2**30
    step = sum(times[1:]) / 3
    print(f"batch={bs} len={L}: peak {peak:.2f} GiB, {step:.2f}s/step, "
          f"{bs * L / step:.0f} tok/s (fwd+bwd)")
    print("OK" if peak < props.total_memory / 2**30 * 0.92 else "TOO CLOSE TO THE LIMIT - lower batch/length")
