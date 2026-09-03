<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | <a href="README_fra.md">🇫🇷 Français</a> | <a href="README_ita.md">🇮🇹 Italiano</a> | 🇩🇪 <b>Deutsch</b> | <a href="README_zho.md">🇨🇳 简体中文</a> | <a href="README_jpn.md">🇯🇵 日本語</a></p>

### 🛠️ Standardisierte XML/HTTP-Schnittstelle zur Überwachung von Werkzeugmaschinen

<p align="left">
  <img src="https://img.shields.io/badge/Lizenz-GPL%203.0-blue.svg" alt="GPL 3.0">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="MTConnect">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="XML/HTTP">
</p>

---

## 1. 🛠️ TECHNISCHER ÜBERBLICK

**HYDRA-UMC-MTCONNECT-ADAPTER** ist die Legacy- und Fabrikstandard-Brücke zur Überwachung von Werkzeugmaschinen. Er implementiert das MTConnect-Protokoll (ANSI/MTC1.4) und exportiert den Roboterschwarm als einen Satz standardisierter Werkzeugmaschinen.

Er bietet eine schreibgeschützte XML/HTTP-Schnittstelle, die es herkömmlicher Industriesoftware ermöglicht, den Ausführungsstatus, die Werkzeugpositionen und die Sensordaten jedes HydraNodes zu überwachen, ohne dass spezialisierte Treiber erforderlich sind.

### Hauptmerkmale:
* 🏭 **Standardisierte Maschinendaten:** Exportiert einen HydraNode als MTConnect-konformes Gerät. *(heute fest auf genau einen HydraNode - `hydra_umc_1` - beschränkt, siehe `docs/API.md`; belegt, dass die HTTP-Oberfläche und die XML-Form Ende-zu-Ende spezifikationskonform sind - ein echtes Deployment würde dies aus HYDRA-UMC-SERVERs eigener Live-Roboterliste generieren)*
* 📄 **XML-Datenströme:** Der echte, gepollte `<Samples>`-Block von `GET /current` im Standard-XML-Format. *(implementiert)*
* 🌐 **HTTP-Schnittstelle:** Über einfache RESTful-Abfragen für eine einfache Integration zugänglich. *(implementiert)*
* 🔍 **Agent-Kompatibilität:** Verifiziert, dass spezifikationskonformes XML ausgegeben wird (korrekte Namespaces, konsistente `Device`/`DataItem`-IDs, eine gemeinsame `instanceId` - siehe `tests/server.test.ts`) - noch nicht live gegen einen echten Drittanbieter-MTConnect-Agenten/-Kollektor getestet.
* 📐 **Echtes Einheiten-/Qualitäts-Mapping:** Die native Einheit, Qualität, der UTC-Zeitstempel und der Fehlercode jedes DataItems werden von einem echten, versionierten Mapping berechnet - testbar ohne Hardware. *(implementiert)*
* 🩹 **Ausgabe im Degraded-Modus:** Eine Quelle, die ausgefallen ist oder ungültige Daten meldet, gibt MTConnects eigenen echten `UNAVAILABLE`-Wert mit einem Fehlercode aus, statt eines Absturzes oder veralteter Daten. *(implementiert)*

---

## 2. 🔄 MTCONNECT-DATENFLUSS

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["XML / HTTP Stream"]
    XML --> AGENT["MTCONNECT-AGENT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Industrie-Monitor / ERP"]
