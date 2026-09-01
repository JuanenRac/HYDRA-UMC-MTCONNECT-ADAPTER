<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | 🇫🇷 <b>Français</b> | <a href="README_ita.md">🇮🇹 Italiano</a> | <a href="README_deu.md">🇩🇪 Deutsch</a> | <a href="README_zho.md">🇨🇳 简体中文</a> | <a href="README_jpn.md">🇯🇵 日本語</a></p>

### 🛠️ Interface XML/HTTP standardisée pour la surveillance des machines-outils

<p align="left">
  <img src="https://img.shields.io/badge/Licence-GPL%203.0-blue.svg" alt="GPL 3.0">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="MTConnect">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="XML/HTTP">
</p>

---

## 1. 🛠️ APERÇU TECHNIQUE

**HYDRA-UMC-MTCONNECT-ADAPTER** est la passerelle héritée (legacy) et standard d'usine pour la surveillance des machines-outils. Il implémente le protocole MTConnect (ANSI/MTC1.4), exposant l'essaim robotique comme un ensemble de machines-outils standardisées.

Il fournit une interface XML/HTTP en lecture seule qui permet aux logiciels industriels traditionnels de surveiller l'état d'exécution, les positions des outils et les données des capteurs de chaque HydraNode sans avoir besoin de pilotes spécialisés.

### Caractéristiques principales :
* 🏭 **Données machine standardisées :** Expose les robots Hydra en tant qu'appareils conformes à MTConnect.
* 📄 **Flux de données XML :** Mises à jour périodiques et pilotées par les événements au format XML standard.
* 🌐 **Interface HTTP :** Accessible via de simples requêtes RESTful pour une intégration facile.
* 🔍 **Compatibilité avec les agents :** Fonctionne de manière transparente avec les agents et collecteurs MTConnect existants.
* 📐 **Mappage réel unité/qualité :** L'unité native, la qualité, l'horodatage UTC et le code d'erreur de chaque DataItem sont calculés par un mappage réel et versionné - testable sans matériel. *(implémenté)*
* 🩹 **Sortie en mode dégradé :** Une source en panne ou qui rapporte des données invalides restitue la propre valeur réelle `UNAVAILABLE` de MTConnect avec un code d'erreur, pas un crash ni des données obsolètes. *(implémenté)*

---

## 2. 🔄 FLUX DE DONNÉES MTCONNECT

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["Flux XML / SHDR"]
    XML --> AGENT["AGENT MTCONNECT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Moniteur Industriel / ERP"]
