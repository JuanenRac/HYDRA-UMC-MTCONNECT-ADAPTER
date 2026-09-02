<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | <a href="README_fra.md">🇫🇷 Français</a> | <a href="README_ita.md">🇮🇹 Italiano</a> | <a href="README_deu.md">🇩🇪 Deutsch</a> | <a href="README_zho.md">🇨🇳 简体中文</a> | 🇯🇵 <b>日本語</b></p>

### 🛠️ 工作機械監視のための標準化された XML/HTTP インターフェース

<p align="left">
  <img src="https://img.shields.io/badge/Licencia-GPL%203.0-blue.svg" alt="GPL 3.0">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="MTConnect">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="XML/HTTP">
</p>

---

## 1. 🛠️ 技術概要

**HYDRA-UMC-MTCONNECT-ADAPTER** は、工作機械監視のためのレガシーかつ
工場標準のブリッジです。MTConnect プロトコル（ANSI/MTC1.4）を実装し、
ロボットスウォームを一連の標準化された工作機械として公開します。

読み取り専用の XML/HTTP インターフェースを提供し、従来の産業用
ソフトウェアが専用ドライバーを必要とせずに、すべての HydraNode の
実行状態、工具位置、センサーデータを監視できるようにします。

### 主な機能：
* 🏭 **標準化されたマシンデータ：** Hydra ロボットを MTConnect 準拠のデバイスとして公開します。
* 📄 **XML データストリーム：** 標準の XML 形式による定期的かつイベント駆動型の更新。
* 🌐 **HTTP インターフェース：** 簡単な RESTful クエリでアクセス可能で、統合が容易です。
* 🔍 **エージェント互換性：** 既存の MTConnect エージェントやコレクターとシームレスに連携します。
* 📐 **実際の単位/品質マッピング：** 各 DataItem のネイティブ単位、品質、UTC タイムスタンプ、エラーコードは、実際のバージョン管理されたマッピングによって計算されます——ハードウェアなしでテスト可能です。*(実装済み)*
* 🩹 **デグレードモード出力：** ダウンしている、または無効なデータを報告しているソースは、クラッシュや古いデータではなく、MTConnect 自身の実際の `UNAVAILABLE` 値をエラーコード付きでレンダリングします。*(実装済み)*

---

## 2. 🔄 MTConnect データフロー

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["XML / SHDR Stream"]
    XML --> AGENT["MTCONNECT-AGENT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Industrial Monitor / ERP"]
