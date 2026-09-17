from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import duckdb


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "extract-case-public-techniques.py"
PYTHON = Path(sys.executable)


def load_extractor_module():
    spec = importlib.util.spec_from_file_location(
        "extract_case_public_techniques", SCRIPT
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load extractor module: {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extractor = load_extractor_module()


class ExtractCasePublicTechniquesTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.db_path = Path(self.tempdir.name) / "entry_atlas.duckdb"
        con = duckdb.connect(str(self.db_path))
        try:
            con.execute(
                "CREATE TABLE chain "
                "(pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)"
            )
            con.execute(
                "CREATE TABLE profile ("
                "pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, "
                "tech_filter VARCHAR, is_background_channel BOOLEAN)"
            )
            con.executemany(
                "INSERT INTO chain VALUES (?, ?, ?)",
                [
                    ("1ABC", "A", "1ABC|A"),
                    ("1ABC", "a", "1ABC|a"),
                    ("2DEF", "B", "2DEF|B"),
                ],
            )
            con.executemany(
                "INSERT INTO profile VALUES (?, ?, ?, ?, ?)",
                [
                    ("1ABC", "1ABC|A", "p_unmapped", "unmapped/raw", None),
                    ("1ABC", "1ABC|A", "p_mapped", "DMS", False),
                    (
                        "1ABC",
                        "1ABC|A",
                        "p_null_background",
                        None,
                        True,
                    ),
                    (
                        "1ABC",
                        "1ABC|A",
                        "p_null_nonbackground",
                        None,
                        False,
                    ),
                    ("1ABC", "1ABC|a", "p_lower", "SHAPE-MaP", True),
                    ("2DEF", "2DEF|B", "z_profile", None, None),
                    ("2DEF", "2DEF|B", "a_profile", "FRET", False),
                ],
            )
        finally:
            con.close()

    def file_fingerprint(self):
        stat = self.db_path.stat()
        return (
            hashlib.sha256(self.db_path.read_bytes()).hexdigest(),
            stat.st_size,
            stat.st_mtime_ns,
        )

    def test_exact_auth_case_raw_values_and_stable_order(self):
        rows = list(
            extractor.extract_rows(
                self.db_path,
                [
                    {"pdbId": "2DEF", "authChain": "B"},
                    {"pdbId": "1ABC", "authChain": "a"},
                    {"pdbId": "1ABC", "authChain": "A"},
                ],
            )
        )

        self.assertEqual(
            rows,
            [
                {
                    "ordinal": 0,
                    "pdbId": "2DEF",
                    "authChain": "B",
                    "chainKey": "2DEF|B",
                    "profileId": "a_profile",
                    "techFilter": "FRET",
                    "isBackgroundChannel": False,
                },
                {
                    "ordinal": 0,
                    "pdbId": "2DEF",
                    "authChain": "B",
                    "chainKey": "2DEF|B",
                    "profileId": "z_profile",
                    "techFilter": None,
                    "isBackgroundChannel": None,
                },
                {
                    "ordinal": 1,
                    "pdbId": "1ABC",
                    "authChain": "a",
                    "chainKey": "1ABC|a",
                    "profileId": "p_lower",
                    "techFilter": "SHAPE-MaP",
                    "isBackgroundChannel": True,
                },
                {
                    "ordinal": 2,
                    "pdbId": "1ABC",
                    "authChain": "A",
                    "chainKey": "1ABC|A",
                    "profileId": "p_mapped",
                    "techFilter": "DMS",
                    "isBackgroundChannel": False,
                },
                {
                    "ordinal": 2,
                    "pdbId": "1ABC",
                    "authChain": "A",
                    "chainKey": "1ABC|A",
                    "profileId": "p_null_background",
                    "techFilter": None,
                    "isBackgroundChannel": True,
                },
                {
                    "ordinal": 2,
                    "pdbId": "1ABC",
                    "authChain": "A",
                    "chainKey": "1ABC|A",
                    "profileId": "p_null_nonbackground",
                    "techFilter": None,
                    "isBackgroundChannel": False,
                },
                {
                    "ordinal": 2,
                    "pdbId": "1ABC",
                    "authChain": "A",
                    "chainKey": "1ABC|A",
                    "profileId": "p_unmapped",
                    "techFilter": "unmapped/raw",
                    "isBackgroundChannel": None,
                },
            ],
        )

    def test_database_bytes_size_and_mtime_are_unchanged(self):
        before = self.file_fingerprint()
        list(
            extractor.extract_rows(
                self.db_path, [{"pdbId": "1ABC", "authChain": "A"}]
            )
        )
        self.assertEqual(self.file_fingerprint(), before)

    def test_global_summary_preserves_raw_anomalies_and_exact_chain_identity(self):
        con = duckdb.connect(str(self.db_path))
        try:
            con.execute(
                "INSERT INTO chain VALUES (?, ?, ?)",
                ["3GHI", "Z", "3GHI|Z"],
            )
            con.executemany(
                "INSERT INTO profile VALUES (?, ?, ?, ?, ?)",
                [
                    ("3GHI", "3GHI|Z", "cirs-1", "CIRS-seq", False),
                    ("3GHI", "3GHI|Z", "cirs-2", "CIRS-seq", False),
                    ("3GHI", "3GHI|Z", "glyoxal", "Glyoxal", False),
                    ("3GHI", "3GHI|Z", "terbium", "Terbium", None),
                    ("3GHI", "3GHI|Z", "null-nonbackground", None, False),
                    ("3GHI", "3GHI|Z", "null-background", None, True),
                ],
            )
        finally:
            con.close()

        before = self.file_fingerprint()
        rows = extractor.extract_global_technique_summary(self.db_path)
        selected = [row for row in rows if row["pdbId"] == "3GHI"]
        self.assertEqual(
            selected,
            [
                {
                    "pdbId": "3GHI",
                    "authChain": "Z",
                    "techFilter": None,
                    "isBackgroundChannel": False,
                    "profileCount": 1,
                },
                {
                    "pdbId": "3GHI",
                    "authChain": "Z",
                    "techFilter": None,
                    "isBackgroundChannel": True,
                    "profileCount": 1,
                },
                {
                    "pdbId": "3GHI",
                    "authChain": "Z",
                    "techFilter": "CIRS-seq",
                    "isBackgroundChannel": False,
                    "profileCount": 2,
                },
                {
                    "pdbId": "3GHI",
                    "authChain": "Z",
                    "techFilter": "Glyoxal",
                    "isBackgroundChannel": False,
                    "profileCount": 1,
                },
                {
                    "pdbId": "3GHI",
                    "authChain": "Z",
                    "techFilter": "Terbium",
                    "isBackgroundChannel": None,
                    "profileCount": 1,
                },
            ],
        )
        self.assertEqual(self.file_fingerprint(), before)

    def test_rejects_duplicate_selection(self):
        with self.assertRaises(ValueError):
            list(
                extractor.extract_rows(
                    self.db_path,
                    [
                        {"pdbId": "1ABC", "authChain": "A"},
                        {"pdbId": "1ABC", "authChain": "A"},
                    ],
                )
            )

    def test_rejects_invalid_selection_payloads(self):
        invalid_payloads = [
            {"pdbId": "1ABC", "authChain": "A"},
            [{"pdbId": "1ABC", "authChain": "A", "extra": "x"}],
            [{"pdbId": "1ABC"}],
            [{"authChain": "A"}],
            [{"pdbId": 123, "authChain": "A"}],
            [{"pdbId": "1ABC", "authChain": None}],
            [{"pdbId": "", "authChain": "A"}],
            [{"pdbId": "1ABC", "authChain": ""}],
            [{"pdbId": " 1ABC", "authChain": "A"}],
            [{"pdbId": "1ABC", "authChain": "A "}],
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                list(extractor.extract_rows(self.db_path, payload))

    def test_rejects_duplicate_database_chain_identity(self):
        con = duckdb.connect(str(self.db_path))
        try:
            con.execute(
                "INSERT INTO chain VALUES (?, ?, ?)",
                ["1ABC", "A", "1ABC|A-duplicate"],
            )
        finally:
            con.close()

        with self.assertRaises(ValueError):
            list(
                extractor.extract_rows(
                    self.db_path, [{"pdbId": "1ABC", "authChain": "A"}]
                )
            )

    def test_rejects_missing_database_chain(self):
        with self.assertRaises(ValueError):
            list(
                extractor.extract_rows(
                    self.db_path, [{"pdbId": "9ZZZ", "authChain": "Q"}]
                )
            )

    def test_existing_chain_with_no_profiles_returns_empty_rows(self):
        con = duckdb.connect(str(self.db_path))
        try:
            con.execute(
                "INSERT INTO chain VALUES (?, ?, ?)",
                ["3GHI", "Z", "3GHI|Z"],
            )
        finally:
            con.close()

        self.assertEqual(
            extractor.extract_rows(
                self.db_path, [{"pdbId": "3GHI", "authChain": "Z"}]
            ),
            [],
        )

    def test_cli_rejects_non_finite_values_without_partial_stdout(self):
        cases = [
            ("nan-tech-filter", "tech_filter", float("nan")),
            ("infinite-background", "is_background_channel", float("inf")),
        ]
        for label, non_finite_column, value in cases:
            with self.subTest(label=label):
                drift_db = Path(self.tempdir.name) / f"{label}.duckdb"
                con = duckdb.connect(str(drift_db))
                try:
                    con.execute(
                        "CREATE TABLE chain "
                        "(pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)"
                    )
                    con.execute(
                        "CREATE TABLE profile ("
                        "pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, "
                        "tech_filter DOUBLE, is_background_channel DOUBLE)"
                    )
                    con.execute(
                        "INSERT INTO chain VALUES (?, ?, ?)",
                        ["4JKL", "N", "4JKL|N"],
                    )
                    tech_filter = value if non_finite_column == "tech_filter" else 1.0
                    background = (
                        value
                        if non_finite_column == "is_background_channel"
                        else 0.0
                    )
                    con.executemany(
                        "INSERT INTO profile VALUES (?, ?, ?, ?, ?)",
                        [
                            ["4JKL", "4JKL|N", "a_valid", 1.0, 0.0],
                            [
                                "4JKL",
                                "4JKL|N",
                                "z_drift",
                                tech_filter,
                                background,
                            ],
                        ],
                    )
                finally:
                    con.close()

                selection_path = Path(self.tempdir.name) / f"{label}.json"
                selection_path.write_text(
                    json.dumps([{"pdbId": "4JKL", "authChain": "N"}]),
                    encoding="utf-8",
                )
                proc = subprocess.run(
                    [
                        str(PYTHON),
                        str(SCRIPT),
                        "--db",
                        str(drift_db),
                        "--selection-json",
                        str(selection_path),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                )

                self.assertNotEqual(
                    proc.returncode,
                    0,
                    msg=f"CLI returned 0 with stdout={proc.stdout!r}",
                )
                self.assertEqual(proc.stdout, "")
                self.assertRegex(
                    proc.stderr.lower(),
                    r"(non-finite|out of range float).*json",
                )

    def test_cli_emits_exact_compact_ndjson_without_diagnostics(self):
        selection_path = Path(self.tempdir.name) / "selection.json"
        selection_path.write_text(
            json.dumps([{"pdbId": "1ABC", "authChain": "a"}]),
            encoding="utf-8",
        )
        proc = subprocess.run(
            [
                str(PYTHON),
                str(SCRIPT),
                "--db",
                str(self.db_path),
                "--selection-json",
                str(selection_path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        expected = {
            "ordinal": 0,
            "pdbId": "1ABC",
            "authChain": "a",
            "chainKey": "1ABC|a",
            "profileId": "p_lower",
            "techFilter": "SHAPE-MaP",
            "isBackgroundChannel": True,
        }
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(
            proc.stdout,
            json.dumps(expected, ensure_ascii=False, separators=(",", ":")) + "\n",
        )
        self.assertEqual(proc.stderr, "")

    def test_cli_failure_has_nonzero_exit_and_no_partial_stdout(self):
        selection_path = Path(self.tempdir.name) / "invalid-selection.json"
        selection_path.write_text(
            json.dumps(
                [
                    {"pdbId": "1ABC", "authChain": "a"},
                    {"pdbId": "9ZZZ", "authChain": "Q"},
                ]
            ),
            encoding="utf-8",
        )
        proc = subprocess.run(
            [
                str(PYTHON),
                str(SCRIPT),
                "--db",
                str(self.db_path),
                "--selection-json",
                str(selection_path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, "")
        self.assertNotEqual(proc.stderr, "")


if __name__ == "__main__":
    unittest.main()
