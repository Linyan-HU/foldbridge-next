"""构建 EF 产物索引: 扫线上 tianyi 全部 browser-manifest.json, 产出每 chain 有无 E/F 产物.

产物落地事实只在文件系统(线上 manifest), 不在任何 DB. 这是 entry 表判定
"该 chain 行内给不给 E/F 链接" 的唯一权威源 —— 按有无产物, 不按 tech_filter 文本
(文本会造 5400+6700 死链, 见 docs/entry-ef-dual-link-plan-20260826.md).

判定:
  E 产物 = manifest chains.<auth>.efMatrixPath 存在
  F 产物 = manifest chains.<auth>.efMatrixPathF 存在
key = "<pdb_id>|<auth>" (与 entry-table.json row.pdb_id|row.auth 一致).

fail-loud: manifest 读不了即计入 errors 并在末尾非零退出(不静默跳过坏 manifest).

用法:
    python scripts/build-ef-product-index.py \
        --live /Volumes/tianyi/Server/public/entry-cases/cases \
        --out src/assets/generated/entry-table/ef-product-index.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def build_index(live_root: str, out_path: str) -> tuple[int, int, int]:
    live = Path(live_root)
    if not live.is_dir():
        raise NotADirectoryError(f"线上 cases 根目录不存在: {live}")

    e_keys: set[str] = set()
    f_keys: set[str] = set()
    errors: list[str] = []
    n_mf = 0

    for mfp in sorted(live.glob("*/browser-manifest.json")):
        pdb = mfp.parent.name
        n_mf += 1
        try:
            mf = json.loads(mfp.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{pdb}: {type(e).__name__}: {e}")
            continue
        for auth, ch in (mf.get("chains") or {}).items():
            key = f"{pdb}|{auth}"
            if ch.get("efMatrixPath"):
                e_keys.add(key)
            if ch.get("efMatrixPathF"):
                f_keys.add(key)

    if errors:
        print(f"[ERR] {len(errors)} 个 manifest 读取失败:", file=sys.stderr)
        for s in errors[:25]:
            print("  " + s, file=sys.stderr)
        raise RuntimeError(f"{len(errors)} 个 manifest 坏 — 中止, 不产出半份索引")

    payload = {
        "schemaVersion": "ef-product-index.v1",
        "source": "live tianyi browser-manifest.json (efMatrixPath / efMatrixPathF)",
        "grain": "pdb_id|auth",
        "eCount": len(e_keys),
        "fCount": len(f_keys),
        "E": sorted(e_keys),
        "F": sorted(f_keys),
    }
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return n_mf, len(e_keys), len(f_keys)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build EF product index from live manifests.")
    ap.add_argument("--live", default="/Volumes/tianyi/Server/public/entry-cases/cases")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    n_mf, ne, nf = build_index(args.live, args.out)
    print(f"manifest 扫描={n_mf}  E产物chain={ne}  F产物chain={nf}  -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