```

---

## 3. 🧱 ARCHITEKTUR & DESIGNENTSCHEIDUNGEN

* **Warum es Geschwister, kein Submodul, von HYDRA-UMC-GATEWAY-INDUSTRIAL ist.** Jeder Protokolladapter ist ein separat bereitstellbarer/neustartbarer Prozess - ein Problem bei der MTConnect-XML-Erzeugung legt nie die daneben laufenden OPC-UA- oder MQTT-Adapter lahm.
* **Warum ein echter MTConnect-Device-/Agent-Stream statt eines generischen XML-Exports.** MTConnect-fähige Fabriksoftware (viele CNC-/MES-Tools) erwartet das spezifische Device-/Agent-/Component-Schema, das der Standard definiert - ein generischer Export bräuchte auf der anderen Seite einen maßgeschneiderten Parser, was den Sinn ergäbe, überhaupt MTConnect zu sprechen.
* **Warum der Einstiegspunkt nur Identität/Version ausgibt und nach dem Start eines Health-Check-Listeners beendet wird.** Andamiaje-Stadium, gleicher Grund wie im eigenen README des Elternteils - ein echter Adapter ist von Natur aus langlaufend.
* **Wie sich das ins restliche Ökosystem einfügt.** Ein Geschwisterdienst unter HYDRA-UMC-GATEWAY-INDUSTRIAL - übersetzt den eigenen Zustand von HYDRA-UMC-SERVER in einen echten MTConnect-Device-/Agent-Feed.
* **Echte HTTP-Tests, nicht nur eine Kompilierprüfung.** `tests/server.test.ts` verwendet `supertest` (eine echte HTTP-Anfrage über einen echten, lauschenden Socket), um zu überprüfen, dass `GET /probe` und `GET /current` spezifikationsgerecht geformtes XML mit übereinstimmenden Namespaces, konsistenten `Device`-/`DataItem`-IDs zwischen den beiden Dokumenten und einer gemeinsamen `instanceId` zurückgeben.
* **Warum Einheitenkonvertierung, Qualitätsklassifizierung und das Auslesen einer Maschine drei getrennte Module sind.** `src/units.ts` (reine Umrechnungsmathematik), `src/dataitem.ts` (Qualitäts-/Zeitstempel-/Fehlercode-Mapping) und `src/reader.ts` (Polling/Caching eines `MachineReader`) sind jeweils für sich allein testbar, ohne Hardware oder HTTP - genau das Anliegen des Promotion-Audits selbst: Bugs bei der Einheitenkonvertierung, die über einen vollständigen HTTP-Round-Trip gefunden werden, sind langsam zu isolieren und leicht zu übersehen.
* **Warum ein degradiertes DataItem MTConnects eigenen echten `UNAVAILABLE`-Wert ausgibt, statt einer eigenen Fehlerform.** MTConnect-Agenten und -Kollektoren wissen bereits, wie `UNAVAILABLE` anzuzeigen ist - die Wiederverwendung des eigenen Vokabulars der Spezifikation bedeutet, dass ein echtes nachgelagertes Tool schon heute sauber degradiert, statt erst, wenn ihm eine HYDRA-UMC-spezifische Konvention beigebracht wurde. Das Attribut `errorCode` (`NO_DATA`/`UNIT_CONVERSION_ERROR`/`SOURCE_UNAVAILABLE`) ist die eigene v0-Ergänzung dieses Projekts für echte Diagnose, als solche dokumentiert statt als Standard-MTConnect-Attribut dargestellt.
* **Warum das Polling-Limit von `CachedReader` generisch ist und nicht auf `spindle_temp` fest verdrahtet.** In dieser Umgebung existiert noch keine echte Maschinenquelle, aber das echte Risiko, gegen das es schützt - einen jahrzehntealten Controller mit Anfragen zu bombardieren, sooft `/current` aufgerufen wird - gilt für jede Quelle, die `FixtureMachineReader` irgendwann ersetzt, also lebt die Drosselung auf Ebene der `MachineReader`-Schnittstelle und nicht in der eigenen Handhabung eines einzelnen DataItems.

---

## 📂 VERZEICHNISSTRUKTUR

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/         # Quellcode (Node/TypeScript - Adapter, Mapper, HTTP)
├── tests/       # Vitest-Suite - Data-Item-Mapping, Einheiten, Reader- und Server-Verhalten
├── docs/
│   └── API.md   # Echte HTTP-Endpoint-Referenz (Requests, Responses, XML-Form)
├── build/       # Kompilierte Ausgabe (npm run build)
├── images/      # Medien und Diagramme
├── scripts/     # Utility-Skripte (bump-version.mjs)
├── tools/       # ci_validate.py - Manifest-/CHANGELOG-/Doku-Validierung, von der CI genutzt
└── README.md
```

Reiner Netzwerkdienst ohne eigene Hardware - `hardware/`, `firmware/` und
`os/` werden gemäß der Repository-Strukturpolitik ausgelassen.
Siehe [`docs/API.md`](docs/API.md) für die vollständige HTTP-Endpoint-Referenz.

---

## 🛠️ ENTWICKLUNGSUMGEBUNG

