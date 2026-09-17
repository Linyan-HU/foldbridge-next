#!/usr/bin/env python3
"""Read selected Case profile technique metadata from an Entry Atlas DuckDB."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Any, Iterator

import duckdb


SELECTION_KEYS = {"pdbId", "authChain"}
OUTPUT_KEYS = (
    "ordinal",
    "pdbId",
    "authChain",
    "chainKey",
    "profileId",
    "techFilter",
    "isBackgroundChannel",
)
GLOBAL_SUMMARY_KEYS = (
    "pdbId",
    "authChain",
    "techFilter",
    "isBackgroundChannel",
    "profileCount",
)
MAX_SELECTION_STDOUT_BYTES = 32 * 1024 * 1024
MAX_GLOBAL_SUMMARY_STDOUT_BYTES = 64 * 1024 * 1024
MAX_BROKER_REQUEST_BYTES = 1024 * 1024
MAX_DATABASE_INPUT_BYTES = 8 * 1024 * 1024 * 1024
DEFAULT_SAFE_HELPER_PATH = str(Path(__file__).resolve().with_name("safe-openat-capture.py"))


def _validate_selections(selections: Any) -> list[tuple[int, str, str]]:
    if type(selections) is not list:
        raise ValueError("selection payload must be an array")

    validated: list[tuple[int, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for ordinal, selection in enumerate(selections):
        if type(selection) is not dict:
            raise ValueError(f"selection[{ordinal}] must be an object")
        if set(selection) != SELECTION_KEYS:
            raise ValueError(
                f"selection[{ordinal}] must have exactly pdbId and authChain"
            )

        pdb_id = selection["pdbId"]
        auth_chain = selection["authChain"]
        for key, value in (("pdbId", pdb_id), ("authChain", auth_chain)):
            if type(value) is not str:
                raise ValueError(f"selection[{ordinal}].{key} must be a string")
            if not value or value.strip() != value:
                raise ValueError(
                    f"selection[{ordinal}].{key} must be non-empty and unpadded"
                )

        identity = (pdb_id, auth_chain)
        if identity in seen:
            raise ValueError(
                "duplicate selection identity: "
                f"pdbId={pdb_id!r}, authChain={auth_chain!r}"
            )
        seen.add(identity)
        validated.append((ordinal, pdb_id, auth_chain))

    return validated


@contextmanager
def _anchored_readonly_connection(db_path: str | Path):
    resolved = os.path.realpath(os.fspath(db_path))
    if not os.path.isfile(resolved):
        raise ValueError("database input must resolve to a regular file")
    helper = _load_safe_helper(DEFAULT_SAFE_HELPER_PATH)
    handle = helper.open_database_source_anchored(
        os.path.dirname(resolved),
        [os.path.basename(resolved)],
        max_bytes=MAX_DATABASE_INPUT_BYTES,
    )
    connection = None
    transaction_open = False
    try:
        connection = duckdb.connect(handle["fdPath"], read_only=True)
        connection.execute("BEGIN TRANSACTION")
        transaction_open = True
        yield connection
        connection.execute("ROLLBACK")
        transaction_open = False
        connection.close()
        connection = None
        helper.close_database_source_anchored(handle, expected_record=handle["record"])
        handle = None
    finally:
        if connection is not None:
            try:
                if transaction_open:
                    connection.execute("ROLLBACK")
            finally:
                connection.close()
        if handle is not None:
            helper.close_database_source_anchored(handle, expected_record=handle["record"])


def extract_rows(db_path: str | Path, selections: Any) -> list[dict[str, Any]]:
    """Return profile rows for exact selected PDB/auth-chain identities."""
    selected_rows = _validate_selections(selections)
    with _anchored_readonly_connection(db_path) as con:
        con.execute(
            """
            CREATE TEMP TABLE selected_chains (
                ordinal BIGINT NOT NULL,
                pdb_id VARCHAR NOT NULL,
                auth_chain VARCHAR NOT NULL
            )
            """
        )
        if selected_rows:
            con.executemany(
                "INSERT INTO selected_chains VALUES (?, ?, ?)", selected_rows
            )

        chain_counts = con.execute(
            """
            SELECT s.ordinal,
                   s.pdb_id,
                   s.auth_chain,
                   COUNT(c.pdb_id) AS chain_count
            FROM selected_chains s
            LEFT JOIN chain c
              ON c.pdb_id = s.pdb_id AND c.auth = s.auth_chain
            GROUP BY s.ordinal, s.pdb_id, s.auth_chain
            ORDER BY s.ordinal
            """
        ).fetchall()
        for ordinal, pdb_id, auth_chain, chain_count in chain_counts:
            if chain_count == 0:
                raise ValueError(
                    f"selection[{ordinal}] chain is missing: "
                    f"pdbId={pdb_id!r}, authChain={auth_chain!r}"
                )
            if chain_count != 1:
                raise ValueError(
                    f"selection[{ordinal}] chain is duplicated in database: "
                    f"pdbId={pdb_id!r}, authChain={auth_chain!r}, "
                    f"count={chain_count}"
                )

        result_rows = con.execute(
            """
            SELECT s.ordinal,
                   p.pdb_id,
                   c.auth,
                   p.chain_key,
                   p.profile_key,
                   p.tech_filter,
                   p.is_background_channel
            FROM selected_chains s
            JOIN chain c ON c.pdb_id = s.pdb_id AND c.auth = s.auth_chain
            JOIN profile p ON p.pdb_id = c.pdb_id AND p.chain_key = c.chain_key
            ORDER BY s.ordinal, p.profile_key
            """
        ).fetchall()

    return [dict(zip(OUTPUT_KEYS, row)) for row in result_rows]


def _extract_chain_rows(
    connection: duckdb.DuckDBPyConnection,
    pdb_id: str,
    auth_chain: str,
) -> Iterator[dict[str, Any]]:
    selected = _validate_selections([{"pdbId": pdb_id, "authChain": auth_chain}])
    _, pdb_id, auth_chain = selected[0]
    chain_count = connection.execute(
        "SELECT COUNT(*) FROM chain WHERE pdb_id = ? AND auth = ?",
        [pdb_id, auth_chain],
    ).fetchone()[0]
    if chain_count != 1:
        raise ValueError(
            "selection[0] requires exactly one database chain: "
            f"pdbId={pdb_id!r}, authChain={auth_chain!r}, count={chain_count}"
        )
    cursor = connection.execute(
        """
        SELECT p.pdb_id,
               c.auth,
               p.chain_key,
               p.profile_key,
               p.tech_filter,
               p.is_background_channel
        FROM chain c
        JOIN profile p
          ON p.pdb_id = c.pdb_id AND p.chain_key = c.chain_key
        WHERE c.pdb_id = ? AND c.auth = ?
        ORDER BY p.profile_key
        """,
        [pdb_id, auth_chain],
    )
    while True:
        rows = cursor.fetchmany(1024)
        if not rows:
            return
        for row in rows:
            yield dict(zip(OUTPUT_KEYS, (0, *row)))


def _iter_global_technique_summary(
    db_path: str | Path,
) -> Iterator[dict[str, Any]]:
    """Stream raw whole-DB technique groups without classifying them."""
    with _anchored_readonly_connection(db_path) as con:
        yield from _iter_global_technique_summary_connection(con)


def _iter_global_technique_summary_connection(
    con: duckdb.DuckDBPyConnection,
) -> Iterator[dict[str, Any]]:
    """Stream raw whole-DB technique groups through one caller-owned connection."""
    try:
        duplicate_auth = con.execute(
            """
            SELECT pdb_id, auth, COUNT(*) AS chain_count
            FROM chain
            GROUP BY pdb_id, auth
            HAVING COUNT(*) <> 1
            ORDER BY pdb_id, auth
            LIMIT 1
            """
        ).fetchone()
        if duplicate_auth is not None:
            pdb_id, auth_chain, chain_count = duplicate_auth
            raise ValueError(
                "global summary requires unique database chain identity: "
                f"pdbId={pdb_id!r}, authChain={auth_chain!r}, "
                f"count={chain_count}"
            )

        ambiguous_chain_key = con.execute(
            """
            WITH profile_chain_keys AS (
                SELECT DISTINCT pdb_id, chain_key FROM profile
            ), chain_key_counts AS (
                SELECT pdb_id, chain_key, COUNT(*) AS chain_count
                FROM chain
                GROUP BY pdb_id, chain_key
            )
            SELECT p.pdb_id,
                   p.chain_key,
                   COALESCE(c.chain_count, 0) AS chain_count
            FROM profile_chain_keys p
            LEFT JOIN chain_key_counts c
              ON c.pdb_id = p.pdb_id AND c.chain_key = p.chain_key
            WHERE COALESCE(c.chain_count, 0) <> 1
            ORDER BY p.pdb_id, p.chain_key
            LIMIT 1
            """
        ).fetchone()
        if ambiguous_chain_key is not None:
            pdb_id, chain_key, chain_count = ambiguous_chain_key
            raise ValueError(
                "global summary requires each profile chain_key to resolve once: "
                f"pdbId={pdb_id!r}, chainKey={chain_key!r}, "
                f"count={chain_count}"
            )

        cursor = con.execute(
            """
            SELECT p.pdb_id,
                   c.auth,
                   p.tech_filter,
                   p.is_background_channel,
                   COUNT(*) AS profile_count
            FROM profile p
            JOIN chain c
              ON c.pdb_id = p.pdb_id AND c.chain_key = p.chain_key
            GROUP BY p.pdb_id,
                     c.auth,
                     p.tech_filter,
                     p.is_background_channel
            ORDER BY p.pdb_id,
                     c.auth,
                     CASE WHEN p.tech_filter IS NULL THEN 0 ELSE 1 END,
                     p.tech_filter,
                     CASE
                       WHEN p.is_background_channel IS NULL THEN 0
                       WHEN p.is_background_channel = FALSE THEN 1
                       ELSE 2
                     END
            """
        )
        while True:
            result_rows = cursor.fetchmany(1024)
            if not result_rows:
                break
            for row in result_rows:
                yield dict(zip(GLOBAL_SUMMARY_KEYS, row))
    except duckdb.Error:
        raise


def extract_global_technique_summary(
    db_path: str | Path,
) -> list[dict[str, Any]]:
    """Return raw whole-DB technique groups for library callers and tests."""
    return list(_iter_global_technique_summary(db_path))


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result


def _load_safe_helper(helper_path: str):
    resolved = os.path.realpath(helper_path)
    if resolved != helper_path or not os.path.isfile(resolved):
        raise ValueError("safe-openat helper must be a canonical regular file")
    spec = importlib.util.spec_from_file_location("case_public_safe_openat", resolved)
    if spec is None or spec.loader is None:
        raise ValueError("cannot load safe-openat helper")
    helper = importlib.util.module_from_spec(spec)
    previous_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(helper)
    finally:
        sys.dont_write_bytecode = previous_dont_write_bytecode
    return helper


def _write_broker_frame(frame: dict[str, Any]) -> None:
    encoded = json.dumps(
        frame,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )
    sys.stdout.write(encoded + "\n")
    sys.stdout.flush()


def _read_broker_request() -> dict[str, Any] | None:
    raw = sys.stdin.buffer.readline(MAX_BROKER_REQUEST_BYTES + 1)
    if raw == b"":
        return None
    if len(raw) > MAX_BROKER_REQUEST_BYTES or not raw.endswith(b"\n"):
        raise ValueError("database broker request exceeds its line contract")
    return json.loads(raw, object_pairs_hook=_unique_object)


def _serve_anchored_database(
    db_path: str,
    helper_path: str,
    max_db_bytes: int,
) -> None:
    if os.path.realpath(db_path) != db_path or not os.path.isfile(db_path):
        raise ValueError("database input must be a canonical regular file")
    if isinstance(max_db_bytes, bool) or max_db_bytes <= 0:
        raise ValueError("database max bytes must be positive")
    helper = _load_safe_helper(helper_path)
    handle = helper.open_database_source_anchored(
        os.path.dirname(db_path),
        [os.path.basename(db_path)],
        max_bytes=max_db_bytes,
    )
    connection = None
    transaction_open = False
    source_closed = False
    try:
        connection = duckdb.connect(handle["fdPath"], read_only=True)
        connection.execute("BEGIN TRANSACTION")
        transaction_open = True
        _write_broker_frame({
            "type": "ready",
            "sourceRecord": handle["record"],
            "strategy": "anchored-fd-readonly-transaction",
        })
        while True:
            request = _read_broker_request()
            if request is None:
                raise ValueError("database broker stdin closed before close request")
            if type(request) is not dict:
                raise ValueError("database broker request must be an object")
            operation = request.get("operation")
            request_id = request.get("id")
            if type(request_id) is not int or isinstance(request_id, bool) or request_id < 1:
                raise ValueError("database broker request id must be a positive integer")
            if operation == "global":
                if set(request) != {"id", "operation"}:
                    raise ValueError("global broker request fields differ")
                rows = _iter_global_technique_summary_connection(connection)
                max_output_bytes = MAX_GLOBAL_SUMMARY_STDOUT_BYTES
            elif operation == "chain":
                if set(request) != {"id", "operation", "pdbId", "authChain"}:
                    raise ValueError("chain broker request fields differ")
                rows = _extract_chain_rows(
                    connection,
                    request["pdbId"],
                    request["authChain"],
                )
                max_output_bytes = MAX_SELECTION_STDOUT_BYTES
            elif operation == "close":
                if set(request) != {"id", "operation"}:
                    raise ValueError("close broker request fields differ")
                connection.execute("ROLLBACK")
                transaction_open = False
                connection.close()
                connection = None
                source_closed = True
                final_record = helper.close_database_source_anchored(
                    handle,
                    expected_record=handle["record"],
                )
                _write_broker_frame({
                    "id": request_id,
                    "type": "closed",
                    "sourceRecord": final_record,
                })
                return
            else:
                raise ValueError("database broker operation is invalid")

            output_size = 0
            count = 0
            for row in rows:
                row_size = len((json.dumps(
                    row,
                    ensure_ascii=False,
                    allow_nan=False,
                    separators=(",", ":"),
                ) + "\n").encode("utf-8"))
                output_size += row_size
                if output_size > max_output_bytes:
                    raise ValueError(
                        f"database broker response exceeds {max_output_bytes} bytes"
                    )
                _write_broker_frame({"id": request_id, "type": "row", "row": row})
                count += 1
            _write_broker_frame({"id": request_id, "type": "end", "count": count})
    finally:
        if connection is not None:
            try:
                if transaction_open:
                    connection.execute("ROLLBACK")
            finally:
                connection.close()
        if not source_closed:
            helper.close_database_source_anchored(
                handle,
                expected_record=handle["record"],
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract exact Case profile technique metadata as NDJSON."
    )
    parser.add_argument("--db", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--selection-json")
    mode.add_argument("--global-summary", action="store_true")
    mode.add_argument("--serve-anchored", action="store_true")
    parser.add_argument("--safe-helper")
    parser.add_argument("--max-db-bytes", type=int)
    args = parser.parse_args(argv)

    try:
        if args.serve_anchored:
            if args.safe_helper is None or args.max_db_bytes is None:
                raise ValueError("anchored broker requires --safe-helper and --max-db-bytes")
            _serve_anchored_database(args.db, args.safe_helper, args.max_db_bytes)
            return 0
        if args.safe_helper is not None or args.max_db_bytes is not None:
            raise ValueError("safe helper arguments are valid only for anchored broker mode")
        if args.global_summary:
            rows = _iter_global_technique_summary(args.db)
        else:
            with Path(args.selection_json).open(encoding="utf-8") as handle:
                selections = json.load(handle, object_pairs_hook=_unique_object)
            rows = extract_rows(args.db, selections)
        max_stdout_bytes = (
            MAX_GLOBAL_SUMMARY_STDOUT_BYTES
            if args.global_summary
            else MAX_SELECTION_STDOUT_BYTES
        )
        output_size = 0
        with tempfile.TemporaryFile() as buffered_output:
            for row in rows:
                encoded = (
                    json.dumps(
                        row,
                        ensure_ascii=False,
                        allow_nan=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                ).encode("utf-8")
                output_size += len(encoded)
                if output_size > max_stdout_bytes:
                    raise ValueError(
                        "extractor output exceeds bounded stdout contract: "
                        f"{max_stdout_bytes} bytes"
                    )
                buffered_output.write(encoded)
            buffered_output.seek(0)
            while True:
                chunk = buffered_output.read(1024 * 1024)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
    except (OSError, TypeError, ValueError, json.JSONDecodeError, duckdb.Error) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
