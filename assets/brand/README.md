# 品牌素材（assets/brand）

本資料夾的圖片由兩張 AI 生成原圖衍生；原圖不放進儲存庫，以免拖慢下載。產生日期為 2026-10-29，由主代理以內建影像生成（imagegen built-in）產出，並經主代理目視審核。角色沿用遊戲中的兩位主角：布丁狗（奶黃垂耳、可可棕貝雷帽、圓框墨鏡）與北極熊（白色圓耳、冰藍圍巾、同款墨鏡）。

## 來源

| 原圖 | 尺寸 | SHA-256 | prompt 摘要 |
|---|---|---|---|
| App icon（`exec-a05f7395-….png`） | 1254×1254 PNG | `192cda38ad5c0c37da47bb992b66da87583e12b49d8a8a3d8d657bfcf1415ef9` | 布丁狗頭部特寫，深夜藍背景，身後金色光暈與星光 |
| 橫幅（`exec-723a4049-….png`） | 2172×724 PNG | `a3cfc1451ebd5d7663d8aa8a5413ff152100063a339a694ec3b656a0b4b42392` | 布丁狗與北極熊並肩、身旁救回的布偶朋友，背景是黎明的遊樂場，左側 PLUSH RESCUE 字樣 |

兩張圖的完整 prompt 與參考圖記在 [`PROMPTS.md`](PROMPTS.md)（不屬於遊戲執行檔，不列入 `runtime-manifest.json`）。

## 衍生檔案（macOS `sips` 縮放與轉檔）

| 檔案 | 來源 | 尺寸 | 用途 |
|---|---|---|---|
| `icon-16.png`、`icon-32.png`、`icon-192.png` | App icon | 16、32、192 px | 瀏覽器分頁 favicon |
| `apple-touch-icon.png` | App icon | 180 px | iOS 加到主畫面 |
| `brand-mark.png` | App icon | 64 px（顯示 20 px） | 開始與暫停畫面標籤內的小標記 |
| `banner.jpg` | 橫幅 | 1280×426，JPEG 品質 82 | `README.md` 首圖（不屬於遊戲執行檔） |
| `og-image.jpg` | 橫幅 | 1200×630，JPEG 品質 85，上下以 `#101A44` 補邊 | 社群分享預覽（`og:image`、`twitter:image`） |

除 `banner.jpg` 外，其餘檔案都列入 `runtime-manifest.json`。首次發布於 v12.3.3。

社群預覽的 `og:url` 與圖片網址以 GitHub Pages 為 canonical；Sites 版本共用同一份 `index.html`，兩站的分享預覽相同。

## 原圖核對與重製限制（2026-11-12）

S3 已實際找到兩張原圖，檔案大小、尺寸與上表 SHA-256 完全吻合；七張衍生圖的尺寸也已核對，其中六張 runtime 圖的大小與雜湊符合 manifest，`banner.jpg` 仍只供 README 使用。公開的檔案對照在 [`provenance.json`](provenance.json)，不包含私人儲存位置；原圖仍不放進儲存庫或 Sites 網站包。

目前可追溯「哪張原圖產生哪些衍生圖」、既有檔案雜湊、目標尺寸、JPEG 品質與補邊色；歷史完整 `sips` 指令及所有轉檔參數沒有留在這份文件。本次沒有重製圖片，也未證明由原圖重跑可逐位元產生既有衍生檔；重新生成 prompt 更不保證取得相同原圖。

本次另建立限定品牌素材的同機副本：兩張原圖、七張衍生圖、兩張參考肖像，以及建立副本當時的 README／PROMPTS 快照，共 13 個來源檔，附相對路徑校驗清單與保存說明。從副本獨立讀回，檔案集合、大小、SHA-256 與圖像尺寸全部吻合；私人保存路徑只留本機。

原圖保存狀況與完整環境備份分開記錄。同機可讀與雜湊正確不代表離機副本已驗證；完整私密／離機備份仍由 R1／R2 追蹤。品牌及角色的商用權利由 S2 另行決定，檔案來源核對不代替權利審查。
