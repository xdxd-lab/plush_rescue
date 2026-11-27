# Three.js 執行檔

`vendor/` 內的兩個 ES 模組來自官方 [Three.js r186](https://github.com/mrdoob/three.js/releases/tag/r186) 的 [three 0.186.0 套件](https://registry.npmjs.org/three/-/three-0.186.0.tgz)。請保留 `vendor/THREE-LICENSE.txt` 與檔頭宣告。本版只壓縮空白與一般註解，不更換引擎版本、不縮短識別字，也不合併檔案。執行時沒有新增 CDN、npm 或建置相依。

需要重建時，將上游 tarball 解開、離線準備 esbuild 0.28.0，再執行：

```sh
bash tools/vendor/minify-three.sh /path/to/package/build /path/to/esbuild
python3 qa/regenerate-manifest.py
python3 verify-export.py
```

腳本先檢查兩個上游檔的 SHA-256。請勿直接修改輸出或把 esbuild 裝進遊戲執行依賴。升級 Three.js 時，另跑 Chrome/WebGL 試玩並更新來源版本、雜湊和授權。
