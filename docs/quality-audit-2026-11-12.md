# Q2／Q6／D4／S3：v12.6.0 後續驗證

2026-11-12（臺灣時間），基準 `644c32a`。本批限 CI、QA、文件與品牌原圖保全；未修改遊戲 runtime、版本資料、直式視角、玩法或七個鎖定模組。`build-info.json` 的驗證欄位仍是 v12.6.0 建置時快照，不回填本批文件／QA 結果。

## Q2：Linux Chrome

先以不含部署工作的獨立診斷 workflow，在 runner 既有 Chrome、Node 24 上驗證；不因分支 CI 成功就宣稱已部署，也不把 macOS 的執行結果當 Linux 證據。診斷的固定範圍為 1280×720、拾取／設定／兩個儲存情境與開始／暫停對話框。

驗收要求每輪 18 個具名結果（17 個計數檢查與 1 個 timing note）全部完成，保留實際 WebGL renderer、JSON、截圖與耗時；timeout／CDP／assert／setup 四種負測檢查預期失敗及清理。只探測該次程序回報的 PID／profile／HTTP／DevTools 端點；不終止其他程序。外層逾時不算負測成功，失敗也不以自動重試洗掉。

[Linux 首輪診斷](https://github.com/xdxd-lab/plush_rescue/actions/runs/43091539892)整體失敗，來源為分支 `ci/chrome-q2` 的 `2b768cf`，當時尚未接入 main 的部署關卡。第一輪矩陣耗時 498,715 ms，17 項檢查全部通過、0 failed／0 notRun、無 abort／fatal／console error，實際為 WebGL2／Vulkan SwiftShader。runner 因 timing note 的實際順序與預期不同而拒絕，第二輪未執行；不把這次結果當重複穩定性證據。

負測方面，timeout／assert 在 setup 先被過短的 CDP 時限中斷；CDP 案例的 validator 雖回報 valid，但 abort 實為 check timeout，寬鬆字串比對誤命中測項名稱中的 CDP，不能算預期的 CDP 請求逾時驗證通過。setup failure 案例達到預期。五次已執行案例的 profile、專屬 process group、HTTP 與 DevTools 端點清理均通過，無 runner 強制清理。

runner 環境為 Linux Azure x64／Ubuntu 26 image `20261101.186.1`、Node 24.22.2、Chrome 156.0.8078.79。截圖有中文字型缺字，不用來驗收中文視覺品質。首輪結束時，依使用者「遇問題先停」要求，Q2 的驗證器修正、重跑與部署關卡接入當時暫停待決定；保留此次失敗與原始證據，不自動重試或放寬標準。

當時提出的方案限 QA：修正 timing note 順序、只在已載入的預定測項施加短時限、精確驗證 CDP／check 各自的逾時來源，並繼續要求未執行後項與完整清理。沒有因此修改遊戲。

### 續作與受控排程

使用者隨後核准續作，並將本批細節交主代理與 t22 決定。修正版 `69ddbde` 將短時限限制於目標測項／請求，保留正常初始化預算；以明確階段與精確錯誤來源拒絕 check／CDP 混淆，校正實際結果順序，完整性及清理要求維持。四項驗證器測試涵蓋漏測、順序、錯誤來源、外層逾時及非法單／雙輪參數。Ubuntu 官方 `fonts-noto-cjk` 的套件版本與實際字型會保存在 artifact，裝妥仍須實看圖片。

`69ddbde` 的兩個工作長時間維持 queued、零 jobs；API、公開頁與新鮮回應均未指出原因，不能把未啟動當測試失敗。一次明確標記的 [main 排程探測](https://github.com/xdxd-lab/plush_rescue/actions/runs/43103530454)只執行原本的 Node／DOM／export，成功且建置／部署略過；不當作 Q2 證據。

依主代理與 t22 的共同決策，只建立一次空提交 `d7833bc` 來產生新 push 事件。它的 parent 為 `69ddbde`，tree OID 同為 `221eb44087d62fe1c96c67395b31d550206545c3`，沒有變更任何檔案；原 queued 與失敗紀錄保留。新的 [Q2 診斷](https://github.com/xdxd-lab/plush_rescue/actions/runs/43103955417)與[一般 CI](https://github.com/xdxd-lab/plush_rescue/actions/runs/43103955394)已開始，一般 CI 通過 Node 232、DOM 88 與 export 41／83／28。新事件可執行不足以單獨判定舊事件卡住原因。

單輪日常工作與雙輪診斷共用完全相同的 reusable workflow／依賴和驗證契約；單輪精確五個案例，雙輪精確六個。各矩陣 12 分鐘、各負測 120 秒，job 分別 25／40 分鐘，外層逾時一律失敗，不自動重試。雙輪才提供本次重複執行證據；單輪不宣稱重複穩定性。部署關卡只以完整通過的同一候選為依據。

### 第二版實測與正常預算調整

`d7833bc` 的單輪工作完成：17 checks／18 records、四種精確故障探測、五個案例清理與實際中文字形核對均通過，job 耗時 9m41s；雙輪工作的第一輪卻在五輪設定檢查碰到 120s 上限，第二輪未執行，整體仍為 FAIL。兩組的負測與清理都達預期，不能據此把未完成的重複矩陣算成通過。

同一測項在單輪組耗時 96,883ms；雙輪組先前三項約慢 1.28–1.33 倍，但沒有足夠 CPU／負載資料可確定原因，也不能僅由比例判定遊戲卡死或效能問題。主代理與 t22 因此核准第三版 QA 候選 `31b8a25`：正常 check／CDP 改回原完整 suite 的 240s／60s，每矩陣外層 12m、job 25／40m 與負測 body 1500ms／outer 120s 維持，所有操作、斷言和輸入時戳不變。

第三版保存有界的每輪／階段 begin、done、當前 pending 與耗時，以及 CDP 的開始、完成、狀態及 abort 前 active snapshot；同時記錄 CPU 型號／數量、可用平行度與起始 loadavg，僅供環境觀察，不當作 FPS 或因果證據。5 項 focused tests、語法／export／runtime 雜湊核對通過後，[第三版診斷](https://github.com/xdxd-lab/plush_rescue/actions/runs/43106622090)重新驗證同一 SHA 的單／雙輪；不拼接上一版單輪 PASS。

### 第三版限定通過與部署依賴

同一 `31b8a25` 的單／雙輪兩個工作均成功，並完成原始 artifact 的獨立核對及分析審查。三個矩陣各有 18 筆依序成功的結果（17 checks＋1 筆 timing note），合計 51 次 check 執行及 3 筆 timing note，共 54 筆結果；不是 51 個不同測項。四種負測各在兩模式執行一次，共 8 個負測案例，均達到預定階段與精確錯誤來源。單輪五個、雙輪六個案例，11／11 的暫存 profile、專屬 process group 及自己的 HTTP／DevTools 端點清理通過，無外層強制清理。所有矩陣均無漏跑、abort、fatal 或 console error。

| 模式／矩陣 | 矩陣耗時 | 五輪設定檢查 |
|---|---:|---:|
| 單輪 matrix-1 | 567,900 ms | 122,396 ms |
| 雙輪 matrix-1 | 537,897 ms | 105,855 ms |
| 雙輪 matrix-2 | 504,158 ms | 104,408 ms |

每個矩陣的五輪均有完整 60 筆 begin／done 階段紀錄，結束時 current phase 為 null、active CDP 為 0；最後 20 筆 CDP 記錄皆完成，但這不是全程都沒有慢請求的證明。單輪的有效設定檢查實際超過舊 120s 上限，支持此次有界預算調整，不等於確定上一版逾時的原因。CPU／loadavg 資料仍僅作觀察。

Node 24.22.2、Chrome 156.0.8078.79、Ubuntu 26 image `20261101.186.1`、WebGL2／Vulkan SwiftShader 與 Noto CJK 套件／字型均有保存。六張原始 PNG 已實際檢視，中文字形清楚，未見缺字方框。永久收錄的[精簡 JSON](../qa/evidence/q2-linux/summary.json)、[標題原圖](../qa/evidence/q2-linux/title.png)及[遊戲原圖](../qa/evidence/q2-linux/game.png)取自同一個已核對的單輪 artifact；圖片逐位元複製，沒有修改像素。完整 raw 保留在獨立驗證紀錄；GitHub artifact 有保存期限，不當作整機備份。

主代理與 t22 確認上述限定證據後，`ci-pages.yml` 的 `chrome-smoke` 以 `matrix_runs: 1` 呼叫完全相同的共用工作流，並先依賴 `test`；Pages 建置同時依賴兩者。受驗 QA 與 shared workflow 內容不變，原 concurrency、main push 條件、fresh-main 防舊版覆蓋及部署權限均維持。分支診斷成功仍不代表主線已通過；整合後尚須確認同一提交的 CI／Chrome／實際 Pages 部署均成功，再於 [Q2 議題](https://github.com/xdxd-lab/plush_rescue/issues/5)記錄驗收及結案連結。此配置提交不另立遊戲版本或 Release，不重發內容相同的 Sites。

此結果限定 Linux headless Chrome／SwiftShader 的 1280×720 桌面矩陣，沒有宣稱完整 68 項多尺寸 Chrome suite、Safari、手機、硬體 GPU、WCAG、真人長局或效能改善。

## Q6：可重現長局資料，真人驗收未完成

[固定腳本與範圍](../qa/q6-longrun-protocol.md)、[精簡結果](../qa/q6-longrun-summary.json)、[真人試玩表](../qa/q6-human-playtest.md)。六個固定 seed 案例涵蓋兩個角色與三個 core map index，以固定策略和 `dt=0.05` 執行；不載入 Three.js 地景碰撞，角色／地圖各用不同 seed，不拿來比較其強弱。

- 六個正常血量案例由遊戲本身判定 `fallen`，時間為 22.8–37.65 秒；未算成 20 分鐘通關。
- 六個同 seed 的無敵診斷案例到達核心 `ended/survived`、1,200 秒與 24,001 次實際 step；只證明限定後期路徑可到達，`naturalSurvivalClaim` 為 false。
- 兩遍完整案例資料依遞迴排序 key、UTF-8、compact JSON 的規則計算，最終雜湊相同；版本化摘要列出完整值與來源雜湊。完整逐事件 raw 留在本機，公開讀者無法直接核對該 raw，但可依固定腳本重新產生資料。

固定巡邏、追掉落物、替換與升級優先序帶有策略偏差。上述結果不代表真人存活率或遊戲過難，未據此修改平衡。試玩表尚未填寫，Q6 保持開啟。

## S3：原圖核對與限定同機保全

兩張品牌原圖的尺寸、大小與既有 SHA-256 完全吻合；七張衍生圖核對完成，其中六張 runtime 圖符合 manifest，README 橫幅維持不列入 runtime。公開的來源／衍生關係與雜湊見 [品牌紀錄](../assets/brand/README.md)及 [provenance.json](../assets/brand/provenance.json)。原圖及私人儲存位置不放進 GitHub 或 Sites。

另保存限定品牌素材的同機副本：兩張原圖、七張衍生圖、兩張參考肖像與建立副本時的 README／PROMPTS，共 13 個來源檔，附相對路徑校驗清單與保存說明。從副本讀回的檔案集合、大小、SHA-256 和圖片尺寸均吻合。歷史完整轉檔參數未留存，不宣稱逐位元重製已驗證；離機與完整私密備份仍由 R1／R2 追蹤，商用權利另由 S2 決定。

## D4：本輪文件核對

- README 分開標示 v12.4.1 的模組拆分／鎖護欄／尺寸篩選，以及 v12.5.0 的材質預熱／預警對比。
- QA 說明區分 repo Chrome 命令與外部 Firefox 驗證，保留 v12.5.0 歷史結果並連結後續版本。
- S1 的「尚未接入 runtime」明確限定於 v12.5.0；v12.6.0 僅 V2 首階段接入。
- 復原指南保留 11/11 工具快照，補後續證據連結；未將同機分項驗證寫成離機或完整環境還原。

舊版本測試數字與尚未釐清的量測日期沒有改寫。D4 依使用者要求持續開啟，本輪核對不代表永久完成。
