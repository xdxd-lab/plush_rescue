# Kenney 圖集來源與可攜重建

本文件及後續修訂請使用正體中文與臺灣常用語氣；指令、路徑與技術名稱保留原文。

`sources/` 保存 18 張經核對的 256×256 RGBA 圖片，作為 `reference/particles.png` 的輸入。這些是從本機保留的 Kenney 素材包選出、縮製的候選圖，**不是上游原始解析度的檔案**。`reference/particles.json` 記錄輸出、格子順序、SHA 與生成版本。每張輸入的名稱、bytes、SHA-256 與尺寸都符合 [materials-selection.json](../../docs/materials-selection.json)；三份 `License.txt` 也與記錄及 `docs/licenses/` 的公開副本相符。獨立安全副本另行保存，本目錄的版本化來源可供搬移復原。

安裝 Pillow 後，在儲存庫根目錄執行：

```sh
python3 tools/atlas/rebuild.py --output-dir /tmp/plush-atlas-rebuilt
```

實測工具為 Python 3.12.14／Pillow 13.0.0。`--source-root` 可指向另一份具有相同三個素材包目錄的副本。工具拒絕覆寫既有輸出，也拒絕寫入來源或參考目錄；它會核對來源與授權 SHA、順序、格子座標及六位小數的圖片空間 UV。必要校驗使用明確錯誤判斷，一般模式與 `python -O` 均會執行。

重建會對**整張** 2048×1024 圖集逐一比較 RGBA bytes，包含透明像素的 RGB 與 padding。Pillow 13.0.0 的輸出 PNG bytes 也相同，SHA-256 為 `ca39797b59dd36bb3f7fac4a49d44ce119849ed129f9bb8a3734c034e9addf07`。其他編碼器可能在像素相同時產生不同 PNG bytes，兩者應分開記錄。

圖集使用 256px 內容格、2px inset、260px pitch、7 欄（2048 // 260），18 格依選材清單排序。UV 以圖片左上角為原點；Three.js 使用 `flipY=true` 時換算為 `v_gl=1-v`。`shape_a` 是實心光斑，不能當成 `circle_05` 的柔暈；也不能將圖集裁格冒充原始輸入來源。

來源為 Kenney Particle Pack、Light Masks 與 Smoke Particles，依本目錄保存的包內 CC0 授權文字記錄。Particle Pack 包內標示 1.1，先前官網更新標籤記錄為 1.0；此次無法重新開啟官方素材頁，不宣稱已重新線上核實，來源依既有 S1 與相符的包內授權交叉核對。專案與角色的商用權利另由 S2 處理。

生成 metadata 的 `source_selection_sha256` 記錄該次實際讀取的選材 JSON。後續稽核文字更新可能改變此檔案的 SHA，而不改變圖片或 UV；應保留 metadata 的生成快照，不回填改寫舊 SHA。
