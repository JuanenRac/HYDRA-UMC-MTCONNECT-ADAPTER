<!-- =============================================================================
HYDRA-UMC-MTCONNECT-ADAPTER - MTConnect probe/current/sample endpoints
Copyright (C) JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
GPL-3.0-or-later - see LICENSE
============================================================================= -->

<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | <a href="README_fra.md">🇫🇷 Français</a> | <a href="README_ita.md">🇮🇹 Italiano</a> | <a href="README_deu.md">🇩🇪 Deutsch</a> | <a href="README_zho.md">🇨🇳 简体中文</a> | 🇯🇵 <b>日本語</b> | <a href="README_por.md">🇵🇹 Português</a></p>

### 🛠️ 工作機械監視のための標準化された XML/HTTP インターフェース

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL%203.0--or--later-blue.svg" alt="GPL 3.0 or later">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="Standard">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="Format">
  <img src="https://img.shields.io/badge/Tests-131%20passing-2ea44f.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Version-0.2.0-0f6cbd.svg" alt="Version">
  <img src="https://img.shields.io/badge/Maturity-functional-0F6CBD.svg" alt="Maturity">
</p>

---

**正直な現状確認 - 今日実際に動くもの:** 単位変換(`src/units.ts`)、品質/タイムスタンプ/エラーコードのマッピング(`src/dataitem.ts`)、ポーリング/キャッシュ(`src/reader.ts`)、本物の HYDRA-UMC-SERVER に基づくマシンリーダー(`src/hydraServerReader.ts`)、そして HTTP サーバー(`src/server.ts`)はすべて本物であり、テスト済みである(11 ファイルにわたり 131 件のテストが成功しており、`supertest` を使った本物のリスニングソケットに対する本物の HTTP リクエストも含まれる——単なるコンパイルチェックではない)。デバイスモデルはちょうど 1 台の HydraNode(`hydra_umc_1`)にハードコードされている——これは HTTP インターフェースと XML の形状がエンドツーエンドで仕様に正しく準拠していることを証明しているが、複数台のロボットを監視する実際のデプロイでは HYDRA-UMC-SERVER 自身のライブなロボット一覧からこれを生成する必要があり、それはまだ行われていない。出力される XML は仕様に沿った形状(名前空間、`Device`/`DataItem` の id、共有される `instanceId`)であることが検証済みだが、実際のサードパーティ製 MTConnect Agent やコレクターに対してライブでテストされたことはまだない。これまでに何が実際に出荷されたかは `CHANGELOG.md` を参照。

---

> **安全性とセキュリティの現状:** このエコシステムは認証された安全システムではありません。ハードウェアの E-STOP 経路、ファームウェアが強制する制限やインターロック、検証済みの動作コマンドはまだありません。ファームウェアイメージは CRC-32 と Ed25519 署名で検査し、リリースビルドは公開済みの開発用鍵を拒否します(リレーの先のツールヘッドと拡張ボードは引き続き URTC のブートローダーを使い、署名ではなく共有鍵の HMAC-SHA256 を使います)。TLS と相互 TLS は任意で、既定では無効です。独自基板はまだ実装も試験もされていません。ここに書かれた内容を人の安全のために頼る前に、[セキュリティベースライン](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md)と[脅威モデル](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md)をお読みください。

---

## 📋 ひと目で

| | |
|---|---|
| バージョン | `0.2.0` |
| 成熟度 | 機能する |
| テスト | 131 (`npm test`) |
| 技術 | Node.js / Express / MTConnect 1.7 XML |
| 対象 | HYDRA-UMC セルの Raspberry Pi CM5 |
| 実機での確認 | まだです：このバージョンについて実機での動作記録はありません |

