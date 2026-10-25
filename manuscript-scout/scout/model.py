"""OLMo backbone (4-bit) + LoRA + a scalar scoring head.

The backbone is loaded with ``AutoModel`` (no LM head), which saves ~0.8 GB of the 10 GB
card. Embeddings and norms stay in bf16 (we deliberately skip peft's
``prepare_model_for_kbit_training``, which would upcast them to fp32).
"""
import json
from pathlib import Path

import torch
from torch import nn

LORA_TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


class ScoreModel(nn.Module):
    def __init__(self, backbone, hidden_size, dropout=0.1):
        super().__init__()
        self.backbone = backbone
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden_size, 1))

    def forward(self, input_ids, attention_mask):
        h = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        h = h.float()
        m = attention_mask.unsqueeze(-1).to(h.dtype)
        pooled = (h * m).sum(1) / m.sum(1).clamp(min=1)
        return self.head(pooled).squeeze(-1)


def _quant_config():
    from transformers import BitsAndBytesConfig
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )


def load_base(name, quantize=True):
    from transformers import AutoModel
    kw = dict(dtype=torch.bfloat16)
    if quantize:
        kw.update(quantization_config=_quant_config(), device_map={"": 0})
    return AutoModel.from_pretrained(name, **kw)


def attach_lora(base, lora_cfg, gradient_checkpointing=True):
    from peft import LoraConfig, get_peft_model
    if gradient_checkpointing:
        base.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
        base.enable_input_require_grads()
    cfg = LoraConfig(r=lora_cfg.r, lora_alpha=lora_cfg.alpha, lora_dropout=lora_cfg.dropout,
                     target_modules=LORA_TARGETS, bias="none", task_type="FEATURE_EXTRACTION")
    return get_peft_model(base, cfg)


def build_score_model(cfg, base=None, device="cuda"):
    """Fresh LoRA + head on top of the base model named in cfg (or a supplied base)."""
    base = base if base is not None else load_base(cfg.model.name, cfg.model.quantize_4bit)
    backbone = attach_lora(base, cfg.model.lora)
    model = ScoreModel(backbone, base.config.hidden_size)
    model.head.to(device)
    return model


def save_checkpoint(model, out_dir, meta):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.backbone.save_pretrained(out_dir)
    torch.save(model.head.state_dict(), out_dir / "head.pt")
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))


def load_checkpoint(ckpt_dir, quantize=True, device="cuda"):
    from peft import PeftModel
    ckpt_dir = Path(ckpt_dir)
    meta = json.loads((ckpt_dir / "meta.json").read_text())
    base = load_base(meta["base_model"], quantize)
    backbone = PeftModel.from_pretrained(base, ckpt_dir, is_trainable=False)
    model = ScoreModel(backbone, base.config.hidden_size)
    model.head.load_state_dict(torch.load(ckpt_dir / "head.pt", map_location="cpu"))
    model.head.to(device)
    return model.eval(), meta
