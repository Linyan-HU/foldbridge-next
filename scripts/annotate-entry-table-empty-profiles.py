"""就地给 entry-table.json 每行加 empty_profiles(bool) + empty_profile_type(str) —— 无损更新, 不重建.

为什么不改 build-entry-table.py 从 DB 重建:
  - 与 annotate-entry-table-ef.py 同理: 现有 entry-table.json = DB 基础列 + 事后注入的
    tech_filter / has_ef_e / has_ef_f. 从 DB 重建会丢掉这些事后列, 破坏现状.
  - 只加两个字段, 其余逐行逐字段原样保留.

判定源 = empty-profile-chains.json(LIVE shard 扫描产出: 每条链的所有 profile 在
render-strand 窗口内全空 —— 全 NaN 源 / 信号落在对齐窗口外). 口径 = 已部署 shard 的
窗口内数值, 非 n_profiles(如 8F0N/B n_profiles=2 但窗口内全空). key = pdb_id|auth.

empty_profile_type: 'all_NaN'(源头无数据) | 'window_empty'(有值但落链外/窗口内恒0).

幂等: 重复跑结果一致(只覆盖这两个字段). fail-loud: 缺文件/字段/孤儿 key 即报错.

用法:
    python scripts/annotate-entry-table-empty-profiles.py \
        --table src/assets/generated/entry-table/entry-table.json \
        --empty-index src/assets/generated/entry-table/empty-profile-chains.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def annotate(table_path: str, empty_index_path: str) -> tuple[int, int]:
    tp = Path(table_path)
    ip = Path(empty_index_path)
    if not tp.exists():
        raise FileNotFoundError(f"entry 表不存在: {tp}")
    if not ip.exists():
        raise FileNotFoundError(f"空 profile 索引不存在: {ip}")

    table = json.loads(tp.read_text(encoding="utf-8"))
    idx = json.loads(ip.read_text(encoding="utf-8"))
    rows = table.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"{tp}: 无 rows 数组")

    chains = idx.get("chains")
    if not isinstance(chains, list) or not chains:
        raise ValueError(f"{ip}: chains 空, 拒绝把整表 empty_profiles 清零")

    # key = pdb_id|auth -> empty_profile_type
    empty_map = {}
    for c in chains:
        pdb = str(c.get("pdb_id", "")).strip()
        auth = str(c.get("auth", "")).strip()
        typ = str(c.get("chain_type", "")).strip() or "window_empty"
        if not pdb or not auth:
            raise ValueError(f"空 profile 索引行缺 pdb_id/auth: {c}")
        empty_map[f"{pdb}|{auth}"] = typ

    n_flagged = 0
    for row in rows:
        pdb = str(row.get("pdb_id", "")).strip()
        auth = str(row.get("auth", "")).strip()
        if not pdb or not auth:
            raise ValueError(f"行缺 pdb_id/auth: {row}")
        key = f"{pdb}|{auth}"
        typ = empty_map.get(key)
        row["empty_profiles"] = typ is not None
        row["empty_profile_type"] = typ or ""
        if typ is not None:
            n_flagged += 1

    # 索引里若有 key 在表中找不到行 → fail-loud(索引与表脱节)
    table_keys = {f"{r['pdb_id']}|{r['auth']}" for r in rows}
    orphan = set(empty_map) - table_keys
    if orphan:
        raise RuntimeError(
            f"空 profile 索引有 key 在 entry 表找不到行: 孤儿={len(orphan)} "
            f"样本={sorted(orphan)[:5]}"
        )

    # 原样写回(保持原文件紧凑单行格式)
    tp.write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")
    return len(rows), n_flagged


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="就地给 entry-table.json 加 empty_profiles/empty_profile_type")
    ap.add_argument("--table", required=True)
    ap.add_argument("--empty-index", required=True)
    args = ap.parse_args(argv)
    n, nf = annotate(args.table, args.empty_index)
    print(f"标注完成: 行={n}  empty_profiles={nf}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
