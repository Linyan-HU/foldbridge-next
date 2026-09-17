"""Offline 3D snapshot of 1OB5 chain F (tRNA-Phe): one filled 5-membered ribose
ring per residue, colored by real reactivity using the home-scroll-story
single-source color scale. A thin neutral backbone trace (through C1') keeps the
classic tRNA L-shape readable. Uncovered residues (no reactivity datum) -> neutral
grey. Real cif coordinates only; no fabricated values or geometry.
"""
import json
import os
import warnings
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
from mpl_toolkits.mplot3d import art3d
from Bio.PDB import MMCIFParser

warnings.simplefilter("ignore")

STOPS = [(23, 75, 58), (230, 194, 96), (232, 116, 62)]  # #174B3A / #E6C260 / #E8743E
NEUTRAL = (233 / 255, 237 / 255, 234 / 255)  # #E9EDEA
RING_ATOMS = ["C1'", "C2'", "C3'", "C4'", "O4'"]  # furanose connectivity order
OUT = "src/assets/generated/home-scroll-story/1ob5-3d.png"


def color(t):
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        lo, hi, f = STOPS[0], STOPS[1], t / 0.5
    else:
        lo, hi, f = STOPS[1], STOPS[2], (t - 0.5) / 0.5
    return tuple((lo[i] + (hi[i] - lo[i]) * f) / 255 for i in range(3))


def load_reactivity():
    story = json.load(open(
        "src/assets/generated/home-scroll-story/story.json"))["cases"][0]
    by_pos = {p: r for p, r in zip(story["positions"], story["reactivity"])}
    return by_pos, story["norm_ceiling"]


def extract_rings(cif_path, react_by_pos=None):
    """Pure: return [{"num": int, "ring": ndarray(5,3), "datum": float|None}, ...]
    for every standard chain-F residue carrying all five ribose ring atoms.
    `datum` is the raw reactivity for that PDB residue number, else None."""
    react_by_pos = react_by_pos or {}
    parser = MMCIFParser(QUIET=True)
    structure = parser.get_structure("1ob5", cif_path)
    chF = structure[0]["F"]
    rings = []
    for res in chF:
        if res.id[0] != " ":
            continue
        if not all(a in res for a in RING_ATOMS):
            continue
        num = res.id[1]
        verts = np.array([res[a].coord for a in RING_ATOMS], dtype=float)
        rings.append({"num": num, "ring": verts,
                      "datum": react_by_pos.get(num)})
    return rings


def main():
    react_by_pos, ceiling = load_reactivity()
    rings = extract_rings("/tmp/1ob5.cif", react_by_pos)

    # PCA on the full vertex cloud so the two longest principal axes (the tRNA L
    # arms) lie in the viewing plane -> classic L-shape from a fixed camera.
    cloud = np.vstack([r["ring"] for r in rings])
    center = cloud.mean(axis=0)
    _, _, vt = np.linalg.svd(cloud - center, full_matrices=False)

    def project(pts):
        return (pts - center) @ vt.T

    polys, facecolors, backbone, colored = [], [], [], 0
    for r in rings:
        ring3 = project(r["ring"])
        polys.append(ring3)
        backbone.append(ring3[0])  # C1' (index 0) for the backbone trace
        if r["datum"] is not None:
            facecolors.append(color(max(0.0, min(1.0, (r["datum"] or 0) / ceiling))))
            colored += 1
        else:
            facecolors.append(NEUTRAL)
    backbone = np.array(backbone)
    allv = np.vstack(polys)

    fig = plt.figure(figsize=(5.2, 5.6), dpi=150)
    ax = fig.add_subplot(111, projection="3d")
    ax.plot(backbone[:, 0], backbone[:, 1], backbone[:, 2],
            color="#9FB0A6", lw=1.2, alpha=0.6, zorder=1)
    coll = art3d.Poly3DCollection(
        polys, facecolors=facecolors, edgecolors="white",
        linewidths=0.5, alpha=0.92)
    coll.set_zorder(2)
    ax.add_collection3d(coll)

    # Equalize aspect, clean transparent frame.
    xs, ys, zs = allv[:, 0], allv[:, 1], allv[:, 2]
    max_range = np.array([xs.max() - xs.min(), ys.max() - ys.min(),
                          zs.max() - zs.min()]).max() / 2.0
    mid = [(xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2,
           (zs.max() + zs.min()) / 2]
    ax.set_xlim(mid[0] - max_range, mid[0] + max_range)
    ax.set_ylim(mid[1] - max_range, mid[1] + max_range)
    ax.set_zlim(mid[2] - max_range, mid[2] + max_range)
    ax.view_init(elev=90, azim=-90)
    ax.set_axis_off()
    fig.patch.set_alpha(0)
    ax.patch.set_alpha(0)
    fig.tight_layout(pad=0)
    fig.savefig(OUT, transparent=True, bbox_inches="tight", pad_inches=0.1)
    print("wrote", OUT, "| rings:", len(rings), "| colored:", colored)


if __name__ == "__main__":
    main()
