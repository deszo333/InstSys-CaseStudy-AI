import unittest
from pathlib import Path
from utils.rbac_guard import (
    load_last_role_assign,
    resolve_allowed_collections,
    apply_rbac_to_collections,
)
import json

class TestRBACGuard(unittest.TestCase):
    def setUp(self):
        # Use a temporary directory under the repo's python-backend
        self.base_dir = Path(__file__).resolve().parents[2]  # python-backend
        # Ensure config dir exists
        (self.base_dir / "config").mkdir(parents=True, exist_ok=True)
        # Keep a copy of any existing file to restore later
        self.config_path = self.base_dir / "config" / "last_role_assign.json"
        self.root_path = self.base_dir / "last_role_assign.json"
        self._backup_config = None
        self._backup_root = None
        if self.config_path.exists():
            self._backup_config = self.config_path.read_text(encoding="utf-8")
        if self.root_path.exists():
            self._backup_root = self.root_path.read_text(encoding="utf-8")

    def tearDown(self):
        # Restore backups
        try:
            if self._backup_config is not None:
                self.config_path.write_text(self._backup_config, encoding="utf-8")
            elif self.config_path.exists():
                self.config_path.unlink()
        except Exception:
            pass
        try:
            if self._backup_root is not None:
                self.root_path.write_text(self._backup_root, encoding="utf-8")
            elif self.root_path.exists():
                self.root_path.unlink()
        except Exception:
            pass

    def write_assign(self, content: dict, where: str = "config"):
        if where == "config":
            self.config_path.write_text(json.dumps(content), encoding="utf-8")
        else:
            self.root_path.write_text(json.dumps(content), encoding="utf-8")

    def test_load_last_role_assign_order(self):
        # root has Guest, config has Admin; config should win
        self.write_assign({"role": "Guest", "assign": ["Guest"]}, where="root")
        self.write_assign({"role": "Admin", "assign": [""]}, where="config")
        role, assign = load_last_role_assign(self.base_dir)
        self.assertEqual(role, "Admin")
        self.assertEqual(assign, [""])

    def test_resolve_admin_all_collections(self):
        discovered = ["students_ccs", "schedules_ccs", "other"]
        allowed = resolve_allowed_collections(discovered, "admin", [""])
        self.assertEqual(sorted(allowed), sorted(discovered))

    def test_resolve_guest_public_only(self):
        discovered = ["students_ccs", "public_info", "guest_notes"]
        allowed = resolve_allowed_collections(discovered, "Guest", ["Guest"])
        self.assertEqual(sorted(allowed), sorted(["public_info", "guest_notes"]))

    def test_resolve_faculty_by_assign(self):
        discovered = ["students_ccs", "schedules_cba", "grades_chtm", "events_ccs"]
        # Assign BSIT (mapped to ccs)
        allowed = resolve_allowed_collections(discovered, "Teaching_Faculty", ["BSIT"])
        self.assertEqual(sorted(allowed), sorted(["students_ccs", "events_ccs"]))

    def test_resolve_student_restrict_students(self):
        discovered = ["students_ccs", "schedules_ccs", "public_info"]
        allowed = resolve_allowed_collections(discovered, "student", [])
        self.assertEqual(sorted(allowed), ["students_ccs"])

    def test_apply_rbac_debug(self):
        self.write_assign({"role": "Teaching_Faculty", "assign": ["BSCS"]}, where="config")
        discovered = ["students_ccs", "schedules_ccs", "grades_chtm"]
        # project root is the parent of python-backend
        allowed, dbg = apply_rbac_to_collections(discovered, self.base_dir.parents[0])
        self.assertEqual(dbg["role"], "Teaching_Faculty")
        self.assertEqual(dbg["assign"], ["BSCS"])
        # ccs should be allowed
        self.assertTrue(all("ccs" in c for c in allowed))

if __name__ == "__main__":
    unittest.main(verbosity=2)
