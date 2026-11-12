# E6 渲染量測（候選工具，非 CI gate）

從 repo root 使用 Node 22+ 與已安裝的 Google Chrome；每次執行會依序啟動六個獨立 profile，對 `low-load-running`／`dense` 固定場景各量三輪。使用前先確認沒有其他重型 WebGL 測試佔用同一 GPU。

```sh
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node qa/e6-measure.mjs --backend=hardware --output=/tmp/e6-hardware.json
CHROME='/path/to/chrome' node qa/e6-measure.mjs --backend=swiftshader --output=/tmp/e6-swiftshader.json
```

`--backend=hardware` 不加強制軟體渲染參數；`--backend=swiftshader` 才要求 ANGLE SwiftShader。兩者都記錄 WebGL `VERSION`、vendor／renderer 原字串；請以**實測 renderer** 判斷，不能以請求值或作業系統 GPU 型號宣稱 Chrome 正使用硬體。macOS 沙盒未取得 DevTools port 時，JSON 會寫出明確錯誤且退出非零；這不是硬體不支援的證據。

每輪固定 1280×720、DPR 1、balanced、map 0、seed 20261112，先等待材質預熱 ready／無 error，再暖 60 次 render，取 180 個樣本。`low-load-running` 是空場但已進入 running 狀態，並非標題畫面。`dense` 有 24 一般敵人、2 首領、2 hazard、2 ally、8 rescued；初始／結束實體數都必須符合。另存每輪 PNG、各類投影是否進 viewport、boss／hazard／ally 模型數；至少各一個進入視角且有模型，樣本中的 draw calls／triangles 須正值，否則整輪失敗。這些是投影／場景證據，PNG 仍須人工檢視遮蔽或錯畫。QA 端凍結 `Game.step` 以隔離場景變動，並包住 renderer.render 取資料，**不修改遊戲執行檔**；這是受控靜態場景，不能取代自然長局。

每輪自啟動起 90 秒硬期限；開機、warmup、取樣各有更短限時，CDP 請求不可越過輪次期限。六輪按序執行，沒有自動重試；輪次內失敗保存 `error` 和先前已完成輪次的原始資料。命令參數、Chrome 路徑或版本查詢等**量測前預檢失敗**會直接非零退出，不承諾完整 JSON。SIGINT／SIGTERM、逾時與一般輪次失敗均清理自有 Chrome 群組、DevTools port、HTTP server 及 profile；browser／HTTP／profile 分項清理，即使其中一項失敗也繼續其他項。未證實 Chrome 與 port 均已停止時保留 profile 路徑供人工檢查，不提前刪除，整批非零退出。HTTP 僅供 repo 內檔，CSS／PNG／JPEG MIME 明確設置；每輪自驗 `style.css` 已載入並有規則與實際對話框樣式。

JSON 的逐幀 `rafIntervalMs` 是兩次 render 呼叫開始間隔，包含排程／主執行緒負載，**不是直接的 rAF callback timestamp**；`renderCpuMs` 是 JS `renderer.render` 呼叫耗時，**不是 GPU time**；`calls`／`triangles` 來自 Three.js `renderer.info.render`，按目前預設 `autoReset` 表示該次 render 的計數，不修改 reset 模式。包裝在固定場景 `renderOnce` 之後才安裝，取樣期間只預期主迴圈 render。每欄記 median／p95／p99／max，原始樣本完整保留。QA 包裝本身有額外開銷，headless Chrome 也不等同前景遊戲。以 16.7 ms 作 60 Hz 的暫定參考線，硬體／畫質的正式 p95、draw-call、triangle 預算需依真實 renderer 結果審查後決定；軟體 renderer 只驗工具與回歸，不當手機 FPS、耗電或硬體 GPU 結論。`WEBGL_debug_renderer_info` 缺席或只回傳通用名稱時分類 `unknown`，不能推定硬體。Q4 實體裝置另驗，E7 暫停耗電不包含。

語意依據：[Three.js WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer) 說明 `calls`／`triangles` 與預設自動重設；[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) 說明回呼由瀏覽器安排，背景分頁可能暫停。量測器明列各輪原始數據與實際 renderer，供獨立審查。

## 首階段桌面實測

2026-11-12 的六輪 Apple M4 Max／ANGLE Metal 原始數據與方法見[桌面基準](../docs/render-baseline-2026-11-12.md)。[參考預算](e6-budget-reference.json)由同批數據導出，僅供相同環境逐輪人工複查，不是獨立通過證據或 CI gate。量測 JSON 的 hardwareBudget 欄保留工具當時未校準的快照，後續審核參考值另外記錄，不改寫原始量測結論。
