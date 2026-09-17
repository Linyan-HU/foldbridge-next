# Home Scroll Story 资产

主页招牌滚动叙事的策展数据 + 预渲染快照。生成产物入 git。

## 反应性色标（单一权威）
低 0 = 冷绿 #174B3A → 中 0.5 = 金 #E6C260 → 高 1 = 暖橙 #E8743E。
1D 实时着色（src/siteChrome.js:reactivityColor）、2D VARNA SVG、3D matplotlib PNG **必须**用这同一组三档锚点（RGB 23,75,58 / 230,194,96 / 232,116,62）。
归一化：norm = max(0, min(1, reactivityValue / norm_ceiling))，norm_ceiling 见 story.json（本案例 P95，负值钳到 0、离群高值钳到 1）。
**无反应性数据的残基不得着色**——2D/3D 一律用中性灰 #E9EDEA 占位，绝不用色标外推（数据诚实，spec §3）。

## 重生成步骤（手动一次性策展）

### 1. story.json（反应性 + 序列 + 坐标）
从 `src/assets/generated/annojoin-atlas-rmdb/cases/RMDB2PDB%3A<PDB>.json` 的 `visualPreview.reactivity1d.points` 提取：sequence=rmdbBase / reactivity=reactivityValue 原值 / positions=rmdbPosition；由于展示对象是 RNA，sequence 中的 `T` 必须规范化为 `U`，以与 VARNA 二级结构序列一致。norm_ceiling=reactivity 的 P95（截断不低于 1.0）。

### 2. paired_state 回填（来自真实 dbn）
离线 dbn：`/Volumes/tianyi/tmp/rmdb2pdb_symlinked_assets_20260622/task_packages/confidence_v3_restart_20260613/remote_root/ANNOJOIN/2d_asset_build_20260618/dbn/<pdb_lower>.dbn`。
取与本案例链对应的 strand（1OB5 用 strand_F）的 dot-bracket，按 base 一致性求 dbn↔story 偏移（1OB5 实测 offset=+10，38/38 碱基 100% 吻合：story 前 10 个残基是 5' leader，落在折叠 tRNA 之外 → unpaired；其余逐位映射）。`()[]{}<>` = paired，`.-_:,` 及 leader 外区 = unpaired。写回 story.json `paired_state`（与 sequence 等长）。

### 3. <pdb>-2d.svg（VARNA 二级结构，反应性着色）
VARNA jar 在姊妹仓库 `~/docs/rmdb2pdb/tools/varna/VARNAv3-93.jar`（foldbridge 仓库本身无此目录；需本机 java）。
用**完整链** dot-bracket（76 nt）+ 序列绘制完整三叶草拓扑；逐残基用 `-basesStyleN fill=<hex>,outline=#FFFFFF` + `-applyBasesStyleNon <residue,list>` 精确着色（按上述色标对有反应性的残基着色，无数据残基 → #E9EDEA）。导出 SVG 后**手动补 viewBox**（VARNA 默认输出 `width="100%" height="100%"` 无 viewBox，`<img>` 嵌入会塌缩）：扫描所有 x/y 坐标求 bbox，加 20px padding 写回 `<svg width height viewBox>`。
命令模式：
```
java -Djava.awt.headless=true -cp <varna.jar> fr.orsay.lri.varna.applications.VARNAcmd \
  -sequenceDBN <FULL_RNA> -structureDBN <FULL_DOTBRACKET> \
  -resolution 3.0 -bp '#9FB0A6' -spaceBetweenBases 0.9 \
  -basesStyle1 'fill=#174B3A,outline=#FFFFFF' -applyBasesStyle1on '<positions>' ... \
  -o <pdb>-2d.svg
```

### 4. <pdb>-3d.png（三级结构 L-形，反应性着色）
**无 molstar 离线渲染器可用**——改用 biopython + matplotlib（本机均有：biopython 1.85 / matplotlib 3.10）。
真实坐标 cif：`/Volumes/tianyi/.../remote_root/10_structure_context/alpha_full_20260615/mmcif_inputs_from_132/<pdb_lower>.cif`（拷到 /tmp 用）。
脚本逻辑（参考本次所用 `/tmp/render_1ob5_3d.py`）：MMCIFParser 读目标链（1OB5 用 chain F，62 个解析残基，含 5MC/7MG/H2U/YG 等修饰碱基）→ 取每残基 C1' 坐标连线作 backbone trace → 按 PDB residue number 映射 story 反应性着色（无数据残基 #E9EDEA）→ 对坐标做 PCA（SVD），把两条最长主轴（tRNA 两臂）摆进观察平面，`view_init(elev=90, azim=-90)` 俯视 PC3 轴 → L-形清晰可辨 → 透明背景存 PNG。

## 验证
重生成后 `npm test` 须保持全绿；本地预览 `#home` 下滑确认 1D 碱基格 → 2D 三叶草 → 3D L-形同一残基颜色三态视觉连续（核心成功标准）。
