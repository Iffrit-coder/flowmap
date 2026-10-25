import re
from pathlib import Path
from types import SimpleNamespace

import yaml


def _ns(d):
    return SimpleNamespace(**{k: _ns(v) if isinstance(v, dict) else v for k, v in d.items()})


_SCI = re.compile(r"[-+]?\d+(\.\d*)?[eE][-+]?\d+")


def _parse(val):
    v = yaml.safe_load(val)
    # YAML 1.1 reads "2e-4" (no dot) as a string; a learning rate typed that way must be a float.
    return float(v) if isinstance(v, str) and _SCI.fullmatch(v) else v


def load_config(path, overrides=None):
    """Load YAML into nested namespaces. Overrides look like ``train.lr=2e-4``."""
    raw = yaml.safe_load(Path(path).read_text())
    for item in overrides or []:
        key, _, val = item.partition("=")
        node = raw
        *parents, leaf = key.split(".")
        for p in parents:
            node = node[p]
        node[leaf] = _parse(val)
    return _ns(raw)
