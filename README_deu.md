<!-- =============================================================================
HYDRA-UMC-MTCONNECT-ADAPTER - MTConnect probe/current/sample endpoints
Copyright (C) JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
GPL-3.0-or-later - see LICENSE
============================================================================= -->

<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | <a href="README_fra.md">🇫🇷 Français</a> | <a href="README_ita.md">🇮🇹 Italiano</a> | 🇩🇪 <b>Deutsch</b> | <a href="README_zho.md">🇨🇳 简体中文</a> | <a href="README_jpn.md">🇯🇵 日本語</a> | <a href="README_por.md">🇵🇹 Português</a></p>

### 🛠️ Standardisierte XML/HTTP-Schnittstelle zur Überwachung von Werkzeugmaschinen

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL%203.0--or--later-blue.svg" alt="GPL 3.0 or later">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="Standard">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="Format">
  <img src="https://img.shields.io/badge/Tests-122%20passing-2ea44f.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Version-0.1.9-0f6cbd.svg" alt="Version">
  <img src="https://img.shields.io/badge/Maturity-functional-0F6CBD.svg" alt="Maturity">
</p>

---

**Ehrlichkeitscheck - was heute wirklich läuft:** die Einheitenumrechnung (`src/units.ts`), das Qualitäts-/Zeitstempel-/Fehlercode-Mapping (`src/dataitem.ts`), das Polling/Caching (`src/reader.ts`), der echte, auf HYDRA-UMC-SERVER gestützte Maschinen-Reader (`src/hydraServerReader.ts`) und der HTTP-Server (`src/server.ts`) sind alle real und getestet (122 bestandene Tests über 11 Dateien, einschließlich echter HTTP-Anfragen über einen echten lauschenden Socket via `supertest` - nicht nur ein Kompilierungscheck). Das Gerätemodell ist fest auf genau einen HydraNode (`hydra_umc_1`) codiert - das beweist, dass die HTTP-Oberfläche und die XML-Form Ende-zu-Ende spezifikationskonform sind, aber ein echtes Deployment, das mehr als einen Roboter überwacht, müsste dies aus dem eigenen Live-Bestand von HYDRA-UMC-SERVER generieren, was noch nicht geschieht. Das ausgegebene XML wurde auf spezifikationskonforme Form geprüft (Namespaces, `Device`/`DataItem`-IDs, eine gemeinsame `instanceId`), aber noch nicht live gegen einen echten Drittanbieter-MTConnect-Agent oder -Collector getestet. Siehe `CHANGELOG.md` für das, was bisher genau ausgeliefert wurde.

---

> **Stand von Sicherheit (Safety) und Security:** Dieses Ökosystem ist kein zertifiziertes Sicherheitssystem. Es gibt noch keinen Hardware-E-STOP-Pfad, keine von der Firmware durchgesetzten Grenzen oder Verriegelungen und keinen verifizierten Bewegungsbefehl; Firmware-Images werden mit CRC32 und einem HMAC-SHA256 mit gemeinsamem Schlüssel geprüft, nicht mit einer asymmetrischen Signatur; TLS und gegenseitiges TLS sind optional und standardmäßig aus; noch keine eigene Platine wurde bestückt oder getestet. Lesen Sie die [Sicherheitsbasis](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md) und das [Bedrohungsmodell](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md), bevor Sie sich für die Sicherheit einer Person auf eine Aussage hier verlassen.

---

## 📋 Auf einen Blick

| | |
|---|---|
| Version | `0.1.9` |
| Reifegrad | Funktionsfähig |
| Tests | 122 (`npm test`) |
| Technik | Node.js / Express / MTConnect 1.7 XML |
| Ziel | Der Raspberry Pi CM5 einer HYDRA-UMC-Zelle |
| Auf echter Hardware | Noch nicht: für diese Version ist kein Lauf auf echter Hardware vermerkt |