```

---

## 3. 🧱 ARCHITECTURE & DÉCISIONS DE CONCEPTION

* **Pourquoi c'est un frère, pas un sous-module, de HYDRA-UMC-GATEWAY-INDUSTRIAL.** Chaque adaptateur de protocole est un processus déployable/redémarrable séparément - un problème de génération XML MTConnect ne fait jamais tomber les adaptateurs OPC-UA ou MQTT qui tournent à côté.
* **Pourquoi un vrai flux device/agent MTConnect, pas un export XML générique.** Les logiciels d'usine compatibles MTConnect (beaucoup d'outils CNC/MES) attendent le schéma device/agent/composant spécifique défini par le standard - un export générique nécessiterait un analyseur sur mesure de l'autre côté, ce qui viderait de son sens le fait de parler MTConnect.
* **Pourquoi le point d'entrée n'imprime qu'identité/version, et se termine après la mise en place d'un listener de health-check.** Étape d'andamiaje, même raison que le propre README du parent - un vrai adaptateur est de longue durée par nature.
* **Comment cela s'intègre dans le reste de l'écosystème.** Un service frère sous HYDRA-UMC-GATEWAY-INDUSTRIAL - traduit le propre état de HYDRA-UMC-SERVER en un vrai flux device/agent MTConnect.
* **De vrais tests HTTP, pas seulement une vérification de compilation.** `tests/server.test.ts` utilise `supertest` (une vraie requête HTTP sur un vrai socket en écoute) pour vérifier que `GET /probe` et `GET /current` renvoient un XML conforme au format du spec, avec des espaces de noms concordants, des ids `Device`/`DataItem` cohérents entre les deux documents, et un `instanceId` partagé.
* **Pourquoi la conversion d'unités, la classification de qualité et la lecture d'une machine sont trois modules distincts.** `src/units.ts` (mathématiques de conversion pures), `src/dataitem.ts` (mappage qualité/horodatage/code d'erreur) et `src/reader.ts` (interrogation/mise en cache d'un `MachineReader`) sont chacun testables séparément, sans matériel ni HTTP - le souci même de l'audit de promotion : les bugs de conversion d'unités détectés via un aller-retour HTTP complet sont lents à isoler et faciles à manquer.
* **Pourquoi un DataItem dégradé restitue la propre valeur réelle `UNAVAILABLE` de MTConnect, pas une forme d'erreur personnalisée.** Les Agents et collecteurs MTConnect savent déjà afficher `UNAVAILABLE` - réutiliser le propre vocabulaire du spec signifie qu'un vrai outil en aval se dégrade proprement dès aujourd'hui, pas une fois qu'on lui a appris une convention spécifique à HYDRA-UMC. L'attribut `errorCode` (`NO_DATA`/`UNIT_CONVERSION_ERROR`/`SOURCE_UNAVAILABLE`) est le propre ajout v0 de ce projet pour un diagnostic réel, documenté comme tel plutôt que présenté comme un attribut MTConnect standard.
* **Pourquoi la limite d'interrogation de `CachedReader` est générique, pas codée en dur pour `spindle_temp`.** Aucune source machine réelle n'existe encore dans cet environnement, mais le risque réel contre lequel elle protège - marteler de requêtes un contrôleur vieux de plusieurs décennies à chaque appel de `/current` - s'applique à toute source qui remplacera un jour `FixtureMachineReader`, donc la limitation vit au niveau de l'interface `MachineReader`, pas dans la gestion propre d'un seul DataItem.

---

## 📂 STRUCTURE DES RÉPERTOIRES

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/         # Code source (Node/TypeScript - Adaptateur, Mappeur, HTTP)
├── docs/        # Documentation et guides de configuration
├── build/       # Sortie compilée (npm run build)
├── images/      # Médias et diagrammes
├── scripts/     # Scripts utilitaires (bump-version.mjs)
└── README.md
```

Service réseau pur, sans matériel propre - `hardware/`, `firmware/` et
`os/` sont omis conformément à la politique de structure du dépôt.

---

## 🛠️ ENVIRONNEMENT DE DÉVELOPPEMENT

