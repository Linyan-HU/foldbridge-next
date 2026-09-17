import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import duckdb


ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = ROOT / "scripts" / "safe-openat-capture.py"
PYTHON = Path(os.environ.get("CASE_PUBLIC_TECHNIQUES_TEST_PYTHON", os.sys.executable))


def load_helper():
    spec = importlib.util.spec_from_file_location("safe_openat_capture", HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SafeOpenatCaptureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = load_helper() if HELPER_PATH.exists() else None

    def require_helper(self):
        if self.helper is None:
            self.skipTest("safe-openat helper is not implemented yet")
        return self.helper

    def make_profile_tree(self, root, content=b"original\n"):
        profiles = root / "cases" / "1ABC" / "chains" / "A" / "profiles"
        profiles.mkdir(parents=True)
        (profiles / "profile-index.json.gz").write_bytes(content)
        return profiles

    def test_helper_exports_anchored_capture(self):
        self.assertTrue(HELPER_PATH.exists(), "safe-openat helper must exist")
        self.assertTrue(callable(self.require_helper().capture_anchored))

    def test_persistent_intermediate_directory_swap_reads_pinned_original_but_rejects_edge_drift(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            profiles = self.make_profile_tree(root)
            outside = root / "outside-profiles"
            outside.mkdir()
            (outside / "profile-index.json.gz").write_bytes(b"external\n")
            original_away = profiles.with_name("profiles-original")

            def attack(event, relative_segments):
                if event != "before_file_open":
                    return
                profiles.rename(original_away)
                profiles.symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(Exception, "edge|drift|directory|symlink"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=1024,
                    include_bytes=True,
                    hook=attack,
                )
            self.assertEqual((outside / "profile-index.json.gz").read_bytes(), b"external\n")

    def test_aba_restore_is_rejected_even_when_the_original_edge_identity_returns(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            profiles = self.make_profile_tree(root)
            outside = root / "outside-profiles"
            outside.mkdir()
            (outside / "profile-index.json.gz").write_bytes(b"external\n")
            original_away = profiles.with_name("profiles-original")

            def attack(event, relative_segments):
                if event != "before_file_open":
                    return
                profiles.rename(original_away)
                profiles.symlink_to(outside, target_is_directory=True)
                profiles.unlink()
                original_away.rename(profiles)

            with self.assertRaisesRegex(Exception, "edge|drift|directory|ABA"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=1024,
                    include_bytes=True,
                    hook=attack,
                )

    def test_canonical_root_component_aba_restore_is_rejected(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            cases = root / "cases"
            self.make_profile_tree(root)
            outside = root / "outside-cases"
            self.make_profile_tree(outside, b"external\n")
            original_away = root / "cases-original"

            def attack(event, relative_segments):
                if event != "before_file_open":
                    return
                cases.rename(original_away)
                cases.symlink_to(outside / "cases", target_is_directory=True)
                cases.unlink()
                original_away.rename(cases)

            with self.assertRaisesRegex(Exception, "edge|ABA|drift"):
                helper.capture_anchored(
                    str(cases),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=1024,
                    include_bytes=True,
                    hook=attack,
                )

    def test_static_intermediate_symlink_and_final_same_bytes_inode_swap_are_rejected(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            outside_cases = root / "outside-cases"
            outside_profiles = self.make_profile_tree(outside_cases)
            (root / "cases" / "1ABC").mkdir(parents=True)
            (root / "cases" / "1ABC" / "chains").symlink_to(
                outside_profiles.parents[2], target_is_directory=True,
            )
            with self.assertRaisesRegex(Exception, "directory|symlink|edge"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=1024,
                    include_bytes=True,
                )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            profiles = self.make_profile_tree(root)
            index = profiles / "profile-index.json.gz"
            original_away = profiles / "profile-index.original"
            replacement = root / "same-bytes-replacement"
            replacement.write_bytes(index.read_bytes())

            def attack(event, relative_segments):
                if event != "after_file_open":
                    return
                index.rename(original_away)
                os.link(replacement, index)

            with self.assertRaisesRegex(Exception, "file edge|ABA|drift|changed"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=1024,
                    include_bytes=True,
                    hook=attack,
                )

    def test_capture_cap_rejects_initial_oversize_and_concurrent_same_inode_growth(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            profiles = self.make_profile_tree(root, b"12345")
            index = profiles / "profile-index.json.gz"
            events = []
            with self.assertRaisesRegex(Exception, "exceeds 4 bytes.*0 bytes"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=4,
                    include_bytes=True,
                    hook=lambda event, relative: events.append(event),
                )
            self.assertNotIn("after_read", events)

            index.write_bytes(b"1234")
            grew = False

            def grow(event, relative_segments):
                nonlocal grew
                if event == "after_read" and not grew:
                    grew = True
                    with index.open("ab") as handle:
                        handle.write(b"5")

            with self.assertRaisesRegex(Exception, "exceeds 4 bytes"):
                helper.capture_anchored(
                    str(root / "cases"),
                    ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    max_bytes=4,
                    include_bytes=True,
                    hook=grow,
                )
            self.assertTrue(grew)

    def test_cli_failure_has_zero_partial_stdout(self):
        self.require_helper()
        request = {
            "operation": "capture",
            "root": "/",
            "segments": [".."],
            "maxBytes": 1024,
            "includeBytes": True,
        }
        result = subprocess.run(
            [str(PYTHON), str(HELPER_PATH)],
            input=(json.dumps(request, separators=(",", ":")) + "\n").encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertRegex(result.stderr.decode(), "segment|request|invalid")

    def test_cli_rejects_duplicate_keys_and_non_json_constants_with_zero_stdout(self):
        self.require_helper()
        invalid_requests = [
            b'{"operation":"bogus","operation":"capture","root":"/","segments":["no-such-file"],"maxBytes":1,"includeBytes":false}\n',
            b'{"operation":"capture","root":"/","segments":["no-such-file"],"maxBytes":1,"includeBytes":NaN}\n',
        ]
        for raw in invalid_requests:
            with self.subTest(raw=raw):
                result = subprocess.run(
                    [str(PYTHON), str(HELPER_PATH)],
                    input=raw,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")
                self.assertRegex(result.stderr.decode(), "duplicate|invalid JSON|constant")

    def test_cli_four_modes_are_strict_and_emit_one_bounded_json_line(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            profiles = self.make_profile_tree(root, b"profile\n")
            run = root / "run"
            (run / "reports").mkdir(parents=True)
            (run / "data.txt").write_bytes(b"payload\n")
            (run / "reports" / "sha256.txt").write_bytes(b"excluded\n")
            requests = [
                {
                    "operation": "capture",
                    "root": str(root / "cases"),
                    "segments": ["1ABC", "chains", "A", "profiles", "profile-index.json.gz"],
                    "maxBytes": 1024,
                    "includeBytes": True,
                },
                {
                    "operation": "inventory",
                    "root": str(root / "cases"),
                    "profileIndexMaxBytes": 32 * 1024 * 1024,
                },
                {
                    "operation": "tree",
                    "root": str(run),
                    "maxBytesByRelativePath": {},
                    "defaultMaxBytes": 1024,
                },
                {
                    "operation": "sha256",
                    "root": str(run),
                    "maxBytesByRelativePath": {},
                    "defaultMaxBytes": 1024,
                    "exclude": ["reports/sha256.txt"],
                },
            ]
            responses = []
            for request in requests:
                result = subprocess.run(
                    [str(PYTHON), str(HELPER_PATH)],
                    input=(json.dumps(request, separators=(",", ":")) + "\n").encode(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                self.assertEqual(result.stderr, b"")
                self.assertTrue(result.stdout.endswith(b"\n"))
                self.assertNotIn(b"\n", result.stdout[:-1])
                responses.append(json.loads(result.stdout))
            self.assertEqual([response["operation"] for response in responses], [
                "capture", "inventory", "tree", "sha256",
            ])
            self.assertEqual(base64.b64decode(responses[0]["bytesBase64"], validate=True), b"profile\n")
            self.assertEqual(
                [(item["pdbId"], item["authChain"]) for item in responses[1]["items"]],
                [("1ABC", "A")],
            )
            self.assertEqual([item["path"] for item in responses[2]["files"]], [
                "data.txt", "reports/sha256.txt",
            ])
            self.assertRegex(responses[3]["manifest"], r"^[0-9a-f]{64}  data\.txt\n$")

    def test_response_output_limit_is_enforced_before_stdout(self):
        helper = self.require_helper()
        with self.assertRaisesRegex(Exception, "output limit|exceeds"):
            helper.encode_response(
                {"operation": "inventory", "items": ["x" * 64]},
                max_output_bytes=32,
            )

    def test_inventory_is_byte_sorted_and_rejects_a_profiles_swap(self):
        helper = self.require_helper()
        self.assertEqual(helper.utf8_byte_sorted(["a", "A"]), ["A", "a"])
        with tempfile.TemporaryDirectory(prefix=".safe-openat-test-", dir=ROOT) as temporary:
            root = Path(temporary).resolve()
            cases = root / "cases"
            self.make_profile_tree(root, b"A\n")
            lower = cases / "1ABC" / "chains" / "a" / "profiles"
            lower.mkdir(parents=True)
            (lower / "profile-index.json.gz").write_bytes(b"a\n")
            inventory = helper.inventory_anchored(
                str(cases),
                profile_index_max_bytes=32 * 1024 * 1024,
            )
            self.assertEqual(
                [(item["pdbId"], item["authChain"]) for item in inventory],
                [("1ABC", "A"), ("1ABC", "a")],
            )

            profiles = cases / "1ABC" / "chains" / "A" / "profiles"
            outside = root / "outside-profiles"
            outside.mkdir()
            (outside / "profile-index.json.gz").write_bytes(b"external\n")
            original_away = profiles.with_name("profiles-original")

            def attack(event, relative_segments):
                if event != "before_file_open" or tuple(relative_segments) != (
                    "1ABC", "chains", "A", "profiles", "profile-index.json.gz"
                ):
                    return
                profiles.rename(original_away)
                profiles.symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(Exception, "edge|drift|directory|symlink"):
                helper.inventory_anchored(
                    str(cases),
                    profile_index_max_bytes=32 * 1024 * 1024,
                    hook=attack,
                )

    def test_tree_snapshot_and_sha_reject_nested_directory_swaps(self):
        helper = self.require_helper()
        for operation in (helper.tree_snapshot_anchored, helper.sha256_manifest_anchored):
            with self.subTest(operation=operation.__name__), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                run = root / "run"
                nested = run / "nested"
                nested.mkdir(parents=True)
                (nested / "file.txt").write_bytes(b"original\n")
                outside = root / "outside"
                outside.mkdir()
                (outside / "file.txt").write_bytes(b"external\n")
                original_away = run / "nested-original"

                def attack(event, relative_segments):
                    if event != "after_directory_open" or tuple(relative_segments) != ("nested",):
                        return
                    nested.rename(original_away)
                    nested.symlink_to(outside, target_is_directory=True)

                with self.assertRaisesRegex(Exception, "edge|drift|directory|symlink"):
                    operation(
                        str(run),
                        max_bytes_by_relative_path={},
                        default_max_bytes=64 * 1024 * 1024,
                        hook=attack,
                    )

    def test_repeated_inventory_and_tree_verification_failures_do_not_leak_dirfds(self):
        helper = self.require_helper()
        if not Path("/dev/fd").is_dir():
            self.skipTest("/dev/fd is required for deterministic descriptor accounting")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            self.make_profile_tree(root)
            run = root / "run"
            (run / "nested").mkdir(parents=True)
            (run / "nested" / "file.txt").write_bytes(b"payload\n")
            original_verify = helper._verify_directory_edge

            def fail_verification(edge):
                raise helper.SafeOpenatError("injected verification failure")

            baseline = len(os.listdir("/dev/fd"))
            helper._verify_directory_edge = fail_verification
            try:
                operations = [
                    lambda: helper.inventory_anchored(
                        str(root / "cases"), profile_index_max_bytes=32 * 1024 * 1024,
                    ),
                    lambda: helper.tree_snapshot_anchored(
                        str(run), max_bytes_by_relative_path={}, default_max_bytes=None,
                    ),
                ]
                for operation in operations:
                    for _ in range(8):
                        with self.assertRaisesRegex(Exception, "injected verification failure"):
                            operation()
                    self.assertLessEqual(
                        len(os.listdir("/dev/fd")),
                        baseline + 1,
                        "verification failures must not retain opened directory descriptors",
                    )
            finally:
                helper._verify_directory_edge = original_verify

    def test_opened_directory_fstat_and_hook_failures_do_not_leak_dirfds(self):
        helper = self.require_helper()
        if not Path("/dev/fd").is_dir():
            self.skipTest("/dev/fd is required for deterministic descriptor accounting")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            child = root / "child"
            child.mkdir()
            parent_fd = os.open(root, helper.DIRECTORY_FLAGS)
            original_fstat = helper.os.fstat
            baseline = len(os.listdir("/dev/fd"))
            try:
                for _ in range(8):
                    calls = 0

                    def fail_child_fstat(fd):
                        nonlocal calls
                        calls += 1
                        if calls == 2:
                            raise OSError("injected child fstat failure")
                        return original_fstat(fd)

                    helper.os.fstat = fail_child_fstat
                    with self.assertRaisesRegex(Exception, "injected child fstat failure"):
                        helper._open_directory_edge(
                            parent_fd,
                            "child",
                            watch_parent=True,
                            relative_segments=(),
                            watch_child_metadata=True,
                        )
                helper.os.fstat = original_fstat
                self.assertLessEqual(len(os.listdir("/dev/fd")), baseline + 1)

                def fail_hook(event, relative_segments):
                    raise RuntimeError("injected directory hook failure")

                for _ in range(8):
                    with self.assertRaisesRegex(Exception, "injected directory hook failure"):
                        helper._open_expected_directory(
                            parent_fd,
                            "child",
                            (),
                            missing_ok=False,
                            hook=fail_hook,
                        )
                self.assertLessEqual(len(os.listdir("/dev/fd")), baseline + 1)
            finally:
                helper.os.fstat = original_fstat
                os.close(parent_fd)

    def test_anchored_database_connection_reads_original_inode_across_path_aba(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory(prefix=".safe-openat-db-fd-", dir=ROOT) as temporary:
            root = Path(temporary).resolve()
            source = root / "source.duckdb"
            malicious = root / "malicious.duckdb"
            for database, marker in ((source, "ORIGINAL"), (malicious, "MALICIOUS")):
                connection = duckdb.connect(str(database))
                connection.execute("CREATE TABLE marker(value VARCHAR)")
                connection.execute("INSERT INTO marker VALUES (?)", [marker])
                connection.close()
            original_away = root / "source-original-away.duckdb"
            handle = helper.open_database_source_anchored(
                str(root),
                [source.name],
                max_bytes=16 * 1024 * 1024,
            )
            connection = duckdb.connect(handle["fdPath"], read_only=True)
            connection.execute("BEGIN TRANSACTION")
            source.rename(original_away)
            malicious.rename(source)
            self.assertEqual(connection.execute("SELECT value FROM marker").fetchone()[0], "ORIGINAL")
            source.rename(malicious)
            original_away.rename(source)
            connection.execute("ROLLBACK")
            connection.close()
            final_record = helper.close_database_source_anchored(
                handle,
                expected_record=handle["record"],
            )
            self.assertEqual(final_record, handle["record"])
            self.assertFalse(original_away.exists())
            self.assertEqual(list(root.glob(".database-snapshot-*")), [])

    def test_anchored_database_source_cap_and_mutation_failure_close_all_fds(self):
        helper = self.require_helper()
        if not Path("/dev/fd").is_dir():
            self.skipTest("/dev/fd is required for deterministic descriptor accounting")
        with tempfile.TemporaryDirectory(prefix=".safe-openat-db-cap-", dir=ROOT) as temporary:
            root = Path(temporary).resolve()
            source = root / "source.duckdb"
            source.write_bytes(b"original bytes\n")
            baseline = len(os.listdir("/dev/fd"))
            with self.assertRaisesRegex(Exception, "exceeds.*0 bytes"):
                helper.open_database_source_anchored(str(root), [source.name], max_bytes=1)
            self.assertLessEqual(len(os.listdir("/dev/fd")), baseline + 1)

            handle = helper.open_database_source_anchored(
                str(root), [source.name], max_bytes=1024,
            )
            source.write_bytes(b"mutated bytes!\n")
            with self.assertRaisesRegex(Exception, "changed|content"):
                helper.close_database_source_anchored(
                    handle,
                    expected_record=handle["record"],
                )
            self.assertLessEqual(len(os.listdir("/dev/fd")), baseline + 1)
            self.assertEqual(list(root.glob(".database-snapshot-*")), [])

    def materialize_inventory(self, source):
        payload = (source / "nested" / "file.txt").read_bytes()
        return {
            "directories": ["", "nested"],
            "files": [{
                "path": "nested/file.txt",
                "size": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "mode": "100644",
            }],
        }

    def assert_fixed_diagnostic_partial(self, partial):
        self.assertTrue(partial.is_dir())
        self.assertEqual(
            sorted(str(item.relative_to(partial)) for item in partial.rglob("*")),
            ["reports", "reports/build-error.txt"],
        )
        self.assertEqual(
            (partial / "reports" / "build-error.txt").read_bytes(),
            b"Preview build failed.\n",
        )

    def test_materialize_rejects_intermediate_destination_symlink_swap_without_escape(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "private-assembly"
            (source / "nested").mkdir(parents=True)
            (source / "nested" / "file.txt").write_bytes(b"original\n")
            source.chmod(0o700)
            out_parent = root / "runs"
            out_parent.mkdir()
            outside = root / "outside"
            outside.mkdir()
            sentinel = outside / "sentinel.txt"
            sentinel.write_bytes(b"untouched\n")
            moved = out_parent / ".pilot.partial" / "nested-created-away"

            def attack(event, relative_segments):
                if event != "after_destination_directory_create" or tuple(relative_segments) != ("nested",):
                    return
                nested = out_parent / ".pilot.partial" / "nested"
                nested.rename(moved)
                nested.symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(Exception, "edge|drift|directory|symlink"):
                helper.materialize_anchored(
                    str(source),
                    str(out_parent),
                    partial_name=".pilot.partial",
                    final_name="pilot",
                    expected_inventory=self.materialize_inventory(source),
                    publish=True,
                    diagnostic_text=None,
                    hook=attack,
                )
            self.assertFalse((outside / "file.txt").exists())
            self.assertEqual(sentinel.read_bytes(), b"untouched\n")
            self.assertFalse((out_parent / "pilot").exists())
            self.assert_fixed_diagnostic_partial(out_parent / ".pilot.partial")

    def test_materialize_rejects_destination_directory_aba_restore(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "private-assembly"
            (source / "nested").mkdir(parents=True)
            (source / "nested" / "file.txt").write_bytes(b"original\n")
            source.chmod(0o700)
            out_parent = root / "runs"
            out_parent.mkdir()
            outside = root / "outside"
            outside.mkdir()
            sentinel = outside / "sentinel.txt"
            sentinel.write_bytes(b"untouched\n")
            moved = out_parent / ".pilot.partial" / "nested-opened-away"

            def attack(event, relative_segments):
                if event != "after_destination_directory_open" or tuple(relative_segments) != ("nested",):
                    return
                nested = out_parent / ".pilot.partial" / "nested"
                nested.rename(moved)
                nested.symlink_to(outside, target_is_directory=True)
                nested.unlink()
                moved.rename(nested)

            with self.assertRaisesRegex(Exception, "edge|ABA|drift"):
                helper.materialize_anchored(
                    str(source),
                    str(out_parent),
                    partial_name=".pilot.partial",
                    final_name="pilot",
                    expected_inventory=self.materialize_inventory(source),
                    publish=True,
                    diagnostic_text=None,
                    hook=attack,
                )
            self.assertFalse((outside / "file.txt").exists())
            self.assertEqual(sentinel.read_bytes(), b"untouched\n")
            self.assertFalse((out_parent / "pilot").exists())
            self.assert_fixed_diagnostic_partial(out_parent / ".pilot.partial")

    def test_materialize_failure_after_copy_replaces_all_preview_bytes_with_fixed_diagnostic(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "private-assembly"
            (source / "nested").mkdir(parents=True)
            (source / "nested" / "page.html").write_bytes(b"<html>preview</html>\n")
            source.chmod(0o700)
            out_parent = root / "runs"
            out_parent.mkdir()
            payload = (source / "nested" / "page.html").read_bytes()
            inventory = {
                "directories": ["", "nested"],
                "files": [{
                    "path": "nested/page.html",
                    "size": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "mode": "100644",
                }],
            }

            def fail_after_copy(event, relative_segments):
                if event == "after_destination_file_copy":
                    raise RuntimeError("injected post-copy failure")

            with self.assertRaisesRegex(Exception, "injected post-copy failure"):
                helper.materialize_anchored(
                    str(source),
                    str(out_parent),
                    partial_name=".pilot.partial",
                    final_name="pilot",
                    expected_inventory=inventory,
                    publish=True,
                    diagnostic_text=None,
                    hook=fail_after_copy,
                )
            self.assertFalse((out_parent / "pilot").exists())
            self.assert_fixed_diagnostic_partial(out_parent / ".pilot.partial")

    def test_materialize_copies_exact_inventory_and_atomically_publishes_no_replace(self):
        helper = self.require_helper()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "private-assembly"
            (source / "nested").mkdir(parents=True)
            (source / "nested" / "file.txt").write_bytes(b"original\n")
            source.chmod(0o700)
            out_parent = root / "runs"
            out_parent.mkdir()
            inventory = self.materialize_inventory(source)
            response = helper.materialize_anchored(
                str(source),
                str(out_parent),
                partial_name=".pilot.partial",
                final_name="pilot",
                expected_inventory=inventory,
                publish=True,
                diagnostic_text=None,
            )
            self.assertEqual(response, {"published": True, "name": "pilot"})
            self.assertFalse((out_parent / ".pilot.partial").exists())
            self.assertEqual((out_parent / "pilot" / "nested" / "file.txt").read_bytes(), b"original\n")
            self.assertEqual((out_parent / "pilot").stat().st_mode & 0o777, 0o755)
            with self.assertRaisesRegex(Exception, "final.*already exists"):
                helper.materialize_anchored(
                    str(source),
                    str(out_parent),
                    partial_name=".second.partial",
                    final_name="pilot",
                    expected_inventory=inventory,
                    publish=True,
                    diagnostic_text=None,
                )
            self.assertFalse((out_parent / ".second.partial").exists())


if __name__ == "__main__":
    unittest.main()
