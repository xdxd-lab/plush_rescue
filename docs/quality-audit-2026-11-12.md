# Q2／Q6／D4／S3：v12.6.0 後續驗證

2026-11-12（臺灣時間），基準 `644c32a`。本批限 CI、QA、文件與品牌原圖保全；未修改遊戲 runtime、版本資料、直式視角、玩法或七個鎖定模組。`build-info.json` 的驗證欄位仍是 v12.6.0 建置時快照，不回填本批文件／QA 結果。

## Q2：Linux Chrome

先以不含部署工作的獨立診斷 workflow，在 runner 既有 Chrome、Node 24 上驗證；不因分支 CI 成功就宣稱已部署，也不把 macOS 的執行結果當 Linux 證據。診斷的固定範圍為 1280×720、拾取／設定／兩個儲存情境與開始／暫停對話框。

驗收要求每輪 18 個具名結果（17 個計數檢查與 1 個 timing note）全部完成，保留實際 WebGL renderer、JSON、截圖與耗時；timeout／CDP／assert／setup 四種負測檢查預期失敗及清理。只探測該次程序回報的 PID／profile／HTTP／DevTools 端點；不終止其他程序。外層逾時不算負測成功，失敗也不以自動重試洗掉。

[Linux 首輪診斷](https://github.com/xdxd-lab/plush_rescue/actions/runs/43091539892)整體失敗，來源為分支 `ci/chrome-q2` 的 `2b768cf`，尚未接入 main 的部署關卡。第一輪矩陣耗時 498,715 ms，17 項檢查全部通過、0 failed／0 notRun、無 abort／fatal／console error，實際為 WebGL2／Vulkan SwiftShader。runner 因 timing note 的實際順序與預期不同而拒絕，第二輪未執行；不把這次結果當重複穩定性證據。

負測方面，timeout／assert 在 setup 先被過短的 CDP 時限中斷；CDP 案例的 validator 雖回報 valid，但 abort 實為 check timeout，寬鬆字串比對誤命中測項名稱中的 CDP，不能算預期的 CDP 請求逾時驗證通過。setup failure 案例達到預期。五次已執行案例的 profile、專屬 process group、HTTP 與 DevTools 端點清理均通過，無 runner 強制清理。

runner 環境為 Linux Azure x64／Ubuntu 26 image `20261101.186.1`、Node 24.22.2、Chrome 156.0.8078.79。截圖有中文字型缺字，不用來驗收中文視覺品質。依使用者「遇問題先停」要求，Q2 的驗證器修正、重跑與部署關卡接入均暫停待決定；保留此次失敗與原始證據，不自動重試或放寬標準。

待決方案限 QA：修正 timing note 順序、只在已載入的預定測項施加短時限、精確驗證 CDP／check 各自的逾時來源，並繼續要求未執行後項與完整清理。沒有因此修改遊戲。

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