```

---

## 3. 🧱 アーキテクチャと設計上の決定

* **HYDRA-UMC-GATEWAY-INDUSTRIAL のサブモジュールではなく兄弟プロジェクトである理由。** 各プロトコルアダプターは個別にデプロイ/再起動可能なプロセスです——MTConnect XML 生成の問題が、それと並行して動作する OPC-UA や MQTT アダプターをダウンさせることは決してありません。
* **汎用の XML エクスポートではなく、実際の MTConnect デバイス/エージェントストリームである理由。** MTConnect 対応の工場用ソフトウェア（多くの CNC/MES ツール）は、その標準が定義する特定のデバイス/エージェント/コンポーネントスキーマを期待します——汎用エクスポートでは受信側にカスタムパーサーが必要になり、MTConnect を話す意味を失わせます。
* **エントリポイントが今日は身元/バージョンのみを表示し、ヘルスチェックリスナーが起動した後で終了する理由。** 足場（アンダミアヘ、スキャフォールディング）段階にあり、親プロジェクト自身の README と同じ理由です——実際のアダプターはその性質上長時間稼働します。
* **エコシステムの他の部分との関係。** HYDRA-UMC-GATEWAY-INDUSTRIAL の下の兄弟サービスです——HYDRA-UMC-SERVER 自身の状態を実際の MTConnect デバイス/エージェントフィードへと変換します。
* **コンパイルチェックだけでなく、実際のHTTPテスト。** `tests/server.test.ts` は `supertest`(実際のリスニングソケット上での実際のHTTPリクエスト)を使用して、`GET /probe` と `GET /current` が仕様どおりの形のXMLを、一致する名前空間、両ドキュメント間で一貫した `Device`/`DataItem` の id、共有された `instanceId` とともに返すことを検証します。
* **単位変換、品質分類、マシンの読み取りが3つの独立したモジュールである理由。** `src/units.ts`（純粋な変換演算）、`src/dataitem.ts`（品質/タイムスタンプ/エラーコードのマッピング）、`src/reader.ts`（`MachineReader` のポーリング/キャッシング）は、それぞれハードウェアや HTTP なしで単独でテスト可能です——これはまさに昇格監査自身が懸念する点です。完全な HTTP 往復を通じて発見される単位変換のバグは、切り分けに時間がかかり、見落としやすいのです。
* **デグレードした DataItem が、独自のエラー形式ではなく MTConnect 自身の実際の `UNAVAILABLE` 値をレンダリングする理由。** MTConnect のエージェントやコレクターは、すでに `UNAVAILABLE` の表示方法を知っています——仕様自身の語彙を再利用することは、HYDRA-UMC 独自の規約を教え込まれるのを待たずに、実際の下流ツールが今日から適切に劣化できることを意味します。`errorCode` 属性（`NO_DATA`/`UNIT_CONVERSION_ERROR`/`SOURCE_UNAVAILABLE`）は、実際の診断のために本プロジェクト自身が追加した v0 拡張であり、標準の MTConnect 属性として提示するのではなく、そのようなものとして文書化されています。
* **`CachedReader` のポーリング上限が `spindle_temp` にハードコードされておらず、汎用的である理由。** この環境にはまだ実際のマシンソースが存在しませんが、それが防いでいる実際のリスク——`/current` が呼び出されるたびに数十年前のコントローラーにリクエストを浴びせること——は、いずれ `FixtureMachineReader` を置き換えることになるどのソースにも当てはまります。そのため、このスロットルは個々の DataItem 自身の処理の中ではなく、`MachineReader` インターフェースのレベルに存在します。

---

## 📂 リポジトリ構成

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/         # ソースコード（Node/TypeScript —— アダプター、マッパー、HTTP）
├── docs/        # ドキュメントとセットアップガイド
├── build/       # コンパイル出力（npm run build）
├── images/      # メディアと図表
├── scripts/     # ユーティリティスクリプト（bump-version.mjs）
└── README.md
```

純粋なネットワークサービスであり、独自の専用ハードウェアを持ちません
——`hardware/`、`firmware/`、`os/` は元のプロジェクトテンプレートから
省略されており、リポジトリ構造ポリシーに従っています。

---

## 🛠️ 開発環境

