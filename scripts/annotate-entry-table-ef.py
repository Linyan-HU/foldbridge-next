"""就地给 entry-table.json 每行加 has_ef_e/has_ef_f —— 无损更新, 不重建.

为什么不改 build-entry-table.py 从 DB 重建:
  - 现有 entry-table.json = DB 基础列 + 事后单独注入的 tech_filter(commit 1d4f427e9b).
  - 当前 DB 的 chain 表【没有 tech_filter 列】, 从 DB 重建会丢掉 tech_filter, 破坏现状.
  - 用户要"无损更新 entry": 只加两个布尔字段, 其余逐行逐字段原样保留.

判定源 = ef-product-index.json(build-ef-product-index.py 扫线上 manifest 产出),
key = pdb_id|auth. 按有无产物判定, 非 tech_filter 文本(文本会造 5400+6700 死链).

幂等: 重复跑结果一致(只覆盖这两个字段). fail-loud: 缺文件/字段即报错.

用法:
    python scripts/annotate-entry-table-ef.py \
        --table src/assets/generated/entry-table/entry-table.json \
        --ef-index src/assets/generated/entry-table/ef-product-index.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def annotate(table_path: str, ef_index_path: str) -> tuple[int, int, int]:
    tp = Path(table_path)
    ip = Path(ef_index_path)
    if not tp.exists():
        raise FileNotFoundError(f"entry 表不存在: {tp}")
    if not ip.exists():
        raise FileNotFoundError(f"ef 产物索引不存在: {ip}")

    table = json.loads(tp.read_text(encoding="utf-8"))
    idx = json.loads(ip.read_text(encoding="utf-8"))
    rows = table.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"{tp}: 无 rows 数组")

    ef_e = set(idx.get("E", []))
    ef_f = set(idx.get("F", []))
    if not ef_e and not ef_f:
        raise ValueError(f"{ip}: E/F 均空, 拒绝把整表 has_ef 清零")

    n_e = n_f = 0
    for row in rows:
        pdb = str(row.get("pdb_id", "")).strip()
        auth = str(row.get("auth", "")).strip()
        if not pdb or not auth:
            raise ValueError(f"行缺 pdb_id/auth: {row}")
        key = f"{pdb}|{auth}"
        he = key in ef_e
        hf = key in ef_f
        row["has_ef_e"] = he
        row["has_ef_f"] = hf
        n_e += he
        n_f += hf

    # 产物集里若有 key 在表中找不到行 → fail-loud(索引与表脱节)
    table_keys = {f"{r['pdb_id']}|{r['auth']}" for r in rows}
    orphan_e = ef_e - table_keys
    orphan_f = ef_f - table_keys
    if orphan_e or orphan_f:
        raise RuntimeError(
            f"产物集有 key 在 entry 表找不到行: E孤儿={len(orphan_e)} F孤儿={len(orphan_f)} "
            f"样本={sorted(orphan_e | orphan_f)[:5]}"
        )

    # 原样写回(保持 indent 与原文件一致: 原文件是紧凑单行, 沿用无缩进)
    tp.write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")
    return len(rows), n_e, n_f


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="就地给 entry-table.json 加 has_ef_e/has_ef_f")
    ap.add_argument("--table", required=True)
    ap.add_argument("--ef-index", required=True)
    args = ap.parse_args(argv)
    n, ne, nf = annotate(args.table, args.ef_index)
    print(f"标注完成: 行={n}  has_ef_e={ne}  has_ef_f={nf}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