**Springe zu:** [Überblick](#-überblick) · [Architektur](#-architektur) · [Schnellstart](#-schnellstart) · [Tests](#-tests) · [Struktur des Repositorys](#-struktur-des-repositorys) · [Verwandte Projekte](#-verwandte-projekte)

## 🚦 Projektstatus

Jede Zeile ist ein Teil dieses Repositorys, und die Ampel sagt, wie weit er heute ist. Sie beruht auf dem, was das Repository zeigen kann (Tests, Builds, Läufe), nicht auf dem, was geplant ist.

🟢 Fertig und überprüft · 🟡 Funktioniert, mit bekannten Grenzen · 🟠 Teilweise fertig oder noch nicht überprüft · 🔴 Nicht gemacht oder funktioniert nicht

| Bereich | Stand | Was das hier bedeutet |
|---|---|---|
| Software | 🟡 | Funktioniert für seinen Hauptzweck; die Ehrlichkeitsprüfung oben nennt, was noch fehlt |
| Tests | 🟢 | 122 automatische Tests, bei jeder Änderung ausgeführt |
| Echte Hardware | 🔴 | Noch nicht: für diese Version ist kein Lauf auf echter Hardware vermerkt |
| Dokumentation | 🟢 | README in acht Sprachen, bei jeder Änderung gegen das Manifest geprüft |

## 🎯 Überblick

**HYDRA-UMC-MTCONNECT-ADAPTER** ist die Legacy- und Fabrikstandard-Brücke zur Überwachung von Werkzeugmaschinen. Er implementiert das MTConnect-Protokoll (Dokumente der Version 1.7, gegen das offizielle XSD geprüft) und exportiert den Roboterschwarm als einen Satz standardisierter Werkzeugmaschinen.

Er bietet eine schreibgeschützte XML/HTTP-Schnittstelle, die es herkömmlicher Industriesoftware ermöglicht, den Ausführungsstatus, die Verfügbarkeit und die Spindeltemperatur des HydraNodes zu überwachen, ohne dass spezialisierte Treiber erforderlich sind.

### Hauptmerkmale:
* 🏭 **Standardisierte Maschinendaten:** Exportiert einen HydraNode als MTConnect-konformes Gerät. *(heute fest auf genau einen HydraNode - `hydra_umc_1` - beschränkt, siehe `docs/API.md`; belegt, dass die HTTP-Oberfläche und die XML-Form Ende-zu-Ende spezifikationskonform sind - ein echtes Deployment würde dies aus HYDRA-UMC-SERVERs eigener Live-Roboterliste generieren)*
* 📄 **XML-Datenströme:** Die echten, gepollten `<Events>`/`<Samples>`-Blöcke von `GET /current` im Standard-XML-Format. *(implementiert)*
* 🔌 **Echte Maschinenquelle:** `HydraServerMachineReader` (`src/hydraServerReader.ts`, `HYDRA_UMC_SERVER_URL`) fragt ein echtes, laufendes HYDRA-UMC-SERVER über dessen eigenes `GET /api/settings` ab und meldet den echten Zustand (`AVAILABLE`/`ACTIVE`/`INTERRUPTED`/`STOPPED`/`READY`) eines echten Roboters - nicht nur den `FixtureMachineReader`-Fallback. Siehe `docs/API.md`. *(implementiert)*
* 🌐 **HTTP-Schnittstelle:** Über einfache RESTful-Abfragen für eine einfache Integration zugänglich. *(implementiert)*
* 🔍 **Agent-Kompatibilität:** Verifiziert, dass spezifikationskonformes XML ausgegeben wird (korrekte Namespaces, konsistente `Device`/`DataItem`-IDs, eine gemeinsame `instanceId` - siehe `tests/server.test.ts`) - noch nicht live gegen einen echten Drittanbieter-MTConnect-Agenten/-Kollektor getestet.
* 📐 **Echtes Einheiten-/Qualitäts-Mapping:** Die native Einheit, Qualität, der UTC-Zeitstempel und der Fehlercode jedes DataItems werden von einem echten, versionierten Mapping berechnet - testbar ohne Hardware. *(implementiert)*
* 🩹 **Ausgabe im Degraded-Modus:** Eine Quelle, die ausgefallen ist oder ungültige Daten meldet, wird mit dem echten `UNAVAILABLE`-Wert von MTConnect dargestellt, nicht als Absturz oder veraltete Daten; das Dokument bleibt gegen das offizielle Schema gültig. *(implementiert)*
* 🧮 **Beobachtungspuffer:** Jede Änderung eines DataItems ist eine Beobachtung mit eigener Sequenznummer, gespeichert in einem Puffer von `MTCONNECT_BUFFER_SIZE` Beobachtungen; `GET /sample?from=<nextSequence>&count=<n>` liefert genau das, was seitdem geschehen ist, sodass eine Client-Schleife nie eine Änderung verliert oder wiederholt. *(implementiert)*
* 🧪 **Keine erfundenen Daten:** ohne `HYDRA_UMC_SERVER_URL` ist jedes DataItem `UNAVAILABLE`; die synthetischen Demowerte werden nur mit `HYDRA_UMC_MTCONNECT_DEMO=1` geliefert, und das Gerät weist in seiner Beschreibung darauf hin. *(implementiert)*
* 🧩 **Zustände, Geräteroutien und HTTP-Status:** ein CONDITION-DataItem wird als Normal, Warning, Fault oder Unavailable ausgegeben (mit Meldung und nativem Code) und in `/probe` deklariert, wenn das Gerät eines hat; das Gerät deklariert `ASSET_CHANGED` und `ASSET_REMOVED` (es hat keine Assets, sie bleiben UNAVAILABLE); `/HydraNode_1/probe`, `/current` und `/sample` antworten für dieses Gerät; `HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1` lässt einen MTConnectError HTTP 400 oder 404 statt 200 tragen (standardmäßig aus). Alles gegen das offizielle XSD geprüft. *(implementiert)*
* 🔌 **SHDR-Ausgabe für einen cppagent:** ist `HYDRA_UMC_MTCONNECT_SHDR_PORT` gesetzt, liefert der Adapter dieselben Beobachtungen zusätzlich als SHDR-Zeilen (`Zeit|dataItemId|Wert`, Conditions als `Zeit|id|STUFE|nativerCode|||Meldung`) über TCP, sodass ein handelsüblicher MTConnect-Agent ihn lesen kann. Ein Client erhält zuerst den letzten Wert jedes DataItems, danach jede Änderung; die einzige Zeile, die er senden darf, ist `* PING`, beantwortet mit `* PONG`. Nur lesend. Er lauscht auf `127.0.0.1`, sofern `HYDRA_UMC_MTCONNECT_SHDR_HOST` nichts anderes sagt. Mit einem simulierten Agenten getestet. *(implementiert, noch nicht mit einem echten cppagent probiert)*

## 🧩 Rolle in HYDRA-UMC

**HYDRA-UMC-MTCONNECT-ADAPTER** zeigt die Roboter der Fabrik-Überwachungssoftware als MTConnect-Geräte: XML nur lesend über HTTP (`/probe`, `/current`, `/sample`), gespeist aus `HYDRA-UMC-SERVER`. Er sendet keinen Befehl an eine Maschine.

## 🏛️ Architektur

<p align="center">
  <img src="images/architecture.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER architecture" width="100%">
</p>

<details>
<summary>Textversion des Diagramms (Mermaid)</summary>

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["XML / HTTP Stream"]
    XML --> AGENT["MTCONNECT-AGENT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Industrie-Monitor / ERP"]
```

</details>

### ARCHITEKTUR & DESIGNENTSCHEIDUNGEN

* **Warum es Geschwister, kein Submodul, von HYDRA-UMC-GATEWAY-INDUSTRIAL ist.** Jeder Protokolladapter ist ein separat bereitstellbarer/neustartbarer Prozess - ein Problem bei der MTConnect-XML-Erzeugung legt nie die daneben laufenden OPC-UA- oder MQTT-Adapter lahm.
* **Warum ein echter MTConnect-Device-/Agent-Stream statt eines generischen XML-Exports.** MTConnect-fähige Fabriksoftware (viele CNC-/MES-Tools) erwartet das spezifische Device-/Agent-/Component-Schema, das der Standard definiert - ein generischer Export bräuchte auf der anderen Seite einen maßgeschneiderten Parser, was den Sinn ergäbe, überhaupt MTConnect zu sprechen.
* **Warum der Einstiegspunkt nur Identität/Version ausgibt und nach dem Start eines Health-Check-Listeners beendet wird.** Andamiaje-Stadium, gleicher Grund wie im eigenen README des Elternteils - ein echter Adapter ist von Natur aus langlaufend.
* **Wie sich das ins restliche Ökosystem einfügt.** Ein Geschwisterdienst unter HYDRA-UMC-GATEWAY-INDUSTRIAL - übersetzt den eigenen Zustand von HYDRA-UMC-SERVER in einen echten MTConnect-Device-/Agent-Feed.
* **Echte HTTP-Tests, nicht nur eine Kompilierprüfung.** `tests/server.test.ts` verwendet `supertest` (eine echte HTTP-Anfrage über einen echten, lauschenden Socket), um zu überprüfen, dass `GET /probe` und `GET /current` spezifikationsgerecht geformtes XML mit übereinstimmenden Namespaces, konsistenten `Device`-/`DataItem`-IDs zwischen den beiden Dokumenten und einer gemeinsamen `instanceId` zurückgeben.
* **Warum Einheitenkonvertierung, Qualitätsklassifizierung und das Auslesen einer Maschine drei getrennte Module sind.** `src/units.ts` (reine Umrechnungsmathematik), `src/dataitem.ts` (Qualitäts-/Zeitstempel-/Fehlercode-Mapping) und `src/reader.ts` (Polling/Caching eines `MachineReader`) sind jeweils für sich allein testbar, ohne Hardware oder HTTP - ein ausdrückliches Anliegen: Bugs bei der Einheitenkonvertierung, die über einen vollständigen HTTP-Round-Trip gefunden werden, sind langsam zu isolieren und leicht zu übersehen.
* **Warum ein degradiertes DataItem den echten MTConnect-Wert `UNAVAILABLE` darstellt und kein eigenes Fehlerformat.** MTConnect-Agenten und -Clients wissen bereits, wie `UNAVAILABLE` anzuzeigen ist - das Vokabular der Spezifikation selbst wiederzuverwenden heißt, dass ein nachgelagertes Werkzeug schon heute geordnet degradiert. Der Grund (keine Daten, Einheitenumrechnung, Quelle ausgefallen, veraltet) bleibt außerhalb des Dokuments: Das offizielle Schema hat dafür kein Attribut, und ein validierender Parser lehnt ein Dokument mit einem zusätzlichen ab.
* **Warum das Polling-Limit von `CachedReader` generisch ist und nicht auf `spindle_temp` fest verdrahtet.** In dieser Umgebung existiert noch keine echte Maschinenquelle, aber das echte Risiko, gegen das es schützt - einen jahrzehntealten Controller mit Anfragen zu bombardieren, sooft `/current` aufgerufen wird - gilt für jede Quelle, die `FixtureMachineReader` irgendwann ersetzt, also lebt die Drosselung auf Ebene der `MachineReader`-Schnittstelle und nicht in der eigenen Handhabung eines einzelnen DataItems.

## 🚀 Schnellstart

Benötigt Node.js 20 oder neuer mit npm.

```bash
npm install
npm test
npm run build
npm start
curl http://127.0.0.1:5000/probe
```

## 🧪 Tests

122 automatische Tests laufen mit `npm test`. Sie brauchen weder Hardware noch etwas außerhalb dieses Rechners.

Die CI führt `HYDRA_UMC_CI=1 python tools/ci_validate.py` aus; das prüft das Manifest, die Dokumente, die acht READMEs und die Bilder.

## 🏗️ Build und Veröffentlichung

### Voraussetzungen
- [Node.js](https://nodejs.org/) (v20 oder höher empfohlen)
- npm

### Installation
```bash
npm install
```

### Entwicklungsmodus
Startet den Adapter direkt mit `tsx` (ohne Bundler):
- **Windows:** Doppelklick auf `dev.bat` oder `npm run dev` ausführen
- **Linux/Mac:** `./dev.sh` oder `npm run dev` ausführen

### Produktions-Build
Bündelt den Adapter mit esbuild in eine einzige einsetzbare Datei:
- **Windows:** Doppelklick auf `build.bat` oder `npm run build` ausführen
- **Linux/Mac:** `./build.sh` oder `npm run build` ausführen

Dann starten mit:
```bash
npm start
```

Der Adapter lauscht auf `0.0.0.0:5000` - jeder MTConnect-Agent/Collector
kann `GET http://<host>:5000/probe` (statisches Gerätemodell),
`GET http://<host>:5000/current` (aktuelle DataItem-Werte) und
`GET http://<host>:5000/sample?from=<sequence>` (echte, ehrliche
Streaming-Puffer-Semantik - siehe `docs/API.md`) abfragen.

Um einen echten Roboter zu melden, setzen Sie `HYDRA_UMC_SERVER_URL`. HYDRA-UMC-SERVER beantwortet `GET /api/settings` nur einem angemeldeten Konto; geben Sie dem Adapter daher auch Zugangsdaten: `HYDRA_UMC_SERVER_TOKEN` (ein vom Server bereits ausgestelltes Token) oder `HYDRA_UMC_SERVER_USER` und `HYDRA_UMC_SERVER_PASSWORD` (der Adapter meldet sich selbst an und erneut, wenn die Sitzung abläuft). Ohne eines von beiden wird die Quelle als nicht verfügbar gemeldet (`SOURCE_UNAVAILABLE`). `HYDRA_UMC_MTCONNECT_HOST` schränkt die Lauschadresse ein (Standard `0.0.0.0`), etwa auf `127.0.0.1` hinter einem lokalen Reverse-Proxy. Antworten des Servers werden bis zu 4 MiB gelesen.

### Versionierung
`npm run build` bündelt nur den Server. Die Version wird nur von `python tools/hydra_project_tool.py bump` erhöht (über `bump_manifest_version.py`).

## 📂 Struktur des Repositorys

<p align="center">
  <img src="images/repository-structure.svg" alt="Repository structure of HYDRA-UMC-MTCONNECT-ADAPTER" width="100%">
</p>

<details>
<summary>Textversion des Baums</summary>

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/                       Quellcode (Node/TypeScript - Adapter, Mapper, HTTP)
├── tests/                     Vitest-Suite - Data-Item-Mapping, Einheiten, Reader- und Server-Verhalten
├── docs/                      Dokumente des Projekts
├── images/                    Medien und Diagramme
├── schemas/                   mtconnect-1.7/: die MTConnect-1.7-XSD-Schemas, gegen die die Antworten geprüft werden, mit ihrer NOTICE
├── scripts/                   Utility-Skripte (bump-version.mjs)
├── tools/                     build_test.py (Build-Prüfung ohne Versionierung), ci_validate.py (Manifest-/CHANGELOG-/Doku-Validierung der CI), hydra_project_tool.py und die gemeinsamen _doc_policy.py und _readme_parity.py
├── .github/                   CI-Workflow und Issue-Vorlagen
├── CHANGELOG.md               was sich in jeder Version geändert hat
├── Dockerfile                 Container-Image
├── build-test.sh              Build-Prüfung ohne Änderungen
├── build.sh                   baut und prüft; ändert nie die Version
├── bump_manifest_version.py   gleicht die Manifest-Version an
├── dev.sh                     Entwicklungsmodus
├── hydra-umc.project.json     Manifest: Version, Reifegrad, Familie
├── package.json               Paketmetadaten und Skripte
└── test.sh                    führt die Tests aus
```

</details>

## 🗺️ Roadmap und bekannte Grenzen

**Bekannte Grenzen heute**

* **Phase 1:** OPC-UA Pub/Sub-Implementierung für Hochgeschwindigkeitsdatenaustausch und Legacy-Protokoll-Bridging.
* **Phase 2:** MQTT-Broker-Cluster für massives IoT-Gerätemanagement und hohe Parallelität.
* **Phase 3:** MTConnect-Adapterunterstützung für die Integration von CNC- und SPS-Maschinen verschiedener Hersteller.
* **Phase 4:** Unterstützung für MTConnect Multi-Geräte-Aggregation und standardisiertes XML/HTTP-Telemetrie-Streaming.

## 🌍 Sprachen

Diese README und die Dokumente des Repositorys gibt es in acht Sprachen: Englisch, Spanisch, Deutsch, Französisch, Italienisch, Japanisch, Chinesisch und Portugiesisch (Portugal). Sie entstehen gemeinsam, und die CI prüft, dass die acht Dateien dieselben Abschnitte und dieselben Links haben. Dieses Repository hat weder eine eigene Oberfläche noch einen eigenen Meldungskatalog, es gibt also keine Oberflächentexte zu übersetzen.

## 🔗 Verwandte Projekte

Dieses Projekt ist Teil des HYDRA-UMC-Robotik-Ökosystems desselben Autors (JuanenRac / Electro Hobby 3D). Gut zu wissen, da eine Anfrage eigentlich eines dieser Projekte betreffen könnte statt dieses Repositorys.

**Übergeordnetes Projekt**
- **[HYDRA-UMC-GATEWAY-INDUSTRIAL](https://github.com/JuanenRac/HYDRA-UMC-GATEWAY-INDUSTRIAL)** — Integrationsknoten, der zu Industrieprotokollen weiterleitet, mit einer echten Befehls-Allowlist-/Backpressure-Schicht; das übergeordnete Projekt, dessen spezifischer Protokolladapter dieses Repository innerhalb seines eigenen Industrie-Gateways ist.

**Geschwisterprojekte** — die übrigen Protokolladapter des eigenen Industrie-Gateways von HYDRA-UMC-GATEWAY-INDUSTRIAL
- **[HYDRA-UMC-OPCUA-SERVER](https://github.com/JuanenRac/HYDRA-UMC-OPCUA-SERVER)** — echter OPC-UA-Adressraum, verifiziert mit einer echten Binärprotokoll-Client-Session.
- **[HYDRA-UMC-MQTT-BROKER](https://github.com/JuanenRac/HYDRA-UMC-MQTT-BROKER)** — echter MQTT-Broker mit optionaler Pro-Client-Authentifizierung und Topic-ACLs.

**Direkt verwandt**
- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — das reale Headless-Backend (REST/WebSocket), mit dem jeder Steuerungsclient tatsächlich spricht — die Quelle des Zustands, den dieser Adapter offenlegt.

**Ebenfalls Teil des Ökosystems**

*Kern-Hardware & Plattform*
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — der Entwurf des Motherboards des Roboterarms: CM5-Host + Dual-Core-STM32H745, gedacht zur Koordination von bis zu 8 Werkzeugarmen über CAN-OTA/SPI-OTA (Firmware in einer frühen Phase; noch keine bestückte Platine).
- **[HYDRA-UMC-OS](https://github.com/JuanenRac/HYDRA-UMC-OS)** — reproduzierbare Raspberry-Pi-OS-Produktschicht für den CM5: schreibgeschützter Agent, validierte Konfiguration/Profile, WiFi-Ersteinrichtung.
- **[HYDRA-UMC-SDK](https://github.com/JuanenRac/HYDRA-UMC-SDK)** — der gemeinsame JSON-Schema-Vertrag und die Software-Auftragsschranke, gegen die jede Bridge ihre Befehle validiert (keine zertifizierte Sicherheitsfunktion).
- **[HYDRA-UMC-CONNECTOR-HUB](https://github.com/JuanenRac/HYDRA-UMC-CONNECTOR-HUB)** — deklaratives Adapter-Manifest-Register und Validator für Konnektoren externer Maschinen; erweitert die eigene Vertragsidee des SDK auf externe Maschinen, ohne die Industrie-Gateway-Projekte zu ersetzen.

*Kern-Backend & Clients*
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — Web-Steuerungs-Dashboard mit Echtzeit-3D-Visualisierung mehrerer Roboter.
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — Desktop-Schwarmleitstand (PySide6) für mehrere Server gleichzeitig, verpackt als eigenständige ausführbare Datei.
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — native Android-Steuerungs-App mit biometrischem Login und einer gekoppelten Wear-OS-Begleit-App.
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — iOS/iPadOS-Steuerungs-App (Flutter) mit Echtzeit-WebSocket-Synchronisierung.
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — native Touch-UI für das eingebaute 7"-DSI-Touchscreen, direkt auf dem CM5 eingebettet.
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — grafischer Desktop-URDF-Ersteller/-Editor, der fertige Modelle in STUDIOs eigenen Katalog überträgt.
- **[HYDRA-UMC-EDITOR-STL](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-STL)** — Desktop-STL-Modelleditor, der echte Teile im selben Modellkatalog transformiert/ersetzt/entfernt/hinzufügt, den auch HYDRA-UMC-EDITOR-URDF bearbeitet.
- **[HYDRA-UMC-BRIDGE-AMR](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-AMR)** — Koordinationsschranke für AGV-/AMR-Flotten über einen VDA-5050-MQTT-Publisher (nur gegen eine emulierte Flotte getestet).
- **[HYDRA-UMC-BRIDGE-CNC](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-CNC)** — High-Level-Koordinator für CNC-Zellen mit GRBL-Status-/Steuerbyte-Zugriff (nur gegen einen Emulator getestet).
- **[HYDRA-UMC-BRIDGE-DROIDS](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-DROIDS)** — Koordinationsschranke für laufende/humanoide Droiden, mit einem Boston-Dynamics-Spot-Befehlssender (nur gegen einen Emulator getestet).
- **[HYDRA-UMC-BRIDGE-LASER](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-LASER)** — Koordinator für Laserzellen, liest 3 Schlüssel-/Gehäuse-/Verriegelungs-GPIO-Signale (nur gegen einen simulierten Chip getestet; kann keinen Laser scharfschalten oder auslösen).
- **[HYDRA-UMC-BRIDGE-OPENPNP](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-OPENPNP)** — sicherer High-Level-Koordinator für den Leiterplattenfluss von OpenPnP Pick-and-Place.
- **[HYDRA-UMC-BRIDGE-PRINTER3D](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-PRINTER3D)** — sichere Koordinationsschranke für Moonraker/Klipper-3D-Drucker, mit echten gesicherten Job-Befehlen.
- **[HYDRA-UMC-BRIDGE-ROS2](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-ROS2)** — Koordinator mit einem träge importierten rclpy-ROS-2-Transport (noch nicht gegen eine ROS-2-Installation ausgeführt).
- **[HYDRA-UMC-BRIDGE-UAV](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-UAV)** — Koordinationsschranke für kameraausgestattete UAVs, mit einem MAVLink-Befehlssender (nur gegen einen Emulator getestet).

*URTC-Werkzeugplattform*
- **[URTC](https://github.com/JuanenRac/URTC)** — Firmware für die physische Universal-Robot-Tool-Controller-Platine, 25+ Werkzeugprofile über CAN-Bus.
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — Desktop-GUI-Flash-Tool für URTC-Platinen, CAN-OTA plus Full-Chip-SWD/JTAG.
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — Desktop-Live-CAN-Bus-Diagnosetool für URTC-Platinen, ein Panel pro Werkzeugprofil.
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — browserbasierte Alternative zu URTC-TESTER über die Web-Serial-API, ohne lokale Installation.
- **[URTC-GATEWAY](https://github.com/JuanenRac/URTC-GATEWAY)** — Gateway vor dem CAN-Bus von URTC: Liste erlaubter Kennungen, Ratenbegrenzung und Sitzungsschlüssel; Software auf dem Computer getestet, noch nicht an einem echten Bus.

*Vision-KI-Knoten (Hailo-8)*
- **[HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)** — Integrationsknoten für die Hailo-8-Vision-Pipeline, mit einer echten stufenweisen Hardware-Bereitschaftsprüfung.
- **[HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)** — echte Registry für kompilierte Modelle mit Hailo-Architektur-/Prüfsummen-Safe-Load-Verifizierung.
- **[HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)** — echter GStreamer-Pipeline- + MediaMTX-Konfigurationsgenerator mit einer echten HailoRT-Integrationsschranke.
- **[HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)** — Position-Based-Visual-Servoing-Korrekturgesetz mit Freigabe abhängig vom Zonenstatus; noch keine Posenschätzung per Kamera.
- **[HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)** — v0-Logik für Zonenverletzung, Kalibrierungsaktualität und E-STOP-Anforderung, die Objektpositionen aus einer Datei nimmt; kein Detektor speist sie, und noch kein physischer E-STOP ist angeschlossen.

*Kognitiver KI-Knoten (Hailo-10)*
- **[HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)** — Integrationsknoten für die Hailo-10-Cognitive-Pipeline (LLM-/VLA-/Sprach-Orchestrierung).
- **[HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)** — echte Aktions-Token-Kodierung/-Dekodierung und Trajektoriengenerierung für ein Vision-Language-Action-Modell.
- **[HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)** — echtes Sprach-Frontend (VAD + Intent-Parser) mit einem begrenzten, bestätigungsgesicherten Watch-Relay.
- **[HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)** — echte regelbasierte Aufgabenzerlegung und semantische Fehlerbehebung über MCU-Fehlercodes.
- **[HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)** — echte, nur auf der Standardbibliothek basierende TF-IDF-Dokumentensuche über die eigenen Markdown-Dokumente dieses Ökosystems.
- **[HYDRA-UMC-LOCAL-TECHNICIAN](https://github.com/JuanenRac/HYDRA-UMC-LOCAL-TECHNICIAN)** — lokaler, richtlinien-gesteuerter KI-Wartungstechniker für das Ökosystem selbst - beobachtet, diagnostiziert und schlägt Korrekturen vor; die zwei höchsten Risikostufen sind absichtlich noch nicht implementiert.

*Orchestrierung & Schwarm*
- **[HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)** — Integrationsknoten mit einem echten gRPC/Protobuf-Health-Report-Vertrag und einer Missions-Zustandsmaschine.
- **[HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)** — echte prioritätsbasierte Job-Queue mit Deduplizierung, über eine echte HTTP-API.
- **[HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)** — echter gRPC-basierter Flotten-Health-Watchdog mit Retry/Backoff und Identitäts-Mismatch-Erkennung.
- **[HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)** — echter RRT-basierter 3D-Pfadplaner mit echter Hindernis-/Arbeitsraum-Kollisionsvalidierung.
- **[HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)** — echte CRDT-LWW-Element-Map-Zustandssynchronisation, eigenschaftsgetestet auf Multi-Zellen-Konvergenz.

*Digitaler Zwilling & Simulation*
- **[HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)** — Integrationsknoten für die Digital-Twin-Engine, mit einem echten Versionskompatibilitäts-Sync-Vertrag.
- **[HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)** — Hardware-in-the-Loop-Router mit einer Software-Kollisionsverriegelung zwischen Simulation und echter Hardware (ohne echte Hardware getestet).
- **[HYDRA-UMC-PHYSICS-REPLICA](https://github.com/JuanenRac/HYDRA-UMC-PHYSICS-REPLICA)** — echte Vorwärtskinematik und Gelenkgrenzenvalidierung über eine echte URDF-Teilmenge.
- **[HYDRA-UMC-SYNTHETIC-DATA-GEN](https://github.com/JuanenRac/HYDRA-UMC-SYNTHETIC-DATA-GEN)** — echter prozeduraler 2D-Szenengenerator mit YOLO/COCO-Annotationsexport.

*Daten & Analytik*
- **[HYDRA-UMC-DATALAKE](https://github.com/JuanenRac/HYDRA-UMC-DATALAKE)** — echter sqlite3-gestützter Zeitreihenspeicher mit einer echten Ingest-/Abfrage-HTTP-API.
- **[HYDRA-UMC-ANOMALY-DETECTOR](https://github.com/JuanenRac/HYDRA-UMC-ANOMALY-DETECTOR)** — echter FFT- + statistischer Basislinien-Anomaliedetektor mit Drift-Überwachung.
- **[HYDRA-UMC-PRODUCTION-REPORTS](https://github.com/JuanenRac/HYDRA-UMC-PRODUCTION-REPORTS)** — echte OEE-/Verfügbarkeitsberechnung über den DATALAKE-Verlauf, mit reproduzierbarem CSV-Export.
- **[HYDRA-UMC-TELEMETRY-COLLECTOR](https://github.com/JuanenRac/HYDRA-UMC-TELEMETRY-COLLECTOR)** — echte CAN/WebSocket-Ingestion-Pipeline in DATALAKE, mit Sequenz-Deduplizierung.

*Ergänzende Tools & Ökosystembetrieb*
- **[HYDRA-UMC-DASHBOARD-AI](https://github.com/JuanenRac/HYDRA-UMC-DASHBOARD-AI)** — Smart-Summaries- und Anomaly-Highlighting-Panels über DATALAKE/ANOMALY-DETECTOR, mit einem ehrlichen statistischen Fallback.
- **[HYDRA-UMC-TOOL-CLI](https://github.com/JuanenRac/HYDRA-UMC-TOOL-CLI)** — Flotten-CLI mit einem echten, stabilen Exit-Code-Vertrag, ein echter Live-Client der eigenen API von HYDRA-UMC-SERVER.
- **[HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)** — WearOS-Begleit-App mit haptischen Alarmmustern und einem Sprach-Relay zum gekoppelten Telefon (noch nicht auf einer physischen Uhr ausgeführt).
- **[URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)** — Firmware für ein Platinenmontagegestell mit echter Werkzeug-ID-Dekodierung und Smart-Idle-Vorheizlogik.
- **[URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)** — Firmware plus ein echter Python-Vision-Begleiter für einen Thermal-/RGB-Inspektionswerkzeugkopf.
- **[HYDRA-UMC-UPDATER](https://github.com/JuanenRac/HYDRA-UMC-UPDATER)** — administratives Desktop-Tool, das jedes Repository in diesem Ökosystem entdeckt, klont und aktualisiert.
- **[HYDRA-UMC-OS-REBUILDER](https://github.com/JuanenRac/HYDRA-UMC-OS-REBUILDER)** — Windows/Linux-Desktop-Tool, das ein flashbereites CM5-Image baut, vorgeladen mit den aktuellsten Versionen des Ökosystems, mit Ersteinrichtungs-Konfiguration für WLAN/Benutzer/SSH im Stil von Raspberry Pi Imager.
- **[HYDRA-UMC-OPS-AGENT](https://github.com/JuanenRac/HYDRA-UMC-OPS-AGENT)** — Wartungsvorfall-Koordinator: eine Edge-Rolle mit niedrigem Privileg sammelt einen bereinigten Inventar-/Gesundheits-Snapshot, eine Control-Plane-Rolle rendert ihn schreibgeschützt und bittet einen KI-Anbieter um einen Diagnosevorschlag - wendet nie einen Patch an und stellt nie etwas bereit.
- **[HYDRA-UMC-DEV-SERVER](https://github.com/JuanenRac/HYDRA-UMC-DEV-SERVER)** — reproduzierbarer Entwicklungshost (Raspberry Pi 5 / CM5), der den Quellcode des Ökosystems vorhält und begrenzte Build-/Test-Aufgaben über eine dauerhafte Warteschlange ausführt; eine dedizierte Entwicklerrolle, ausdrücklich kein operativer CM5.

## 📚 Dokumentation

Hier steht mehr:

* **[docs/API.md](docs/API.md)** — die echte HTTP-Endpunkt-Referenz: die Anfrage-/Antwortform von `GET /probe`/`GET /current`/`GET /sample`, vollständige Beispiel-XML-Umschläge, die beiden echten `MachineReader`-Implementierungen (`FixtureMachineReader`/`HydraServerMachineReader`), und ein expliziter Hinweis darauf, was noch ein Platzhalter ist (der einzige feste HydraNode - der dynamische Baum mit einem Gerät pro Roboter ist separate, größere Arbeit).
* [Sicherheitsgrundlage des Ökosystems](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md)
* [Bedrohungsmodell des Ökosystems](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md)
* [Änderungsprotokoll dieses Repositorys](CHANGELOG.md)
* [Lizenz dieses Repositorys](LICENSE.md)

## 🤝 Mitwirken und Community

* Führe vor einem Pull Request `HYDRA_UMC_CI=1 py -3 tools/ci_validate.py` (oder `HYDRA_UMC_CI=1 python3 tools/ci_validate.py`) aus: Es muss `CI_VALIDATION=PASS` ausgeben. Führe dafür nicht `build.sh` oder `build.bat` aus; Bauen ist keine Prüfung.
* Die acht READMEs entstehen aus einer einzigen Quelle in HYDRA-UMC-DOCS; bearbeite sie nicht von Hand. Ändere die Quelle und schreibe sie mit `tools/make_readmes.py` neu.
* Behaupte in einer README nichts, was nicht gelaufen ist: Schreibe „simuliert“ oder „nicht auf Hardware erprobt“, wo das stimmt.
* Siehe [CONTRIBUTING.md](CONTRIBUTING.md), den [Verhaltenskodex](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md) und [SUPPORT.md](SUPPORT.md).

## 👤 AUTOR

**JuanenRac (Electro Hobby 3D)** · electrohobby3d@gmail.com

## 📜 LIZENZ

GPL-3.0-or-later - [LICENSE](LICENSE).