### 必要条件
- [Node.js](https://nodejs.org/)（v18 以上を推奨）
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
デバイスモデル）と `GET http://<host>:5000/current`（最新の
DataItem 値）を照会できます。

### バージョン管理
実際の `npm run build` のたびに、`package.json` 自身の `version` が
自動的に増加します（`scripts/bump-version.mjs`、`build` スクリプトの
最初のステップとして接続）——10 進法の「オドメーター」方式：ビルド
ごとに patch を +1 し、9 を超えると minor に繰り上がり（minor が 9 を
超えると major に繰り上がる）、2 桁のセグメントに到達することはあり
ません（`0.0.9` -> `0.1.0`、`0.0.10` にはなりません）。

---

## 🚀 ロードマップ
* **フェーズ 1：** 高速データ交換とレガシープロトコルブリッジングのための OPC-UA パブリッシュ/サブスクライブ実装。
* **フェーズ 2：** 大量の IoT デバイス管理と高い並行性のための MQTT Broker クラスター。
* **フェーズ 3：** マルチベンダーの CNC および PLC 機械統合のための MTConnect アダプターサポート。
* **フェーズ 4：** MTConnect のマルチデバイス集約と標準化された XML/HTTP テレメトリストリーミングのサポート。

---

## 🔗 関連プロジェクト

本プロジェクトは、同一著者（JuanenRac / Electro Hobby 3D）による、
ファームウェア、制御ソフトウェア、AI ノード、フリート管理ツールにまたがる、
より大きなロボティクスエコシステムの一部です。ご要望が実際にはこれらの
プロジェクトのいずれかに関するものであり、本リポジトリのものではない
可能性もあるため、知っておく価値があります。

### プロジェクトファミリー

**親プロジェクト：** **[HYDRA-UMC-GATEWAY-INDUSTRIAL](https://github.com/JuanenRac/HYDRA-UMC-GATEWAY-INDUSTRIAL)** —— 本 MTConnect アダプターが接続する統合親プロジェクト。

**兄弟プロジェクト：**
- **[HYDRA-UMC-OPCUA-SERVER](https://github.com/JuanenRac/HYDRA-UMC-OPCUA-SERVER)** —— 同じ親プロジェクトを持つ兄弟プロトコルアダプター。
- **[HYDRA-UMC-MQTT-BROKER](https://github.com/JuanenRac/HYDRA-UMC-MQTT-BROKER)** —— 同じ親プロジェクトを持つ兄弟プロトコルアダプター。

### 直接関連（ファミリー外）

- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** —— 本アダプターが公開する状態の発生源。

### エコシステムのその他のプロジェクト

**HYDRA-UMC プラットフォーム** — マルチロボット・マイクロファクトリーセル
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — 最大 8 台のロボットアームを統括する CM5 + STM32H745 マザーボード。
- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — すべての制御クライアントが接続する Express/WebSocket バックエンド。
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — Web ベースの制御ダッシュボード、マルチロボット 3D 可視化。
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — Wi-Fi/Bluetooth 経由の Android 制御アプリ。
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — Flutter で構築された iOS/iPadOS 制御アプリ。
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — デスクトップ版群制御コマンドセンター（Python/PySide6）。
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — ロボットカタログ向けのデスクトップ版 URDF モデルエディター。
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — 機載 DSI タッチスクリーン用のネイティブタッチ UI。

**URTC プラットフォーム** — すべての HYDRA-UMC ロボットアームが搭載するツールヘッドコントローラー
- **[URTC](https://github.com/JuanenRac/URTC)** — CAN バスツールヘッドコントローラー、25 種類のツールプロファイル。
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — デスクトップ版 CAN-OTA + SWD/JTAG フラッシュツール。
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — デスクトップ版ライブ CAN バス診断ツール。
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — Web Serial API によるブラウザベースの代替版。

**🎥 ビジョン AI ノード（Hailo-8）**
- [HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)
- [HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)
- [HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)
- [HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)
- [HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)

**🧠 認知 AI ノード（Hailo-10）**
- [HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)
- [HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)
- [HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)
- [HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)
- [HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)

**🐝 オーケストレーションと群制御**
- [HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)
- [HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)
- [HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)
- [HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)
- [HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)

**🎮 デジタルツインとシミュレーション**
- [HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)
- [HYDRA-UMC-PHYSICS-REPLICA](https://github.com/JuanenRac/HYDRA-UMC-PHYSICS-REPLICA)
- [HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)
- [HYDRA-UMC-SYNTHETIC-DATA-GEN](https://github.com/JuanenRac/HYDRA-UMC-SYNTHETIC-DATA-GEN)

**📊 データと分析**
- [HYDRA-UMC-DATALAKE](https://github.com/JuanenRac/HYDRA-UMC-DATALAKE)
- [HYDRA-UMC-TELEMETRY-COLLECTOR](https://github.com/JuanenRac/HYDRA-UMC-TELEMETRY-COLLECTOR)
- [HYDRA-UMC-ANOMALY-DETECTOR](https://github.com/JuanenRac/HYDRA-UMC-ANOMALY-DETECTOR)
- [HYDRA-UMC-PRODUCTION-REPORTS](https://github.com/JuanenRac/HYDRA-UMC-PRODUCTION-REPORTS)

**🛠️ 補完ツール**
- [URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)
- [URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)
- [HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)
- [HYDRA-UMC-TOOL-CLI](https://github.com/JuanenRac/HYDRA-UMC-TOOL-CLI)
- [HYDRA-UMC-DASHBOARD-AI](https://github.com/JuanenRac/HYDRA-UMC-DASHBOARD-AI)


## 👤 作者
**JuanenRac** (Electro Hobby 3D)
📧 electrohobby3d@gmail.com
📺 [youtube.com/@electrohobby3d](https://youtube.com/@electrohobby3d)

## 📜 ライセンス
GPL-3.0 —— 詳細は LICENSE を参照してください。