### Voraussetzungen
- [Node.js](https://nodejs.org/) (v18 oder höher empfohlen)
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
kann `GET http://<host>:5000/probe` (statisches Gerätemodell) und
`GET http://<host>:5000/current` (aktuelle DataItem-Werte) abfragen.

### Versionierung
Jeder echte `npm run build` erhöht automatisch die `version` in
`package.json` (`scripts/bump-version.mjs`, erster Schritt des
`build`-Skripts) - ein "Kilometerzähler" auf Basis 10: patch +1 pro Build,
mit Übertrag auf minor (und von minor auf major) über 9 hinaus, anstatt
je ein zweistelliges Segment zu erreichen (`0.0.9` -> `0.1.0`, nicht
`0.0.10`).

---

## 🚀 FAHRPLAN
* **Phase 1:** OPC-UA Pub/Sub-Implementierung für Hochgeschwindigkeitsdatenaustausch und Legacy-Protokoll-Bridging.
* **Phase 2:** MQTT-Broker-Cluster für massives IoT-Gerätemanagement und hohe Parallelität.
* **Phase 3:** MTConnect-Adapterunterstützung für die Integration von CNC- und SPS-Maschinen verschiedener Hersteller.
* **Phase 4:** Unterstützung für MTConnect Multi-Geräte-Aggregation und standardisiertes XML/HTTP-Telemetrie-Streaming.

---

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
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — das physische Motherboard des Roboterarms: CM5-Host + Dual-Core-STM32H745, koordiniert bis zu 8 Werkzeugarme über CAN-OTA/SPI-OTA.
- **[HYDRA-UMC-OS](https://github.com/JuanenRac/HYDRA-UMC-OS)** — reproduzierbare Raspberry-Pi-OS-Produktschicht für den CM5: schreibgeschützter Agent, validierte Konfiguration/Profile, WiFi-Ersteinrichtung.
- **[HYDRA-UMC-SDK](https://github.com/JuanenRac/HYDRA-UMC-SDK)** — der gemeinsame JSON-Schema-Vertrag und die Sicherheitsschranke, gegen die jede Bridge ihre Befehle validiert.

*Kern-Backend & Clients*
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — Web-Steuerungs-Dashboard mit Echtzeit-3D-Visualisierung mehrerer Roboter.
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — Desktop-Schwarmleitstand (PySide6) für mehrere Server gleichzeitig, verpackt als eigenständige ausführbare Datei.
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — native Android-Steuerungs-App mit biometrischem Login und einer gekoppelten Wear-OS-Begleit-App.
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — iOS/iPadOS-Steuerungs-App (Flutter) mit Echtzeit-WebSocket-Synchronisierung.
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — native Touch-UI für das eingebaute 7"-DSI-Touchscreen, direkt auf dem CM5 eingebettet.
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — grafischer Desktop-URDF-Ersteller/-Editor, der fertige Modelle in STUDIOs eigenen Katalog überträgt.
- **[HYDRA-UMC-BRIDGE-AMR](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-AMR)** — Koordinationsschranke für AGV-/AMR-Flotten über einen echten VDA-5050-MQTT-Publisher.
- **[HYDRA-UMC-BRIDGE-CNC](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-CNC)** — High-Level-Koordinator für CNC-Zellen mit echtem GRBL-Status-/Steuerbyte-Zugriff.
- **[HYDRA-UMC-BRIDGE-DROIDS](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-DROIDS)** — Koordinationsschranke für laufende/humanoide Droiden, mit einem echten Boston-Dynamics-Spot-Befehlssender.
- **[HYDRA-UMC-BRIDGE-LASER](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-LASER)** — Sicherheitskoordinator für Laserzellen, liest 3 echte Schlüssel-/Gehäuse-/Verriegelungs-GPIO-Sicherungen.
- **[HYDRA-UMC-BRIDGE-OPENPNP](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-OPENPNP)** — sicherer High-Level-Koordinator für den Leiterplattenfluss von OpenPnP Pick-and-Place.
- **[HYDRA-UMC-BRIDGE-PRINTER3D](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-PRINTER3D)** — sichere Koordinationsschranke für Moonraker/Klipper-3D-Drucker, mit echten gesicherten Job-Befehlen.
- **[HYDRA-UMC-BRIDGE-ROS2](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-ROS2)** — Sicherheitskoordinator mit einem echten, träge importierten rclpy-ROS-2-Transport.
- **[HYDRA-UMC-BRIDGE-UAV](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-UAV)** — Koordinationsschranke für kameraausgestattete UAVs, mit einem echten MAVLink-Befehlssender.

*URTC-Werkzeugplattform*
- **[URTC](https://github.com/JuanenRac/URTC)** — Firmware für die physische Universal-Robot-Tool-Controller-Platine, 25+ Werkzeugprofile über CAN-Bus.
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — Desktop-GUI-Flash-Tool für URTC-Platinen, CAN-OTA plus Full-Chip-SWD/JTAG.
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — Desktop-Live-CAN-Bus-Diagnosetool für URTC-Platinen, ein Panel pro Werkzeugprofil.
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — browserbasierte Alternative zu URTC-TESTER über die Web-Serial-API, ohne lokale Installation.

*Vision-KI-Knoten (Hailo-8)*
- **[HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)** — Integrationsknoten für die Hailo-8-Vision-Pipeline, mit einer echten stufenweisen Hardware-Bereitschaftsprüfung.
- **[HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)** — echte Registry für kompilierte Modelle mit Hailo-Architektur-/Prüfsummen-Safe-Load-Verifizierung.
- **[HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)** — echter GStreamer-Pipeline- + MediaMTX-Konfigurationsgenerator mit einer echten HailoRT-Integrationsschranke.
- **[HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)** — echtes Position-Based-Visual-Servoing-Korrekturgesetz, sicherheitsgesteuert nach vorgelagertem Zonenstatus.
- **[HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)** — echte Zonenverletzungsprüfung und E-STOP-Anforderung, mit erzwungener Kalibrierungsaktualität.

*Kognitiver KI-Knoten (Hailo-10)*
- **[HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)** — Integrationsknoten für die Hailo-10-Cognitive-Pipeline (LLM-/VLA-/Sprach-Orchestrierung).
- **[HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)** — echte Aktions-Token-Kodierung/-Dekodierung und Trajektoriengenerierung für ein Vision-Language-Action-Modell.
- **[HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)** — echtes Sprach-Frontend (VAD + Intent-Parser) mit einem begrenzten, bestätigungsgesicherten Watch-Relay.
- **[HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)** — echte regelbasierte Aufgabenzerlegung und semantische Fehlerbehebung über MCU-Fehlercodes.
- **[HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)** — echte, nur auf der Standardbibliothek basierende TF-IDF-Dokumentensuche über die eigenen Markdown-Dokumente dieses Ökosystems.

*Orchestrierung & Schwarm*
- **[HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)** — Integrationsknoten mit einem echten gRPC/Protobuf-Health-Report-Vertrag und einer Missions-Zustandsmaschine.
- **[HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)** — echte prioritätsbasierte Job-Queue mit Deduplizierung, über eine echte HTTP-API.
- **[HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)** — echter gRPC-basierter Flotten-Health-Watchdog mit Retry/Backoff und Identitäts-Mismatch-Erkennung.
- **[HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)** — echter RRT-basierter 3D-Pfadplaner mit echter Hindernis-/Arbeitsraum-Kollisionsvalidierung.
- **[HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)** — echte CRDT-LWW-Element-Map-Zustandssynchronisation, eigenschaftsgetestet auf Multi-Zellen-Konvergenz.

*Digitaler Zwilling & Simulation*
- **[HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)** — Integrationsknoten für die Digital-Twin-Engine, mit einem echten Versionskompatibilitäts-Sync-Vertrag.
- **[HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)** — echte Hardware-in-the-Loop-Sicherheitsverriegelung, die Befehle zwischen Simulation und echter Hardware routet.
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
- **[HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)** — WearOS-Begleit-App mit echten haptischen Alarmen und einem Sprach-Relay zum gekoppelten Telefon.
- **[URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)** — Firmware für ein Platinenmontagegestell mit echter Werkzeug-ID-Dekodierung und Smart-Idle-Vorheizlogik.
- **[URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)** — Firmware plus ein echter Python-Vision-Begleiter für einen Thermal-/RGB-Inspektionswerkzeugkopf.
- **[HYDRA-UMC-UPDATER](https://github.com/JuanenRac/HYDRA-UMC-UPDATER)** — administratives Desktop-Tool, das jedes Repository in diesem Ökosystem entdeckt, klont und aktualisiert.


---

## 📚 Dokumentation & Community

- **[docs/API.md](docs/API.md)** — die echte HTTP-Endpunkt-Referenz: die Anfrage-/Antwortform von `GET /probe`/`GET /current`, vollständige Beispiel-XML-Umschläge, und ein expliziter Hinweis darauf, was noch ein Platzhalter ist (der einzige feste HydraNode, `Availability`/`Execution` noch nicht mit echtem Roboterzustand verbunden).
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Technologie-Stack und Coding-Richtlinien für einen Pull Request.
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — die in dieser Community erwarteten Verhaltensstandards.
- **[SECURITY.md](SECURITY.md)** — wie man eine Schwachstelle meldet, und die echten Sicherheitsschwerpunkte dieses Projekts.
- **[SUPPORT.md](SUPPORT.md)** — wo man Fragen stellt und Fehler meldet.
- **[LICENSE.md](LICENSE.md)** — die eigene Lizenz dieses Projekts.

## 👤 AUTOR
**JuanenRac** (Electro Hobby 3D)
📧 electrohobby3d@gmail.com
📺 [youtube.com/@electrohobby3d](https://youtube.com/@electrohobby3d)

## 📜 LIZENZ
GPL-3.0 - Siehe LICENSE für Details.
