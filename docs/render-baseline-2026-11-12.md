# 桌面渲染基準與暫定預算

2026-11-12；量測來源提交 `885afbe1243c10748178c7c0df2ead26e3200394`，六輪、每輪 180 個逐幀樣本。這是受控桌面基準，沒有修改渲染策略或玩法。

## 方法與實測

Chrome 157.0.8103.51、Node 24.22.1、macOS arm64、Apple M4 Max；WebGL2 unmasked renderer 回報 `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)`，分類為 hardware-reported。這是瀏覽器回報的硬體資訊，不是 GPU 計時。

每輪獨立 profile，1280×720、DPR 1、balanced、map 0、seed 20261112；先確認 shader warmup ready／error null，再暖機 60 次 render，取 180 個樣本。Game.step 凍結，畫面使用正常主迴圈 render。dense 場景有 24 一般敵人、2 首領、2 hazard、2 ally、8 rescued，計數穩定；首領、hazard、ally 的模型與視角內投影各有 2。獨立驗證已檢視六張原始 PNG，確認實際畫面。

| 場景 | 三輪 render 間隔 p95（ms） | 三輪 render CPU p95（ms） | calls／frame | triangles／frame |
|---|---|---|---:|---:|
| low-load-running | 17.4、17.4、17.7 | 2.9、2.9、2.7 | 212 | 721,332 |
| dense | 18.2、17.7、17.6 | 3.6、3.8、3.7 | 495 | 1,422,036 |

low-load 的間隔 p99 為 17.6–18.1 ms、最大 18.2 ms；dense 的 p99 為 18.4–19.2 ms、最大 19.4 ms。render CPU 個別最大為 low-load 6.2 ms、dense 4.8 ms；p95 不代表沒有突波。每輪取樣約三秒，同次六輪不足以估計跨日、溫度或背景負載的分布。

## 暫定預算，供同環境逐輪複查

| 場景 | render 間隔 p95 | render CPU p95 | 每次 render calls | 每次 render triangles |
|---|---:|---:|---:|---:|
| low-load-running | ≤ 19 ms | ≤ 4.0 ms | ≤ 235 | ≤ 800,000 |
| dense | ≤ 20 ms | ≤ 5.0 ms | ≤ 545 | ≤ 1,570,000 |

這些值由同批數據初定，尚未由獨立後批驗證，不是 CI gate。間隔比本批最差 p95 留約 1.3–1.8 ms；CPU 留約 1.1–1.2 ms，calls／triangles 留約 9–11%。這些餘裕是回歸警戒參考，不代表長期穩定性或允許未審核的增長。各輪分開檢視，不混合三輪掩蓋波動；更換硬體、瀏覽器、場景或畫質須重建基準。

`rafIntervalMs` 是相鄰 render 起始間隔，包含排程與主執行緒負載，不是直接的 rAF timestamp；`renderCpuMs` 是 JavaScript 呼叫時間，不是 GPU 執行時間。16.7 ms 僅為 60Hz 參考，不作本次通過門檻。此結果不證明前景遊戲、自然長局、手機 FPS、耗電或效能改善。前景及跨環境校準屬後續工作，Q4 實體手機仍保留。

## 驗證、失敗及清理範圍

- Node 24.22.1：237/237；DOM/API stub：89 項；export：42 hashes／84 references／29 modules。模擬測試與真正 WebGL 量測分開列示。
- 第一個正式候選 `a1dc4cf` 因 fixture 多讀一層隊友 stats 而失敗，0/6，沒有樣本或 renderer 分類。修正只改 QA getter 並新增真 main/Game 契約檢查；未改遊戲介面、預算或場景門檻。有效量測來源是 `885afbe`，不拼接原失敗當成功；原 FAIL 留於本機測試紀錄。
- 唯一一次受控 SIGTERM 負測 exit 1，保留 `interrupted SIGTERM`、0/6，未報 cleanup failed。工具內 DevTools port refused 檢查通過，事後未見自有 E6 Chrome 或 profile。該負測沒有保留 ephemeral port 值供事後獨立重綁，不能聲稱另做了同埠驗證。

[量測方法](../qa/E6-RENDER-BUDGET.md)、[參考預算](../qa/e6-budget-reference.json)、[完整逐幀樣本](../qa/evidence/e6-desktop/samples.json)、[摘要](../qa/evidence/e6-desktop/summary.json)。公開樣本僅將截圖本機絕對路徑改為同目錄檔名，所有數值保留。

[低負載原圖](../qa/evidence/e6-desktop/e6-hardware-low-load-running-1.png)與[密集場景原圖](../qa/evidence/e6-desktop/e6-hardware-dense-1.png)；同目錄另保留各場景第 2、3 輪原圖。量測 JSON 的 hardwareBudget 保留工具當時未校準的快照，以上參考值是後續審核產物，不改寫原始量測結論。