**移動：** [概要](#-概要) · [アーキテクチャ](#-アーキテクチャ) · [設定](#-設定) · [クイックスタート](#-クイックスタート) · [テスト](#-テスト) · [リポジトリの構成](#-リポジトリの構成) · [関連プロジェクト](#-関連プロジェクト)

## 🚦 プロジェクトの状況

各行はこのリポジトリの一部分で、信号は今日どこまで進んでいるかを示します。計画ではなく、リポジトリが示せるもの（テスト、ビルド、実行）に基づいて書かれています。

🟢 完了・検証済み · 🟡 動作する（既知の制限あり） · 🟠 一部のみ、または未検証 · 🔴 未実装または動作しない

| 領域 | 状態 | ここでの意味 |
|---|---|---|
| ソフトウェア | 🟡 | 主な目的では動作します。足りない点は上の正直さの確認に書かれています |
| テスト | 🟢 | 自動テスト 131 件。変更のたびに実行されます |
| 実機 | 🔴 | まだです：このバージョンについて実機での動作記録はありません |
| ドキュメント | 🟢 | 8 言語の README。変更のたびにマニフェストと照合されます |

## 🎯 概要

**HYDRA-UMC-MTCONNECT-ADAPTER** は、工作機械監視のためのレガシーかつ
工場標準のブリッジです。MTConnect プロトコル（バージョン 1.7 の文書を公式 XSD で検証）を実装し、
ロボットスウォームを一連の標準化された工作機械として公開します。

読み取り専用の XML/HTTP インターフェースを提供し、従来の産業用
ソフトウェアが専用ドライバーを必要とせずに、HydraNode の
実行状態、可用性、主軸温度を監視できるようにします。

### 主な機能：
* 🏭 **標準化されたマシンデータ：** 1 台の HydraNode を MTConnect 準拠デバイスとして公開します。*（現在は正確に 1 台の HydraNode - `hydra_umc_1` - に固定されています。詳細は `docs/API.md` を参照。HTTP サーフェスと XML 形式がエンドツーエンドで仕様どおり正しいことを証明するものです。実運用では HYDRA-UMC-SERVER 自身のライブなロボット一覧からこれを生成します）*
* 📄 **XML データストリーム：** `GET /current` の実際にポーリングされる `<Events>`/`<Samples>` ブロックを標準の XML 形式で提供します。*(実装済み)*
* 🔌 **実際のマシンソース：** `HydraServerMachineReader`（`src/hydraServerReader.ts`、`HYDRA_UMC_SERVER_URL`）は実際に稼働している HYDRA-UMC-SERVER 自身の `GET /api/settings` をポーリングし、実際のロボット1台の実際の状態（`AVAILABLE`/`ACTIVE`/`INTERRUPTED`/`STOPPED`/`READY`）を報告します - `FixtureMachineReader` フォールバックだけではありません。詳細は `docs/API.md` を参照。*(実装済み)*
* 🌐 **HTTP インターフェース：** 簡単な RESTful クエリでアクセス可能で、統合が容易です。*(実装済み)*
* 🔍 **エージェント互換性：** 仕様どおりの形式の XML を出力することを検証済みです（正しい名前空間、一貫した `Device`/`DataItem` の id、共有された `instanceId` - `tests/server.test.ts` を参照）——実際のサードパーティ製 MTConnect エージェント/コレクターに対する実機テストはまだ行われていません。
* 📐 **実際の単位/品質マッピング：** 各 DataItem のネイティブ単位、品質、UTC タイムスタンプ、エラーコードは、実際のバージョン管理されたマッピングによって計算されます——ハードウェアなしでテスト可能です。*(実装済み)*
* 🩹 **デグレードモード出力：** ダウンしている、または無効なデータを報告するソースは、クラッシュや古いデータではなく MTConnect 本来の `UNAVAILABLE` 値で表現されます。ドキュメントは公式スキーマに対して有効なままです。
* 🧮 **観測バッファ：** DataItem の変化はそれぞれ固有のシーケンス番号を持つ観測となり、`MTCONNECT_BUFFER_SIZE` 件の観測を保持するバッファに格納されます。`GET /sample?from=<nextSequence>&count=<n>` はそれ以降に起きたことだけを返すため、クライアントのループが変化を取りこぼしたり重複して受け取ることはありません。*(実装済み)*
* 🧪 **架空のデータなし：** `HYDRA_UMC_SERVER_URL` が無い場合、すべての DataItem は `UNAVAILABLE` です。合成のデモ値は `HYDRA_UMC_MTCONNECT_DEMO=1` のときだけ提供され、デバイスの説明にもその旨が示されます。*(実装済み)*
* 🧩 **コンディション・デバイス別ルート・HTTP ステータス:** CONDITION の DataItem は Normal、Warning、Fault、Unavailable として(メッセージとネイティブコード付きで)出力され、デバイスが持つ場合は `/probe` で宣言されます。デバイスは `ASSET_CHANGED` と `ASSET_REMOVED` を宣言します(アセットはないので UNAVAILABLE のままです)。`/HydraNode_1/probe`、`/current`、`/sample` はそのデバイスについて応答します。`HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1` は MTConnectError に 200 の代わりに HTTP 400 または 404 を付けます(既定では無効)。すべて公式 XSD で検証済みです。 *(実装済み)*
* 🔌 **cppagent 向け SHDR 出力:** `HYDRA_UMC_MTCONNECT_SHDR_PORT` を設定すると、アダプターは同じ観測値を SHDR 行(`時刻|dataItemId|値`、コンディションは `時刻|id|レベル|ネイティブコード|||メッセージ`)として TCP でも提供し、市販の MTConnect エージェントが読み取れます。クライアントはまず各 DataItem の最新値を受け取り、その後は変更のたびに受け取ります。送信できる行は `* PING` のみで、`* PONG` が返ります。読み取り専用です。`HYDRA_UMC_MTCONNECT_SHDR_HOST` で指定しない限り `127.0.0.1` で待ち受けます。模擬エージェントでテスト済みです。 *(実装済み、実際の cppagent では未確認)*
* 🔌 **CNC ブリッジの SHDR ストリームを読む(任意):** `HYDRA_UMC_MTCONNECT_SHDR_SOURCE=host:port` を設定すると、エージェントは別のアダプターの SHDR 出力から機械の実行状態と可用性を取得します。接続が切れると、最後の値ではなくすべての DataItem を利用不可として示します。読み取り専用です。

## 🧩 HYDRA-UMC での役割

**HYDRA-UMC-MTCONNECT-ADAPTER** は、工場の監視ソフトウェアに対してロボットを MTConnect デバイスとして見せます。`HYDRA-UMC-SERVER` から取得した状態を、読み取り専用の XML over HTTP（`/probe`、`/current`、`/sample`）で提供します。どの機械にもコマンドを送りません。

## 🏛️ アーキテクチャ

<p align="center">
  <img src="images/architecture.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER architecture" width="100%">
</p>

<details>
<summary>図のテキスト版（Mermaid）</summary>

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["XML / HTTP Stream"]
    XML --> AGENT["MTCONNECT-AGENT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Industrial Monitor / ERP"]
```

</details>

### アーキテクチャと設計上の決定

* **HYDRA-UMC-GATEWAY-INDUSTRIAL のサブモジュールではなく兄弟プロジェクトである理由。** 各プロトコルアダプターは個別にデプロイ/再起動可能なプロセスです——MTConnect XML 生成の問題が、それと並行して動作する OPC-UA や MQTT アダプターをダウンさせることは決してありません。
* **汎用の XML エクスポートではなく、実際の MTConnect デバイス/エージェントストリームである理由。** MTConnect 対応の工場用ソフトウェア（多くの CNC/MES ツール）は、その標準が定義する特定のデバイス/エージェント/コンポーネントスキーマを期待します——汎用エクスポートでは受信側にカスタムパーサーが必要になり、MTConnect を話す意味を失わせます。
* **エントリポイントが今日は身元/バージョンのみを表示し、ヘルスチェックリスナーが起動した後で終了する理由。** 足場（アンダミアヘ、スキャフォールディング）段階にあり、親プロジェクト自身の README と同じ理由です——実際のアダプターはその性質上長時間稼働します。
* **エコシステムの他の部分との関係。** HYDRA-UMC-GATEWAY-INDUSTRIAL の下の兄弟サービスです——HYDRA-UMC-SERVER 自身の状態を実際の MTConnect デバイス/エージェントフィードへと変換します。
* **コンパイルチェックだけでなく、実際のHTTPテスト。** `tests/server.test.ts` は `supertest`(実際のリスニングソケット上での実際のHTTPリクエスト)を使用して、`GET /probe` と `GET /current` が仕様どおりの形のXMLを、一致する名前空間、両ドキュメント間で一貫した `Device`/`DataItem` の id、共有された `instanceId` とともに返すことを検証します。
* **単位変換、品質分類、マシンの読み取りが3つの独立したモジュールである理由。** `src/units.ts`（純粋な変換演算）、`src/dataitem.ts`（品質/タイムスタンプ/エラーコードのマッピング）、`src/reader.ts`（`MachineReader` のポーリング/キャッシング）は、それぞれハードウェアや HTTP なしで単独でテスト可能です——これはまさに明示的な懸念事項です。完全な HTTP 往復を通じて発見される単位変換のバグは、切り分けに時間がかかり、見落としやすいのです。
* **劣化した DataItem が独自のエラー形式ではなく MTConnect 本来の `UNAVAILABLE` 値で表現される理由。** MTConnect のエージェントやクライアントは `UNAVAILABLE` の表示方法をすでに知っています。仕様自身の語彙を再利用すれば、下流のツールは今日からきれいに縮退できます。理由（データなし、単位変換、ソース停止、古いデータ）はドキュメントに含めません。公式スキーマにはそのための属性が無く、検証を行うパーサーは余分な属性を持つドキュメントを拒否するためです。
* **`CachedReader` のポーリング上限が `spindle_temp` にハードコードされておらず、汎用的である理由。** この環境にはまだ実際のマシンソースが存在しませんが、それが防いでいる実際のリスク——`/current` が呼び出されるたびに数十年前のコントローラーにリクエストを浴びせること——は、いずれ `FixtureMachineReader` を置き換えることになるどのソースにも当てはまります。そのため、このスロットルは個々の DataItem 自身の処理の中ではなく、`MachineReader` インターフェースのレベルに存在します。

## ⚙️ 設定

待ち受けポートは、まず `HYDRA_UMC_MTCONNECT_PORT` から読み取ります（既定は 5000）。共有の `PORT` は最後の手段として引き続き使え、警告を表示します。そのため、複数のサービスで共有する環境ファイルがエージェントを他のサービスのポートへうっかり移すことはありません。設定されていても有効なポートでない値は起動を止め、コンテナのヘルスチェックも同じ順序に従います。

## 🚀 クイックスタート

Node.js 20 以上と npm が必要です。

```bash
npm install
npm test
npm run build
npm start
curl http://127.0.0.1:5000/probe
```

## 🧪 テスト

`npm test` で自動テスト 131 件を実行します。 ハードウェアも、このマシンの外にあるものも必要ありません。

CI は `HYDRA_UMC_CI=1 python tools/ci_validate.py` を実行し、マニフェスト、文書、8 つの README、図を検査します。

## 🏗️ ビルドとリリース

### 必要条件
- [Node.js](https://nodejs.org/)（v20 以上を推奨）
- npm

### インストール
```bash
npm install
```

### 開発モード
`tsx` を使用してアダプターを直接実行します（バンドラーなし）：
- **Windows：** `dev.bat` をダブルクリックするか、`npm run dev` を実行
- **Linux/Mac：** `./dev.sh` または `npm run dev` を実行

### プロダクションビルド
esbuild を使用してアダプターを単一のデプロイ可能なファイルにバンドル
します：
- **Windows：** `build.bat` をダブルクリックするか、`npm run build` を実行
- **Linux/Mac：** `./build.sh` または `npm run build` を実行

その後、次のコマンドで起動します：
```bash
npm start
```

アダプターは `0.0.0.0:5000` でリッスンします——任意の MTConnect
エージェント/コレクターは `GET http://<host>:5000/probe`（静的な
デバイスモデル）、`GET http://<host>:5000/current`（最新の
DataItem 値）、そして `GET http://<host>:5000/sample?from=<sequence>`
（本物で正直なストリーミングバッファのセマンティクス - 詳細は
`docs/API.md` を参照）を照会できます。

実際のロボットを報告するには `HYDRA_UMC_SERVER_URL` を設定します。HYDRA-UMC-SERVER は `GET /api/settings` にログイン済みのアカウントにしか応答しないため、アダプターにも認証情報を渡します。`HYDRA_UMC_SERVER_TOKEN`（サーバーがすでに発行したトークン）、または `HYDRA_UMC_SERVER_USER` と `HYDRA_UMC_SERVER_PASSWORD`（アダプターが自分でログインし、セッションの有効期限が切れると再度ログインします）。どちらもない場合、ソースは利用不可（`SOURCE_UNAVAILABLE`）として報告されます。`HYDRA_UMC_MTCONNECT_HOST` は待ち受けアドレスを絞ります（既定は `0.0.0.0`）。たとえばローカルのリバースプロキシの背後なら `127.0.0.1` にします。サーバーからの応答は 4 MiB まで読み取ります。

### バージョン管理
`npm run build` はサーバーをバンドルするだけです。バージョンを上げるのは `python tools/hydra_project_tool.py bump`（`bump_manifest_version.py` 経由）だけで、ビルドは変更しません。

## 📂 リポジトリの構成

<p align="center">
  <img src="images/repository-structure.svg" alt="Repository structure of HYDRA-UMC-MTCONNECT-ADAPTER" width="100%">
</p>

<details>
<summary>ツリーのテキスト版</summary>

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/                       ソースコード（Node/TypeScript —— アダプター、マッパー、HTTP）
├── tests/                     Vitest スイート —— data item マッピング、単位、reader/サーバーの動作
├── docs/                      プロジェクトの文書
├── images/                    メディアと図表
├── schemas/                   mtconnect-1.7/: 応答の検証に使う MTConnect 1.7 の XSD スキーマ (NOTICE 付き)
├── scripts/                   ユーティリティスクリプト（bump-version.mjs）
├── tools/                     build_test.py (バージョンを変えないビルド確認)、ci_validate.py (CI が使うマニフェスト/CHANGELOG/ドキュメントの検証)、hydra_project_tool.py、共有の _doc_policy.py と _readme_parity.py
├── .github/                   CI ワークフローと Issue テンプレート
├── CHANGELOG.md               各バージョンの変更点
├── Dockerfile                 コンテナイメージ
├── build-test.sh              変更を伴わないビルド確認
├── build.sh                   ビルドと検査。バージョンは変更しない
├── bump_manifest_version.py   マニフェストのバージョンを同期
├── dev.sh                     開発モード
├── hydra-umc.project.json     マニフェスト：バージョン、成熟度、ファミリー
├── package.json               パッケージのメタデータとスクリプト
└── test.sh                    テストを実行
```

</details>

## 🗺️ ロードマップと既知の制限

**現時点の既知の制限**

* **フェーズ 1：** 高速データ交換とレガシープロトコルブリッジングのための OPC-UA パブリッシュ/サブスクライブ実装。
* **フェーズ 2：** 大量の IoT デバイス管理と高い並行性のための MQTT Broker クラスター。
* **フェーズ 3：** マルチベンダーの CNC および PLC 機械統合のための MTConnect アダプターサポート。
* **フェーズ 4：** MTConnect のマルチデバイス集約と標準化された XML/HTTP テレメトリストリーミングのサポート。

## 🌍 言語

この README とリポジトリの文書は、英語・スペイン語・ドイツ語・フランス語・イタリア語・日本語・中国語・ポルトガル語（ポルトガル）の 8 言語で提供されています。8 つのファイルは同時に書かれ、同じ節と同じリンクを持つことを CI が確認します。 このリポジトリには独自の画面もメッセージカタログもないため、翻訳すべきインターフェース文字列はありません。

## 🔗 関連プロジェクト

本プロジェクトは、同じ作者(JuanenRac / Electro Hobby 3D)による HYDRA-UMC ロボティクスエコシステムの一部です。リクエストが実はこの中のどれかについてのものである可能性があるため、知っておく価値があります。

**親プロジェクト**
- **[HYDRA-UMC-GATEWAY-INDUSTRIAL](https://github.com/JuanenRac/HYDRA-UMC-GATEWAY-INDUSTRIAL)** — 実際のコマンド許可リスト/バックプレッシャー層を持つ、産業用プロトコルへ中継する統合ハブ。本リポジトリは、その自身の産業用ゲートウェイ内における特定のプロトコルアダプターとして、この親の一部を成す。

**兄弟プロジェクト** —— HYDRA-UMC-GATEWAY-INDUSTRIAL 自身の産業用ゲートウェイにおける他のプロトコルアダプター
- **[HYDRA-UMC-OPCUA-SERVER](https://github.com/JuanenRac/HYDRA-UMC-OPCUA-SERVER)** — 実際のバイナリプロトコルクライアントセッションで検証された、実際の OPC-UA アドレス空間。
- **[HYDRA-UMC-MQTT-BROKER](https://github.com/JuanenRac/HYDRA-UMC-MQTT-BROKER)** — クライアント単位のオプション認証とトピック ACL を備えた、実際の MQTT ブローカー。

**直接関連**
- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — すべての制御クライアントが実際に通信する、本物のヘッドレスバックエンド(REST/WebSocket) ——本アダプターが公開する状態の情報源。

**エコシステムの他のプロジェクト**

*コアハードウェア&プラットフォーム*
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — ロボットアームのマザーボードの設計——CM5 ホスト + デュアルコア STM32H745、CAN-OTA/SPI-OTA 経由で最大 8 本のツールアームを統括することを目指す(ファームウェアは初期段階で、実装済みの基板はまだない)。
- **[HYDRA-UMC-OS](https://github.com/JuanenRac/HYDRA-UMC-OS)** — CM5 向けの再現可能な Raspberry Pi OS プロダクト層——読み取り専用エージェント、検証済み設定/プロファイル、WiFi 初回接続プロビジョニング。
- **[HYDRA-UMC-SDK](https://github.com/JuanenRac/HYDRA-UMC-SDK)** — すべてのブリッジが自身のコマンドを検証する共有 JSON-Schema 契約とソフトウェアのジョブゲート境界(認証済みの安全機能ではない)。
- **[HYDRA-UMC-CONNECTOR-HUB](https://github.com/JuanenRac/HYDRA-UMC-CONNECTOR-HUB)** — 外部マシン用コネクタのための宣言的アダプターマニフェストのレジストリとバリデーター。SDK 自身の契約という発想を外部マシンにまで拡張し、産業用ゲートウェイ系のプロジェクトを置き換えることはありません。

*コアバックエンド&クライアント*
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — リアルタイムのマルチロボット 3D 可視化を備えたウェブ制御ダッシュボード。
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — 複数のサーバーを同時に扱えるデスクトップ(PySide6)スウォームコマンドセンター、スタンドアロン実行ファイルとしてパッケージ化。
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — 生体認証ログインとペアリングされた Wear OS コンパニオンを備えたネイティブ Android 制御アプリ。
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — リアルタイム WebSocket 同期を備えた iOS/iPadOS 制御アプリ(Flutter)。
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — 本体搭載の 7 インチ DSI タッチスクリーン向けネイティブタッチ UI、CM5 自体に組み込み。
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — 完成したモデルを STUDIO 自身のカタログへ送信するデスクトップ用グラフィカル URDF 作成/編集ツール。
- **[HYDRA-UMC-EDITOR-STL](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-STL)** — HYDRA-UMC-EDITOR-URDF も編集する同じモデルカタログ内で、実在するパーツを変換/置換/削除/追加するデスクトップ STL モデルエディタ。
- **[HYDRA-UMC-BRIDGE-AMR](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-AMR)** — VDA 5050 MQTT パブリッシャーによる AGV/AMR フリートの調整境界(エミュレートしたフリートに対してのみテスト済み)。
- **[HYDRA-UMC-BRIDGE-CNC](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-CNC)** — GRBL ステータス/制御バイトへのアクセスを持つ、CNC セルの高レベルコーディネーター(エミュレーターに対してのみテスト済み)。
- **[HYDRA-UMC-BRIDGE-DROIDS](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-DROIDS)** — Boston Dynamics Spot コマンド送信機能を持つ、脚型/ヒューマノイドドロイドの調整境界(エミュレーターに対してのみテスト済み)。
- **[HYDRA-UMC-BRIDGE-LASER](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-LASER)** — キー/筐体/インターロックの GPIO 信号 3 系統を読み取るレーザーセルのコーディネーター(模擬チップに対してのみテスト済み。レーザーの武装や発射はできない)。
- **[HYDRA-UMC-BRIDGE-OPENPNP](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-OPENPNP)** — OpenPnP ピックアンドプレースの基板フローを安全に統括する高レベルコーディネーター。
- **[HYDRA-UMC-BRIDGE-PRINTER3D](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-PRINTER3D)** — 実際にゲート制御されたジョブコマンドを持つ、Moonraker/Klipper 3D プリンター向けの安全な調整境界。
- **[HYDRA-UMC-BRIDGE-ROS2](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-ROS2)** — 遅延インポートの rclpy ROS 2 トランスポートを持つコーディネーター(ROS 2 環境ではまだ実行していない)。
- **[HYDRA-UMC-BRIDGE-UAV](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-UAV)** — MAVLink コマンド送信機能を持つ、カメラ搭載 UAV の調整境界(エミュレーターに対してのみテスト済み)。

*URTC ツールプラットフォーム*
- **[URTC](https://github.com/JuanenRac/URTC)** — 物理的な Universal Robot Tool Controller 基板向けファームウェア、CAN バス経由の 25 以上のツールプロファイル。
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — URTC 基板用のデスクトップ GUI 書き込みツール、CAN-OTA およびフルチップ SWD/JTAG。
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — URTC 基板向けのデスクトップ CAN バスライブ診断ツール、ツールプロファイルごとに 1 パネル。
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — Web Serial API を使ったブラウザベースの URTC-TESTER の代替、ローカルインストール不要。
- **[URTC-GATEWAY](https://github.com/JuanenRac/URTC-GATEWAY)** — URTC の CAN バスの前に置くゲートウェイ：許可する識別子のリスト、レート制限、セッション鍵。コンピューター上でテスト済みで、実際のバスではまだ試していません。

*ビジョン AI ノード(Hailo-8)*
- **[HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)** — Hailo-8 ビジョンパイプラインの統合ハブ、段階ごとの実際のハードウェア準備状況チェック付き。
- **[HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)** — Hailo アーキテクチャ/チェックサムによる安全読み込み検証を備えた、実際のコンパイル済みモデルレジストリ。
- **[HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)** — 実際の HailoRT 統合境界を持つ、実際の GStreamer パイプライン + MediaMTX 設定生成器。
- **[HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)** — ゾーン状態を条件に承認する Position-Based Visual Servoing 補正則。カメラによる姿勢推定はまだない。
- **[HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)** — ファイルから物体位置を受け取る、ゾーン侵入・キャリブレーション鮮度・E-STOP 要求の v0 ロジック。検出器は接続されておらず、物理 E-STOP もまだ配線されていない。

*コグニティブ AI ノード(Hailo-10)*
- **[HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)** — Hailo-10 コグニティブパイプライン(LLM/VLA/音声オーケストレーション)の統合ハブ。
- **[HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)** — Vision-Language-Action モデル向けの、実際のアクショントークンのエンコード/デコードと軌道生成。
- **[HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)** — 確認ゲート付きの限定的な Watch リレーを備えた、実際の音声フロントエンド(VAD + 意図解析)。
- **[HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)** — MCU エラーコードに対する、実際のルールベースのタスク分解と意味的エラー復旧。
- **[HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)** — このエコシステム自身の Markdown ドキュメントに対する、標準ライブラリのみの実際の TF-IDF 文書検索。
- **[HYDRA-UMC-LOCAL-TECHNICIAN](https://github.com/JuanenRac/HYDRA-UMC-LOCAL-TECHNICIAN)** — エコシステム自身のための、ローカルでポリシーゲート付きのAIメンテナンス技術者 — 観察、診断し、修正を提案する;最上位の2つのリスクレベルは意図的にまだ実装されていない。

*オーケストレーション&スウォーム*
- **[HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)** — 実際の gRPC/Protobuf ヘルスレポート契約とミッションステートマシンを持つ統合ハブ。
- **[HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)** — 実際の HTTP API 上に構築された、優先度ベースの実際のジョブキュー(重複排除付き)。
- **[HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)** — リトライ/バックオフとアイデンティティ不一致検出を備えた、実際の gRPC ベースのフリートヘルスウォッチドッグ。
- **[HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)** — 実際の障害物/ワークスペース衝突検証を備えた、実際の RRT ベースの 3D 経路プランナー。
- **[HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)** — 複数セルの収束についてプロパティテストされた、実際の CRDT LWW-Element-Map 状態同期。

*デジタルツイン&シミュレーション*
- **[HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)** — 実際のバージョン互換性同期契約を持つ、デジタルツインエンジンの統合ハブ。
- **[HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)** — シミュレーションと実機の間にソフトウェアの衝突インターロックを備えたハードウェア・イン・ザ・ループのルーター(実機なしでテスト済み)。
- **[HYDRA-UMC-PHYSICS-REPLICA](https://github.com/JuanenRac/HYDRA-UMC-PHYSICS-REPLICA)** — 実際の URDF サブセットに対する、実際の順運動学と関節限界検証。
- **[HYDRA-UMC-SYNTHETIC-DATA-GEN](https://github.com/JuanenRac/HYDRA-UMC-SYNTHETIC-DATA-GEN)** — YOLO/COCO アノテーションのエクスポート機能を持つ、実際のプロシージャル 2D シーンジェネレーター。

*データ&分析*
- **[HYDRA-UMC-DATALAKE](https://github.com/JuanenRac/HYDRA-UMC-DATALAKE)** — 実際の取り込み/クエリ HTTP API を備えた、実際の sqlite3 ベースの時系列ストア。
- **[HYDRA-UMC-ANOMALY-DETECTOR](https://github.com/JuanenRac/HYDRA-UMC-ANOMALY-DETECTOR)** — ドリフト監視を備えた、実際の FFT + 統計ベースラインによる異常検知器。
- **[HYDRA-UMC-PRODUCTION-REPORTS](https://github.com/JuanenRac/HYDRA-UMC-PRODUCTION-REPORTS)** — DATALAKE の履歴に対する実際の OEE/稼働率計算、再現可能な CSV エクスポート付き。
- **[HYDRA-UMC-TELEMETRY-COLLECTOR](https://github.com/JuanenRac/HYDRA-UMC-TELEMETRY-COLLECTOR)** — シーケンス重複排除機能を備えた、DATALAKE への実際の CAN/WebSocket 取り込みパイプライン。

*補完ツール&エコシステム運用*
- **[HYDRA-UMC-DASHBOARD-AI](https://github.com/JuanenRac/HYDRA-UMC-DASHBOARD-AI)** — 誠実な統計フォールバックを備えた、DATALAKE/ANOMALY-DETECTOR 上のスマートサマリーと異常ハイライトパネル。
- **[HYDRA-UMC-TOOL-CLI](https://github.com/JuanenRac/HYDRA-UMC-TOOL-CLI)** — 実際の安定した終了コード契約を持つフリート CLI、HYDRA-UMC-SERVER 自身の API の本物のライブクライアント。
- **[HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)** — 触覚アラートのパターンとペアリング済みスマートフォンへの音声リレーを備えた WearOS コンパニオンアプリ(物理的なウォッチではまだ実行していない)。
- **[URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)** — 実際の工具 ID デコードと Smart Idle 予熱ロジックを備えた、基板搭載ラック用ファームウェア。
- **[URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)** — サーマル/RGB 検査ツールヘッド向けの、ファームウェアと実際の Python ビジョンコンパニオン。
- **[HYDRA-UMC-UPDATER](https://github.com/JuanenRac/HYDRA-UMC-UPDATER)** — このエコシステム内のすべてのリポジトリを検出・クローン・更新する、管理用デスクトップツール。
- **[HYDRA-UMC-OS-REBUILDER](https://github.com/JuanenRac/HYDRA-UMC-OS-REBUILDER)** — エコシステムの最新バージョンをプリロードした、書き込み可能なCM5イメージを構築するWindows/Linuxデスクトップツール。Raspberry Pi Imager方式の初回起動Wi-Fi/ユーザー/SSH設定を備える。
- **[HYDRA-UMC-OPS-AGENT](https://github.com/JuanenRac/HYDRA-UMC-OPS-AGENT)** — 保守インシデントコーディネーター: 低権限のエッジ役割がサニタイズされたインベントリ/ヘルスのスナップショットを収集し、コントロールプレーン役割がそれを読み取り専用でレンダリングして AI プロバイダーに診断の提案を依頼します - パッチを適用することも、何かをデプロイすることも決してありません。
- **[HYDRA-UMC-DEV-SERVER](https://github.com/JuanenRac/HYDRA-UMC-DEV-SERVER)** — 再現可能な開発ホスト（Raspberry Pi 5 / CM5）。エコシステムのソースコードを保管し、永続キューのもとで境界の明確なビルド/テストタスクを実行する。運用中の CM5 とは明確に異なる、開発専用の役割。

## 📚 ドキュメント

さらに読むには：

* **[docs/API.md](docs/API.md)** —— 実際の HTTP エンドポイントリファレンス: `GET /probe`/`GET /current`/`GET /sample` のリクエスト/レスポンス形式、完全な XML エンベロープの例、2 つの実際の `MachineReader` 実装（`FixtureMachineReader`/`HydraServerMachineReader`）、そしてまだプレースホルダーのままの部分についての明示的な説明（固定された唯一の HydraNode - ロボットごとに1台の Device を持つ動的なツリーは、別途大きな作業です）。
* [エコシステムのセキュリティ基準](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md)
* [エコシステムの脅威モデル](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md)
* [このリポジトリの変更履歴](CHANGELOG.md)
* [このリポジトリのライセンス](LICENSE.md)

## 🤝 コントリビュートとコミュニティ

* プルリクエストの前に `HYDRA_UMC_CI=1 py -3 tools/ci_validate.py`（または `HYDRA_UMC_CI=1 python3 tools/ci_validate.py`）を実行してください。`CI_VALIDATION=PASS` と表示される必要があります。この確認に `build.sh` や `build.bat` は使わないでください。ビルドは検査ではありません。
* 8 つの README は HYDRA-UMC-DOCS の 1 つのソースから書かれます。手で編集しないでください。ソースを変更し、`tools/make_readmes.py` で書き直します。
* 実行していないことを README に書かないでください。事実であれば「シミュレーションのみ」「実機では未確認」と書きます。
* [CONTRIBUTING.md](CONTRIBUTING.md)、[行動規範](CODE_OF_CONDUCT.md)、[SECURITY.md](SECURITY.md)、[SUPPORT.md](SUPPORT.md) を参照してください。

## 👤 作者

**JuanenRac (Electro Hobby 3D)** · electrohobby3d@gmail.com

## 📜 ライセンス

GPL-3.0-or-later - [LICENSE](LICENSE).
