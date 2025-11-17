from __future__ import annotations
from pathlib import Path
from typing import List, Tuple, Dict, Any
import json

# RBAC guard to restrict Mongo collections by role/assignment
# Search order for last_role_assign.json:
# 1) python-backend/config/last_role_assign.json
# 2) python-backend/last_role_assign.json
# Fallback: Guest with assign ["Guest"]

_DEFAULT_ASSIGN = {"role": "Guest", "assign": ["Guest"]}

_PROGRAM_TO_DEPT = {
    # CCS
    "BSCS": "ccs",
    "BSIT": "ccs",
    # CHTM
    "BSHM": "chtm",
    "BSTM": "chtm",
    # CBA
    "BSOAd": "cba",
    # CTE
    "BECEd": "cte",
    "BTLEd": "cte",
}


def _load_json(p: Path) -> Dict[str, Any]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def load_last_role_assign(base_dir: Path) -> Tuple[str, List[str]]:
    """
    Resolve role/assign from last_role_assign.json files.
    base_dir should be the python-backend directory.
    """
    config_path = base_dir / "config" / "last_role_assign.json"
    root_path = base_dir / "last_role_assign.json"

    data: Dict[str, Any] = {}
    if config_path.exists():
        data = _load_json(config_path)
    elif root_path.exists():
        data = _load_json(root_path)

    role = str(data.get("role") or _DEFAULT_ASSIGN["role"])  # type: ignore
    assign = list(data.get("assign") or _DEFAULT_ASSIGN["assign"])  # type: ignore
    return role, assign


def _filter_by_dept(discovered: List[str], assigns: List[str]) -> List[str]:
    # Map assigns (program codes) to dept keys and filter discovered collection names
    dept_keys = set()
    for a in assigns:
        dept = _PROGRAM_TO_DEPT.get(a)
        if dept:
            dept_keys.add(dept.lower())
    if not dept_keys:
        return []

    result = [c for c in discovered if any(k in c.lower() for k in dept_keys)]
    return sorted(set(result))


def resolve_allowed_collections(discovered: List[str], role: str, assign: List[str]) -> List[str]:
    role_norm = (role or "").strip().lower()

    if role_norm == "admin":
        return sorted(set(discovered))

    if role_norm in ("guest",):
        # guests get minimal public read-only collections (if any)
        # heuristic: collections containing "public" or "guest"
        allowed = [c for c in discovered if ("public" in c.lower() or "guest" in c.lower())]
        return sorted(set(allowed))

    if role_norm in ("teaching_faculty", "faculty"):
        allowed = _filter_by_dept(discovered, assign)
        return allowed

    if role_norm in ("student",):
        # restrict to collections clearly marked as students for safety
        allowed = [c for c in discovered if "student" in c.lower()]
        return sorted(set(allowed))

    # default: no restriction (or conservative empty?)
    # Prefer conservative: if unknown role, allow only collections that contain 'student'
    allowed = [c for c in discovered if "student" in c.lower()]
    return sorted(set(allowed))


def apply_rbac_to_collections(discovered: List[str], project_root: Path) -> Tuple[List[str], Dict[str, Any]]:
    """
    Apply RBAC to discovered collections using last_role_assign.json.
    Returns (allowed_collections, debug_info)
    """
    base_dir = project_root / "python-backend"
    role, assign = load_last_role_assign(base_dir)
    allowed = resolve_allowed_collections(discovered, role, assign)

    # If restriction yields nothing, fall back to discovered but provide a warning
    # Caller can decide whether to honor the fallback or not.
    debug = {
        "role": role,
        "assign": assign,
        "before": discovered,
        "after": allowed,
        "fallback": False,
    }

    if not allowed and discovered:
        # Keep minimal safety: do not expose everything silently; leave empty but mark fallback available
        debug["fallback"] = True

    return allowed, debug