### Prérequis
- [Node.js](https://nodejs.org/) (v18 ou supérieur recommandé)
- npm

### Installation
```bash
npm install
```

### Mode Développement
Exécute l'adaptateur directement avec `tsx` (sans bundler) :
- **Windows :** double-cliquer sur `dev.bat` ou exécuter `npm run dev`
- **Linux/Mac :** exécuter `./dev.sh` ou `npm run dev`

### Build de Production
Regroupe l'adaptateur en un seul fichier déployable avec esbuild :
- **Windows :** double-cliquer sur `build.bat` ou exécuter `npm run build`
- **Linux/Mac :** exécuter `./build.sh` ou `npm run build`

Puis démarrez-le avec :
```bash
npm start
```

L'adaptateur écoute sur `0.0.0.0:5000` - tout Agent/collecteur MTConnect
peut interroger `GET http://<host>:5000/probe` (modèle statique de
l'appareil) et `GET http://<host>:5000/current` (dernières valeurs de
DataItem).

### Gestion des versions
Chaque `npm run build` réel incrémente automatiquement le `version` de
`package.json` (`scripts/bump-version.mjs`, première étape du script
`build`) - un « compteur kilométrique » en base 10 : patch +1 par build,
avec report vers minor (et de minor vers major) au-delà de 9 plutôt que
d'atteindre un segment à deux chiffres (`0.0.9` -> `0.1.0`, pas `0.0.10`).

---

## 🚀 ROADMAP
* **Phase 1 :** Implémentation d'OPC-UA Pub/Sub pour l'échange de données à haute vitesse et le pontage des protocoles hérités.
* **Phase 2 :** Cluster de brokers MQTT pour la gestion massive des appareils IoT et une haute simultanéité.
* **Phase 3 :** Prise en charge de l'adaptateur MTConnect pour l'intégration de machines CNC et d'automates multi-fournisseurs.
* **Phase 4 :** Prise en charge de l'agrégation multi-appareils MTConnect et flux de télémétrie XML/HTTP standardisé.

---

## 🔗 Projets Liés

Ce projet fait partie d'un écosystème robotique plus large du même auteur (JuanenRac / Electro Hobby 3D), couvrant firmware, logiciel de contrôle, nœuds IA et outillage de flotte. Bon à savoir, car une demande pourrait en réalité concerner l'un de ces projets plutôt que ce dépôt.

### Famille

**Parent :** **[HYDRA-UMC-GATEWAY-INDUSTRIAL](https://github.com/JuanenRac/HYDRA-UMC-GATEWAY-INDUSTRIAL)** — le parent d'intégration auquel se connecte cet adaptateur MTConnect.

**Frères et sœurs :**
- **[HYDRA-UMC-OPCUA-SERVER](https://github.com/JuanenRac/HYDRA-UMC-OPCUA-SERVER)** — adaptateur de protocole frère, même parent.
- **[HYDRA-UMC-MQTT-BROKER](https://github.com/JuanenRac/HYDRA-UMC-MQTT-BROKER)** — adaptateur de protocole frère, même parent.

### Relation Directe (hors de la famille)

- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — la source de l'état exposé par cet adaptateur.

### Reste de l'Écosystème

**Plateforme HYDRA-UMC** — la cellule de micro-usine multi-robot
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — la carte mère CM5 + STM32H745 orchestrant jusqu'à 8 bras robotiques.
- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — le backend Express/WebSocket auquel parle chaque client de contrôle.
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — tableau de bord de contrôle web, visualisation 3D multi-robot.
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — application de contrôle Android via Wi-Fi/Bluetooth.
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — application de contrôle iOS/iPadOS construite en Flutter.
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — centre de commande d'essaim de bureau (Python/PySide6).
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — éditeur de modèles URDF de bureau pour le catalogue de robots.
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — interface tactile native pour l'écran DSI embarqué.

**Plateforme URTC** — le contrôleur de tête d'outil que porte chaque bras HYDRA-UMC
- **[URTC](https://github.com/JuanenRac/URTC)** — contrôleur de tête d'outil sur bus CAN, 25 profils d'outil.
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — outil de bureau de flashage CAN-OTA + SWD/JTAG.
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — outil de bureau de diagnostic CAN en direct.
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — alternative basée navigateur via l'API Web Serial.

**🎥 Nœud de Vision IA (Hailo-8)**
- [HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)
- [HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)
- [HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)
- [HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)
- [HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)

**🧠 Nœud Cognitif IA (Hailo-10)**
- [HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)
- [HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)
- [HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)
- [HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)
- [HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)

**🐝 Orchestration et Essaim**
- [HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)
- [HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)
- [HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)
- [HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)
- [HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)

**🎮 Jumeau Numérique et Simulation**
- [HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)
- [HYDRA-UMC-PHYSICS-REPLICA](https://github.com/JuanenRac/HYDRA-UMC-PHYSICS-REPLICA)
- [HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)
- [HYDRA-UMC-SYNTHETIC-DATA-GEN](https://github.com/JuanenRac/HYDRA-UMC-SYNTHETIC-DATA-GEN)

**📊 Données et Analytique**
- [HYDRA-UMC-DATALAKE](https://github.com/JuanenRac/HYDRA-UMC-DATALAKE)
- [HYDRA-UMC-TELEMETRY-COLLECTOR](https://github.com/JuanenRac/HYDRA-UMC-TELEMETRY-COLLECTOR)
- [HYDRA-UMC-ANOMALY-DETECTOR](https://github.com/JuanenRac/HYDRA-UMC-ANOMALY-DETECTOR)
- [HYDRA-UMC-PRODUCTION-REPORTS](https://github.com/JuanenRac/HYDRA-UMC-PRODUCTION-REPORTS)

**🛠️ Outils Complémentaires**
- [URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)
- [URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)
- [HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)
- [HYDRA-UMC-TOOL-CLI](https://github.com/JuanenRac/HYDRA-UMC-TOOL-CLI)
- [HYDRA-UMC-DASHBOARD-AI](https://github.com/JuanenRac/HYDRA-UMC-DASHBOARD-AI)


## 👤 AUTEUR
**JuanenRac** (Electro Hobby 3D)
📧 electrohobby3d@gmail.com

## 📜 LICENCE
GPL-3.0 - Voir le fichier LICENSE pour plus de détails.
