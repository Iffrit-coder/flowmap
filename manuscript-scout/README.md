# manuscript-scout

Rank manuscripts and pitches by **sales potential** with a QLoRA-tuned open model
(default: `allenai/Olmo-3-1025-7B`, Apache-2.0, fully open weights/data/code), sized for a
10 GB RTX 3080. Awards and critical reviews are deliberately excluded from both the inputs
and the labels.

## What stage 1 can and cannot tell you

Legal, bulk-downloadable data does not contain "full manuscript + sales figures" for modern
books. So stage 1 is built on what does exist:

| | |
|---|---|
| **Input** | Genre tags + a back-cover style premise from [Open Library](https://openlibrary.org/developers/dumps) bulk dumps (CC0, official downloads, no page scraping) |
| **Label** | How many readers shelved the work (want / reading / read), as a percentile **within its first-publication year**, then probit-transformed. A popularity *proxy*, not sales. |
| **Scrubbed** | Sentences mentioning bestseller status, awards, reviewers, copy counts, adaptations, and subject tags like `nyt:…`, so the model cannot just read the marketing. Titles/authors are off by default (memorised famous books). |

So the model learns "what kind of premise draws readers", **not** prose quality, and it
must be shown a blurb-style synopsis, not chapters. The step that makes it a manuscript
model is training on *your* data: submissions (or acquired titles) paired with real sales.
Put those in the same table format (`description`, `subjects`, `year`, `label`, `split`)
and add `view: excerpt` support in `scout/text.py`. Keep that data out of git (`data/` is
ignored) and check that your submission terms permit it.

Not scraped on purpose: Amazon, Goodreads, Wattpad/Royal Road/AO3 (terms of service and
copyright). Shadow libraries (Books3 etc.) are off the table.

## Setup on the PC (WSL2 Ubuntu recommended)

```bash
git clone <this repo> && cd manuscript-scout
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu124   # match your CUDA driver
pip install -e ".[gpu,dev]"          # add ",embed" for the embedding baseline
python -m pytest -q                  # CPU tests, ~20 s
```

## Run order

```bash
python -m scout smoke                 # 1. VRAM + speed check; try --batch-size 4 --seq-len 2048
python -m scout download              # 2. Open Library dumps (several GB, CC0)
python -m scout build                 #    -> data/works.jsonl.gz (RAM use not yet measured; expect several GB)
python -m scout baselines [--embeddings]   # 3. cheap baselines (minutes)
python -m scout zeroshot              #    OLMo-3-7B-Instruct as a 1-9 "editor" (2000 test blurbs)
python -m scout train                 # 4. QLoRA fine-tune; best checkpoint by val Spearman
python -m scout eval                  #    test-set table + per-genre breakdown
python -m scout score ./pitches --out ranking.csv   # 5. folder of <id>.txt blurbs -> ranked CSV
```

Override anything: `python -m scout --set train.lr=2e-4 --set model.max_length=2048 train`.
Try the newer hybrid model with `--set model.name=allenai/Olmo-Hybrid-7B` (needs
`transformers>=5.3`; run `smoke` first, 4-bit support for its DeltaNet layers is untested).

## How to read the results

Evaluation is a **time split** (train ≤2015, val 2016-18, test 2019+), so the test set is
"books the model has never seen from the future". Compare against the baselines in the same
table:

* `blurb_length` - if this is strong, the label is partly a catalogue-quality artefact.
* `subjects_tfidf` - how much genre alone explains. The LLM only earns its keep above this.
* `text_tfidf` - the bag-of-words ceiling to beat.

Headline metrics: Spearman (with bootstrap CI), AUC for "top decile", precision/lift at the
top 1/5/10%. Lift 1.0 = random.

## Known limits

* Open Library engagement skews to its own users and to older works; recent titles are
  under-counted (hence `max_year: 2022`). Sequels share blurbs across the split (no series ids).
* Sales depend on author platform, marketing and price, which a premise cannot see.
  Use scores to **triage a pile for human editors**, not to reject work, and audit results
  by genre: a model trained on past popularity inherits past tastes.
* OLMo 3 was pre-trained on web/book text; recognising a famous premise is possible even
  with titles removed. Treat very high scores on well-known books with suspicion.
