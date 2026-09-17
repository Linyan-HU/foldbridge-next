"""导出 entry 浏览入口表：chain 表（pdb×chain，一行一链）→ 前端可读 JSON。

入口页只做浏览 + 跳转：每行携带 pdb_id + auth（+ chain_key），前端按
base + pdb + chain 拼 case page 链接（URL 规则占位，上线后填）。

用法：
    python scripts/build-entry-table.py \
        --db /Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
        --out src/assets/generated/entry-table/entry-table.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb

# chain 表 → 前端行契约（列序锁死）。auth = case page chain 参数；chain_key
# 保留 label[auth] 权威键以备后用。
ROW_COLUMNS = [
    "pdb_id",
    "auth",
    "chain_key",
    "sci_name",
    "partition",
    "n_profiles",
    "entry_confidence_class",
    "probing_category",
    "tech_filter",
    "source_lanes",
    "has_geo",
]


def build_entry_table(db_path: str, out_path: str) -> int:
    """读 chain 表全部行，写 {rows:[...]} JSON，返回行数。"""
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = ", ".join(f'"{c}"' for c in ROW_COLUMNS)
        cur = con.execute(
            f'SELECT {cols} FROM chain ORDER BY pdb_id, chain_key'
        )
        rows = [dict(zip(ROW_COLUMNS, r)) for r in cur.fetchall()]
    finally:
        con.close()

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": "entry-table.v1",
        "grain": "pdb_id x chain",
        "rowCount": len(rows),
        "rows": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return len(rows)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build entry browse-table JSON.")
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    n = build_entry_table(args.db, args.out)
    print(f"rows\t{n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
