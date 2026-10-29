# 品牌素材（assets/brand）

本資料夾的圖片由兩張 AI 生成原圖衍生；原圖不放進儲存庫，以免拖慢下載。產生日期為 2026-10-29，由主代理以內建影像生成（imagegen built-in）產出，並經主代理目視審核。角色沿用遊戲中的兩位主角：布丁狗（奶黃垂耳、可可棕貝雷帽、圓框墨鏡）與北極熊（白色圓耳、冰藍圍巾、同款墨鏡）。

## 來源

| 原圖 | 尺寸 | SHA-256 | prompt 摘要 |
|---|---|---|---|
| App icon（`exec-a05f7395-….png`） | 1254×1254 PNG | `192cda38ad5c0c37da47bb992b66da87583e12b49d8a8a3d8d657bfcf1415ef9` | 布丁狗頭部特寫，深夜藍背景，身後金色光暈與星光 |
| 橫幅（`exec-723a4049-….png`） | 2172×724 PNG | `a3cfc1451ebd5d7663d8aa8a5413ff152100063a339a694ec3b656a0b4b42392` | 布丁狗與北極熊並肩、身旁救回的布偶朋友，背景是黎明的遊樂場，左側 PLUSH RESCUE 字樣 |

完整 prompt 未保存在本儲存庫；如需重製請向主代理索取。

## 衍生檔案（macOS `sips` 縮放與轉檔）

| 檔案 | 來源 | 尺寸 | 用途 |
|---|---|---|---|
| `icon-16.png`、`icon-32.png`、`icon-192.png` | App icon | 16、32、192 px | 瀏覽器分頁 favicon |
| `apple-touch-icon.png` | App icon | 180 px | iOS 加到主畫面 |
| `brand-mark.png` | App icon | 64 px（顯示 20 px） | 開始與暫停畫面標籤內的小標記 |
| `banner.jpg` | 橫幅 | 1280×426，JPEG 品質 82 | `README.md` 首圖（不屬於遊戲執行檔） |
| `og-image.jpg` | 橫幅 | 1200×630，JPEG 品質 85，上下以 `#101A44` 補邊 | 社群分享預覽（`og:image`、`twitter:image`） |

除 `banner.jpg` 外，其餘檔案都列入 `runtime-manifest.json`。
