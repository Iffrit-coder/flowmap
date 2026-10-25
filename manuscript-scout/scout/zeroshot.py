"""Zero-shot baseline: ask an instruct model to rate sales potential 1-9.

The score is the expected rating under the model's next-token distribution over the
digits 1-9, which ranks far better than the single sampled digit.
"""
import numpy as np
import torch
from tqdm import tqdm

PROMPT = (
    "You are an experienced acquisitions editor at a commercial trade publisher. "
    "Based only on the description below, rate this book's commercial potential (how many "
    "copies it is likely to sell) from 1 (very low) to 9 (very high). Ignore literary merit "
    "and awards. Answer with a single digit.\n\n{input}"
)


@torch.no_grad()
def judge(model, tokenizer, texts, batch_size=8, max_length=1024, device="cuda"):
    digit_ids = [tokenizer.encode(str(d), add_special_tokens=False)[-1] for d in range(1, 10)]
    tokenizer.padding_side = "left"          # last position must be the real last token
    prompts = [
        tokenizer.apply_chat_template([{"role": "user", "content": PROMPT.format(input=t)}],
                                      tokenize=False, add_generation_prompt=True)
        for t in texts
    ]
    scores = np.zeros(len(prompts), dtype=np.float32)
    order = np.argsort([len(p) for p in prompts])
    vals = torch.arange(1, 10, device=device, dtype=torch.float32)
    for i in tqdm(range(0, len(prompts), batch_size), desc="zero-shot"):
        idx = order[i:i + batch_size]
        enc = tokenizer([prompts[j] for j in idx], return_tensors="pt", padding=True,
                        truncation=True, max_length=max_length + 128).to(device)
        logits = model(**enc).logits[:, -1, :]
        probs = torch.softmax(logits[:, digit_ids].float(), dim=-1)
        scores[idx] = (probs * vals).sum(-1).cpu().numpy()
    return scores
