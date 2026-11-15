import time
from typing import Any, Dict, Tuple

_store: Dict[str, Tuple[float, Any]] = {}


def cache_get(key: str, ttl: float):
    hit = _store.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    return None


def cache_set(key: str, value: Any) -> Any:
    _store[key] = (time.time(), value)
    return value
