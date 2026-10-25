"""Turning raw records into model inputs, and keeping success signals out of them.

Blurbs on book sites often carry the very thing we are trying to predict ("#1 New York
Times bestseller", "now a major film"). A model trained on those learns to read the
marketing copy, not the book, so they are removed before anything reaches a model.
It also matches the instruction to ignore awards and legacy reviews.
"""
import re

_PROMO = [
    r"best[\s-]?sell",
    r"award[\s-]?winn",
    r"prize[\s-]?winn",
    r"\bwinner of\b",
    r"\bnominated for\b",
    r"\b(short|long)[\s-]?list",
    r"\b(pulitzer|booker|hugo|nebula|newbery|caldecott|edgar award|nobel|national book|"
    r"goodreads choice|costa|orange prize|carnegie medal)\b",
    r"\b(new york times|usa today|wall street journal|washington post|publishers weekly|"
    r"kirkus|booklist|library journal|the guardian|sunday times|times literary)\b",
    r"\b(over|more than|nearly|almost)\s+[\d.,]+\s*(million|billion)?\s*copies",
    r"\b[\d.,]+\s*(million|billion)\s+(copies|readers)",
    r"#\s?1\b",
    r"\bnumber[\s-]one\b",
    r"★|\bstarred review",
    r"\bnow a (major )?(motion picture|film|movie|netflix|hbo|tv|television)",
    r"\b(a major|the hit)\s+(motion picture|film|tv|television|netflix|hbo)",
    r"\badapt(ed|ation)\b.{0,40}\b(film|movie|series|netflix|hbo)",
]
_PROMO_RE = re.compile("|".join(_PROMO), re.IGNORECASE)
# “Gripping!” —Some Paper
_QUOTE_ATTRIB_RE = re.compile(r"^[“\"‘'].{0,300}[”\"’']\s*[—–-]+\s*\S")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")

# Subject tags on Open Library that are really bookkeeping or success markers.
_BAD_SUBJECT_RE = re.compile(
    r"^(nyt|award|prize|collectionid|series|reviewed|in library|accessible|"
    r"overdrive|large type|internet archive|protected daisy|lending library)\b|"
    r"[a-z]+:[a-z0-9_=\-]+|best[\s-]?sell|award|prize|winner|reviewed",
    re.IGNORECASE,
)

_STOP = {"the", "and", "of", "to", "a", "in", "is", "that", "for", "with", "was", "his",
         "her", "he", "she", "it", "as", "on", "by"}


def scrub_promo(text: str) -> tuple[str, int]:
    """Drop every sentence that mentions sales, awards, reviewers or adaptations."""
    kept, removed = [], 0
    for sent in _SENTENCE_SPLIT.split(text or ""):
        s = sent.strip()
        if not s:
            continue
        if _PROMO_RE.search(s) or _QUOTE_ATTRIB_RE.match(s):
            removed += 1
        else:
            kept.append(s)
    return " ".join(kept), removed


def clean_subjects(subjects, limit=8) -> list[str]:
    out = []
    for s in subjects or []:
        s = str(s).strip()
        if not s or len(s) > 60 or _BAD_SUBJECT_RE.search(s):
            continue
        if s.lower() not in (o.lower() for o in out):
            out.append(s)
        if len(out) >= limit:
            break
    return out


def looks_english(text: str) -> bool:
    words = re.findall(r"[a-z']+", (text or "").lower())
    if len(words) < 20:
        return False
    return sum(w in _STOP for w in words) / len(words) > 0.2


_GENRES = [
    ("romance", ("romance", "love stories")),
    ("mystery/thriller", ("mystery", "thriller", "detective", "suspense", "crime")),
    ("fantasy", ("fantasy", "magic", "dragons")),
    ("science fiction", ("science fiction", "dystopia", "space")),
    ("horror", ("horror", "ghost", "vampire")),
    ("children/YA", ("juvenile", "children", "young adult", "picture book")),
    ("biography/memoir", ("biograph", "memoir", "autobiograph")),
    ("history", ("history", "war")),
    ("self-help/business", ("self-help", "business", "management", "success")),
    ("literary/general fiction", ("fiction", "novel", "short stories")),
]


def coarse_genre(subjects) -> str:
    blob = " | ".join(clean_subjects(subjects, limit=20)).lower()
    for name, keys in _GENRES:
        if any(k in blob for k in keys):
            return name
    return "other"


def build_blurb_input(description: str, subjects, title: str | None = None) -> str:
    premise, _ = scrub_promo(description)
    parts = []
    if title:
        parts.append(f"Title: {title}")
    tags = clean_subjects(subjects)
    if tags:
        parts.append("Genre/subjects: " + ", ".join(tags))
    parts.append("Premise: " + premise)
    return "\n".join(parts)


def build_inputs(df, view="blurb", include_title=False) -> list[str]:
    if view != "blurb":
        raise ValueError(f"unsupported view {view!r}; stage 1 only has blurb data")
    return [
        build_blurb_input(r.description, r.subjects, r.title if include_title else None)
        for r in df.itertuples(index=False)
    ]
