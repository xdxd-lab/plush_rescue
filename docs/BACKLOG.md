# 待辦與議題索引

更新快照：2026-11-11，v12.5.0 發布後。此索引使用固定代號；最新討論與狀態以各 GitHub Issue 為準。

建立 Issue 是保留需求與決策紀錄，**不代表所有提案都已批准實作**。本輪只授權 D1、D2、R1、R2；其他工作另行安排。P1 為優先，括號標記適用時機；P2 為後續改善，P3 為探索。

## 已轉為議題的項目

初次移轉21項；D1、D2完成後保留議題作紀錄，不改動固定代號。R1／R2的私密備份位置、會話識別與密碼等只留在安全本機，不貼到公開議題。

| 代號 | 重要程度 | 事項 | 狀態快照 | 議題 |
|---|---|---|---|---|
| E4 | P2 | 繼續拆分 main.js | 提案 | [#1](https://github.com/xdxd-lab/plush_rescue/issues/1) |
| E5 | P2 | Core 整理與決定性測試 | 提案 | [#2](https://github.com/xdxd-lab/plush_rescue/issues/2) |
| E6 | P2 | 建立渲染效能預算 | 待量測 | [#3](https://github.com/xdxd-lab/plush_rescue/issues/3) |
| E7 | P2 | 暫停時的繪製與耗電 | 待量測／提案 | [#4](https://github.com/xdxd-lab/plush_rescue/issues/4) |
| Q2 | P2 | 瀏覽器測試納入 CI | 提案 | [#5](https://github.com/xdxd-lab/plush_rescue/issues/5) |
| Q3 | P1 | 補齊 Safari 與窄視窗跨瀏覽器回歸 | 部分完成 | [#6](https://github.com/xdxd-lab/plush_rescue/issues/6) |
| Q4 | P1 | 手機實機與長時間效能驗證 | 等設備 | [#7](https://github.com/xdxd-lab/plush_rescue/issues/7) |
| Q5 | P2 | 可讀性、遮擋與減少動態效果 | 待辦 | [#8](https://github.com/xdxd-lab/plush_rescue/issues/8) |
| Q6 | P2 | 真人平衡與長局測試 | 待辦 | [#9](https://github.com/xdxd-lab/plush_rescue/issues/9) |
| V2 | P2 | 粒子與特效素材整合 | 已有設計／待選方案 | [#10](https://github.com/xdxd-lab/plush_rescue/issues/10) |
| V3 | P3 | 背景音樂與音效 | 候選待決定 | [#11](https://github.com/xdxd-lab/plush_rescue/issues/11) |
| V4 | P2 | WebGL 啟動失敗復原 | 待查／提案 | [#12](https://github.com/xdxd-lab/plush_rescue/issues/12) |
| S2 | P1（商用前） | 專案 LICENSE 與商用 IP 策略 | 待決定 | [#13](https://github.com/xdxd-lab/plush_rescue/issues/13) |
| S3 | P2 | 品牌原圖與衍生流程保全 | 待核對 | [#14](https://github.com/xdxd-lab/plush_rescue/issues/14) |
| R1 | P1（清理前） | 更新專案與環境安全備份 | 準備中；安全保存方式待指定 | [#15](https://github.com/xdxd-lab/plush_rescue/issues/15) |
| R2 | P1（清理前） | 執行隔離還原演練 | 等待R1；整體演練未完成 | [#16](https://github.com/xdxd-lab/plush_rescue/issues/16) |
| R4 | P2 | 素材重建路徑可搬移化 | 待核對／修正 | [#17](https://github.com/xdxd-lab/plush_rescue/issues/17) |
| D1 | P2 | 補齊可驗證的歷史 Tags 與 Releases | 本輪補建完成，保留紀錄 | [#18](https://github.com/xdxd-lab/plush_rescue/issues/18) |
| D2 | P2 | 建立固定代號 GitHub 議題追蹤 | 索引與議題移轉完成，保留紀錄 | [#19](https://github.com/xdxd-lab/plush_rescue/issues/19) |
| D3 | P2 | 雲端舊保存版本與資料保留 | 待決定 | [#20](https://github.com/xdxd-lab/plush_rescue/issues/20) |
| D4 | P2 | 持續核對歷史文件文義 | 已做一輪／持續未完成 | [#21](https://github.com/xdxd-lab/plush_rescue/issues/21) |

## 移轉前已完成的項目

這9項已有發布或本機驗證紀錄，不為了補齊數字另建歷史Issue。

| 代號 | 完成內容 | 完成版本／範圍 |
|---|---|---|
| E1 | 第一階段main.js拆分與smoke解耦 | v12.4.1 |
| E2 | 鎖定模組護欄 | v12.4.1 |
| E3 | 材質預熱與防護 | v12.5.0 |
| Q1 | 瀏覽器測試尺寸篩選 | v12.4.1 |
| V1 | 衝刺預警對比 | v12.5.0 |
| S1 | 素材來源與授權核對 | v12.5.0；未接入runtime |
| R3 | 復原指南更新 | v12.5.0；不是備份／演練完成 |
| H1 | 四角色終端身分驗證 | 本機驗證完成，私人識別資訊不公開 |
| H2 | 本機協作名冊 | 本機維護完成，後續重啟仍需更新 |

版本與驗證範圍見 [CHANGELOG](../CHANGELOG.md)、[QA](../qa/README.md)，復原流程見[開發環境復原](../開發環境復原.md)。

## 維護規則

- 新增工作沿用現有代號或接續新增，不因排序變更代號；先以標題中的`[代號]`去重。
- 每個議題保留優先級、狀態、驗收條件、相依與公開依據。已完成、提案、等設備與待決定要分開。
- 關閉議題需有可核對的成果與限制；同機演練不能當作離機或另一設備成功。
- 不公開私人備份、會話、登入憑證或實際加密密碼；公開議題僅記錄可公開的範圍與結果。
- D4依使用者要求保持未完成，本輪做過一次不代表永久完成。
