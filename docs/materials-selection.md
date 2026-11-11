# 素材選用與來源核對（S1）

S1 選材基準核對日期：2026-11-11。以下選材與來源段落記錄當時的快照；當時尚未接入 runtime。2026-11-12 的 R4 重建與 V2 命中閃光試點另見文末更新，不能把歷史狀態當成目前狀態。

## 選用決策

- 選擇既有 18 格 atlas 作為 V2 首批候選：Particle Pack 12 格、Light Masks 5 格、Smoke Particles 1 格。圖集 2048×1024，內容單格 256×256，保留現有 padding 與 UV。
- 15 張 final256 是另一份挑選清單（415,667 bytes），不是 atlas 全部來源；circle_05、trace_07、smoke_04 未進 atlas，另以 shape_a、cone_c_blur、whitePuff05 等補充用途。
- CGHEVEN 的早期推薦已由後續授權矛盾判斷取代，不採用；其他付費或未核對候選不納入本方案。
- 已核對實際 PNG、尺寸、SHA-256、圖集欄位和三份授權。S1 當時未重建 atlas 作逐像素比對；R4 於 2026-11-12 完成新的獨立重建驗證，詳見文末。

## 來源與授權

官方素材頁與三份包內授權標示 CC0；保留來源及授權文字供後續核對。[Kenney 官方說明](https://kenney.nl/support)與[CC0 說明](https://creativecommons.org/publicdomain/zero/1.0/)可查使用條件。本紀錄不代替整個專案 LICENSE、角色名稱或其他 IP 決策（S2）。

| 素材包 | 包內版本 | 官方來源 | 保留的授權檔 |
|---|---|---|---|
| Particle Pack | 1.1 | [素材頁](https://kenney.nl/assets/particle-pack) | [授權文字](licenses/Kenney-particle-pack.txt) |
| Light Masks | 1.0 | [素材頁](https://kenney.nl/assets/light-masks) | [授權文字](licenses/Kenney-light-masks.txt) |
| Smoke Particles | 1.0 | [素材頁](https://kenney.nl/assets/smoke-particles) | [授權文字](licenses/Kenney-smoke-particles.txt) |

Particle Pack 包內寫 1.1，官方更新欄目前僅列 1.0／2018；兩者版本標記不同，未宣稱本輪檔案與官網下載包逐位元一致。Smoke Particles 官方頁直接讀取受限，本輪改以官方搜尋摘要與包內授權交叉參照。

## 最終候選清單

| 名稱 | 預定用途 | 混合 |
|---|---|---|
| shape_a | 光彈形狀／實心光斑，柔暈需另選 | additive |
| trace_06 | 光彈光尾 | additive |
| circle_02 | 預警細環／按下擴散圈 | additive |
| circle_03 | 預警外框／衝擊波 | additive |
| ring_b | 雙線預警環 | additive |
| circle_rings_b | 衝擊波／升級多層環 | additive |
| cone_c_blur | 雙手砲光束／光柱 | additive |
| muzzle_02 | 火焰噴射 | additive |
| muzzle_05 | 砲口火光 | additive |
| star_06 | 命中飛散／拾取星光 | additive |
| star_08 | 冰霜結晶 | additive |
| star_09 | 命中核心／救援光暈 | additive |
| shape_g | 四芒星閃光 | additive |
| magic_03 | 升級光圈 | additive |
| light_01 | 大範圍外暈／靈氣 | additive |
| symbol_01 | 愛心 | normal |
| symbol_02 | 星星 | normal |
| whitePuff05 | 棉絮／軟煙 | normal |

PNG 的尺寸、bytes／SHA-256、來源包、atlas 位置與 UV、授權檔雜湊見 [materials-selection.json](materials-selection.json)。該檔已移除本機暫存絕對路徑。

本輪也實看接觸表與圖集：shape_a 較接近實心圓，circle_05 的外緣較柔，兩者不應直接當成相同光彈核心；circle_05 保留在 15 張來源清單作柔暈備選。候選表的用途仍需 V2 在實景確認，特別留意火焰／棉絮的遮擋與愛心／星星的 normal 混合。

## V2 接入驗收邊界

接入時才加入 runtime manifest，檢查透明邊緣、UV 翻轉／滲色、明暗地圖、低畫質、減少動態、fallback、遮擋與渲染成本。選材、授權保存或圖集存在，都不等於特效已發布。

## 2026-11-12 R4／V2 有界更新

已將 18 張選用的 256px 縮製候選 PNG（不是上游原始解析度）、三份包內授權及參考 atlas 保存在
[`tools/atlas/`](../tools/atlas/README.md)，並以可攜腳本從來源重建。
來源 SHA、完整 2048×1024 RGBA（含透明 padding）與既有圖逐一相同；
Python 3.12.14／Pillow 13.0.0 的 PNG 位元組也相同。獨立測試在另一個可攜目錄，以一般模式及 `python -O`、明確與預設來源各重建一次，共四張輸出完全吻合；14 項拒絕案例涵蓋覆寫、來源／授權／尺寸／UV／參考圖及 alpha=0 的 RGB 差異，均非零退出且不印 PASS。來源及參考檔前後未改，獨立安全副本另行保存。

V2 目前只將 `star_09` 用於主武器命中 flash 的 atlas 試點。
等待、載入失敗及尺寸無效時保留原 CanvasTexture 效果；trail、puff、
核心玩法和 RNG 均未調整。其餘 17 格仍是已保存候選，未接入視覺。
實景明暗、遮擋、窄視窗與效能證據仍待獨立瀏覽器驗證。
