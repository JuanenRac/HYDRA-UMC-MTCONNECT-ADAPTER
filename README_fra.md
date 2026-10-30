<!-- =============================================================================
HYDRA-UMC-MTCONNECT-ADAPTER - MTConnect probe/current/sample endpoints
Copyright (C) JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
GPL-3.0-or-later - see LICENSE
============================================================================= -->

<p align="center">
  <img src="images/HYDRA_UMC_BANNER.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER banner" width="100%">
</p>

# 🏭 HYDRA-UMC-MTCONNECT-ADAPTER

<p align="center"><a href="README.md">🇺🇸 English</a> | <a href="README_spa.md">🇪🇸 Español</a> | 🇫🇷 <b>Français</b> | <a href="README_ita.md">🇮🇹 Italiano</a> | <a href="README_deu.md">🇩🇪 Deutsch</a> | <a href="README_zho.md">🇨🇳 简体中文</a> | <a href="README_jpn.md">🇯🇵 日本語</a> | <a href="README_por.md">🇵🇹 Português</a></p>

### 🛠️ Interface XML/HTTP standardisée pour la surveillance des machines-outils

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL%203.0--or--later-blue.svg" alt="GPL 3.0 or later">
  <img src="https://img.shields.io/badge/Standard-MTConnect-blue.svg" alt="Standard">
  <img src="https://img.shields.io/badge/Format-XML%20%2F%20HTTP-orange.svg" alt="Format">
  <img src="https://img.shields.io/badge/Tests-131%20passing-2ea44f.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Version-0.1.9-0f6cbd.svg" alt="Version">
  <img src="https://img.shields.io/badge/Maturity-functional-0F6CBD.svg" alt="Maturity">
</p>

---

**Vérification d'honnêteté - ce qui fonctionne réellement aujourd'hui :** la conversion d'unités (`src/units.ts`), le mappage qualité/horodatage/code d'erreur (`src/dataitem.ts`), le polling/cache (`src/reader.ts`), le lecteur de machine réel adossé à HYDRA-UMC-SERVER (`src/hydraServerReader.ts`), et le serveur HTTP (`src/server.ts`) sont tous réels et testés (131 tests passants dans 11 fichiers, incluant de vraies requêtes HTTP sur un vrai socket en écoute via `supertest` - pas seulement une vérification de compilation). Le modèle d'appareil est figé à exactement un HydraNode (`hydra_umc_1`) - cela prouve que la surface HTTP et la forme XML sont conformes à la spec de bout en bout, mais un déploiement réel surveillant plus d'un robot devrait générer cela à partir du propre inventaire en direct de HYDRA-UMC-SERVER, ce qui n'arrive pas encore. Le XML émis a été vérifié pour une forme conforme à la spec (espaces de noms, ids `Device`/`DataItem`, un `instanceId` partagé) mais n'a pas encore été testé en direct contre un véritable Agent/collecteur MTConnect tiers. Voir `CHANGELOG.md` pour ce qui a été livré exactement jusqu'à présent.

---

> **État de la sûreté et de la cybersécurité :** cet écosystème n'est pas un système de sécurité certifié. Il n'existe pas encore de chaîne d'E-STOP matérielle, ni de limites ou de verrouillages imposés par le firmware, ni de commande de mouvement vérifiée ; les images de firmware sont contrôlées par CRC-32 et une signature Ed25519, et une compilation de version refuse les clés de développement publiées (les têtes d'outil et les cartes d'extension derrière le relais utilisent encore les chargeurs d'URTC, qui prennent un HMAC-SHA256 à clé partagée au lieu d'une signature) ; TLS et TLS mutuel sont optionnels et désactivés par défaut ; aucune carte propre n'a encore été assemblée ni testée. Lisez la [base de sécurité](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md) et le [modèle de menaces](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md) avant de vous fier à une affirmation d'ici pour la sécurité d'une personne.

---

## 📋 En un coup d'œil

| | |
|---|---|
| Version | `0.1.9` |
| Maturité | Fonctionnel |
| Tests | 131 (`npm test`) |
| Technologie | Node.js / Express / MTConnect 1.7 XML |
| Cible | Le Raspberry Pi CM5 d'une cellule HYDRA-UMC |
| Sur matériel réel | Pas encore : aucune exécution sur du matériel réel n'est consignée pour cette version |

**Aller à :** [Présentation](#-présentation) · [Architecture](#-architecture) · [Configuration](#-configuration) · [Démarrage rapide](#-démarrage-rapide) · [Tests](#-tests) · [Structure du dépôt](#-structure-du-dépôt) · [Projets liés](#-projets-liés)

## 🚦 État du projet

Chaque ligne est une partie de ce dépôt et le feu dit où elle en est aujourd'hui. Elle est écrite d'après ce que le dépôt peut montrer (tests, compilations, exécutions), pas d'après ce qui est prévu.

🟢 Fait et vérifié · 🟡 Fonctionne, avec des limites connues · 🟠 À moitié fait ou pas encore vérifié · 🔴 Pas fait ou ne fonctionne pas

| Domaine | État | Ce que cela veut dire ici |
|---|---|---|
| Logiciel | 🟡 | Fonctionne pour son usage principal ; la vérification d'honnêteté ci-dessus liste ce qui manque encore |
| Tests | 🟢 | 131 tests automatiques, exécutés à chaque modification |
| Matériel réel | 🔴 | Pas encore : aucune exécution sur du matériel réel n'est consignée pour cette version |
| Documentation | 🟢 | README en huit langues, vérifié par rapport au manifeste à chaque modification |

## 🎯 Présentation

**HYDRA-UMC-MTCONNECT-ADAPTER** est la passerelle héritée (legacy) et standard d'usine pour la surveillance des machines-outils. Il implémente le protocole MTConnect (documents de la version 1.7, vérifiés avec le XSD officiel), exposant l'essaim robotique comme un ensemble de machines-outils standardisées.

Il fournit une interface XML/HTTP en lecture seule qui permet aux logiciels industriels traditionnels de surveiller l'état d'exécution, la disponibilité et la température de la broche du HydraNode sans avoir besoin de pilotes spécialisés.

### Caractéristiques principales :
* 🏭 **Données machine standardisées :** Expose un HydraNode en tant qu'appareil conforme à MTConnect. *(aujourd'hui figé à exactement un HydraNode - `hydra_umc_1` - voir `docs/API.md` ; prouve que la surface HTTP et la forme XML sont conformes à la spécification de bout en bout, un déploiement réel générerait ceci à partir de la propre liste de robots en direct de HYDRA-UMC-SERVER)*
* 📄 **Flux de données XML :** Les blocs `<Events>`/`<Samples>` réels et interrogés de `GET /current` au format XML standard. *(implémenté)*
* 🔌 **Source machine réelle :** `HydraServerMachineReader` (`src/hydraServerReader.ts`, `HYDRA_UMC_SERVER_URL`) interroge un vrai HYDRA-UMC-SERVER en direct via son propre `GET /api/settings` et rapporte l'état réel (`AVAILABLE`/`ACTIVE`/`INTERRUPTED`/`STOPPED`/`READY`) d'un vrai robot - pas seulement le repli `FixtureMachineReader`. Voir `docs/API.md`. *(implémenté)*
* 🌐 **Interface HTTP :** Accessible via de simples requêtes RESTful pour une intégration facile. *(implémenté)*
* 🔍 **Compatibilité avec les agents :** Vérifié pour émettre un XML conforme à la spécification (namespaces corrects, ids `Device`/`DataItem` cohérents, un `instanceId` partagé - voir `tests/server.test.ts`) - pas encore testé en direct contre un vrai agent/collecteur MTConnect tiers.
* 📐 **Mappage réel unité/qualité :** L'unité native, la qualité, l'horodatage UTC et le code d'erreur de chaque DataItem sont calculés par un mappage réel et versionné - testable sans matériel. *(implémenté)*
* 🩹 **Sortie en mode dégradé :** Une source en panne ou qui signale des données invalides est rendue avec la vraie valeur `UNAVAILABLE` de MTConnect, pas comme un plantage ni des données périmées ; le document reste valide selon le schéma officiel. *(implémenté)*
* 🧮 **Tampon d'observations :** chaque changement d'un DataItem est une observation avec son propre numéro de séquence, conservée dans un tampon de `MTCONNECT_BUFFER_SIZE` observations ; `GET /sample?from=<nextSequence>&count=<n>` renvoie exactement ce qui s'est passé depuis, si bien qu'une boucle client ne perd ni ne répète jamais un changement. *(implémenté)*
* 🧪 **Pas de données inventées :** sans `HYDRA_UMC_SERVER_URL`, tous les DataItems sont `UNAVAILABLE` ; les valeurs synthétiques de démonstration ne sont servies qu'avec `HYDRA_UMC_MTCONNECT_DEMO=1`, et l'appareil l'indique dans sa description. *(implémenté)*
* 🧩 **Conditions, routes par appareil et statuts HTTP :** un DataItem CONDITION est rendu en Normal, Warning, Fault ou Unavailable (avec son message et son code natif) et déclaré dans `/probe` quand l'appareil en a un ; l'appareil déclare `ASSET_CHANGED` et `ASSET_REMOVED` (il n'a pas d'actifs, ils restent UNAVAILABLE) ; `/HydraNode_1/probe`, `/current` et `/sample` répondent pour cet appareil ; `HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1` fait porter à un MTConnectError le statut HTTP 400 ou 404 au lieu de 200 (désactivé par défaut). Le tout vérifié avec le XSD officiel. *(implémenté)*
* 🔌 **Sortie SHDR pour un cppagent :** si `HYDRA_UMC_MTCONNECT_SHDR_PORT` est défini, l'adaptateur sert aussi les mêmes observations sous forme de lignes SHDR (`heure|dataItemId|valeur`, conditions sous la forme `heure|id|NIVEAU|codeNatif|||message`) en TCP, afin qu'un agent MTConnect standard puisse le lire. Un client reçoit d'abord la dernière valeur de chaque DataItem, puis chaque changement ; la seule ligne qu'il peut envoyer est `* PING`, à laquelle répond `* PONG`. Lecture seule. Il écoute sur `127.0.0.1` sauf si `HYDRA_UMC_MTCONNECT_SHDR_HOST` dit autre chose. Testé avec un agent simulé. *(implémenté, pas encore essayé avec un vrai cppagent)*
* 🔌 **Lit le flux SHDR du pont CNC (facultatif) :** avec `HYDRA_UMC_MTCONNECT_SHDR_SOURCE=hôte:port`, l'agent tire l'exécution et la disponibilité de la machine de la sortie SHDR d'un autre adaptateur ; une connexion perdue affiche tous les DataItem comme indisponibles au lieu des dernières valeurs. Lecture seule.

## 🧩 Rôle dans HYDRA-UMC

**HYDRA-UMC-MTCONNECT-ADAPTER** présente les robots aux logiciels de supervision d'usine comme des appareils MTConnect : du XML en lecture seule sur HTTP (`/probe`, `/current`, `/sample`), alimenté depuis `HYDRA-UMC-SERVER`. Il n'envoie aucune commande à aucune machine.

## 🏛️ Architecture

<p align="center">
  <img src="images/architecture.svg" alt="HYDRA-UMC-MTCONNECT-ADAPTER architecture" width="100%">
</p>

<details>
<summary>Version texte du diagramme (Mermaid)</summary>

```mermaid
flowchart LR
    HYDRA["HYDRA-SERVER"] --> ADAP["MTCONNECT-ADAPTER"]
    ADAP --> XML["Flux XML / HTTP"]
    XML --> AGENT["AGENT MTCONNECT"]
    AGENT --> HTTP["HTTP GET /current"]
    HTTP --> MONITOR["Moniteur Industriel / ERP"]
```

</details>

### ARCHITECTURE & DÉCISIONS DE CONCEPTION

* **Pourquoi c'est un frère, pas un sous-module, de HYDRA-UMC-GATEWAY-INDUSTRIAL.** Chaque adaptateur de protocole est un processus déployable/redémarrable séparément - un problème de génération XML MTConnect ne fait jamais tomber les adaptateurs OPC-UA ou MQTT qui tournent à côté.
* **Pourquoi un vrai flux device/agent MTConnect, pas un export XML générique.** Les logiciels d'usine compatibles MTConnect (beaucoup d'outils CNC/MES) attendent le schéma device/agent/composant spécifique défini par le standard - un export générique nécessiterait un analyseur sur mesure de l'autre côté, ce qui viderait de son sens le fait de parler MTConnect.
* **Comment cela s'intègre dans le reste de l'écosystème.** Un service frère sous HYDRA-UMC-GATEWAY-INDUSTRIAL - traduit le propre état de HYDRA-UMC-SERVER en un vrai flux device/agent MTConnect.
* **De vrais tests HTTP, pas seulement une vérification de compilation.** `tests/server.test.ts` utilise `supertest` (une vraie requête HTTP sur un vrai socket en écoute) pour vérifier que `GET /probe` et `GET /current` renvoient un XML conforme au format du spec, avec des espaces de noms concordants, des ids `Device`/`DataItem` cohérents entre les deux documents, et un `instanceId` partagé.
* **Pourquoi la conversion d'unités, la classification de qualité et la lecture d'une machine sont trois modules distincts.** `src/units.ts` (mathématiques de conversion pures), `src/dataitem.ts` (mappage qualité/horodatage/code d'erreur) et `src/reader.ts` (interrogation/mise en cache d'un `MachineReader`) sont chacun testables séparément, sans matériel ni HTTP - une préoccupation explicite : les bugs de conversion d'unités détectés via un aller-retour HTTP complet sont lents à isoler et faciles à manquer.
* **Pourquoi un DataItem dégradé rend la vraie valeur `UNAVAILABLE` de MTConnect et non une forme d'erreur personnalisée.** Les agents et clients MTConnect savent déjà afficher `UNAVAILABLE` : réutiliser le vocabulaire de la spécification elle-même permet à un outil en aval de se dégrader proprement dès aujourd'hui. La raison (pas de données, conversion d'unité, source en panne, périmé) reste hors du document : le schéma officiel n'a pas d'attribut pour cela, et un analyseur validant rejette un document qui en porte un en trop.
* **Pourquoi la limite d'interrogation de `CachedReader` est générique, pas codée en dur pour `spindle_temp`.** Aucune source machine réelle n'existe encore dans cet environnement, mais le risque réel contre lequel elle protège - marteler de requêtes un contrôleur vieux de plusieurs décennies à chaque appel de `/current` - s'applique à toute source qui remplacera un jour `FixtureMachineReader`, donc la limitation vit au niveau de l'interface `MachineReader`, pas dans la gestion propre d'un seul DataItem.

## ⚙️ Configuration

Le port d'écoute est lu d'abord dans `HYDRA_UMC_MTCONNECT_PORT` (5000 par défaut). Le `PORT` partagé reste valable en dernier recours et affiche un avertissement, de sorte qu'un fichier d'environnement partagé par plusieurs services ne puisse pas déplacer l'agent sur le port d'un autre service par accident ; une valeur définie mais qui n'est pas un port valide arrête le démarrage, et le contrôle de santé du conteneur suit le même ordre.

## 🚀 Démarrage rapide

Nécessite Node.js 20 ou plus récent avec npm.

```bash
npm install
npm test
npm run build
npm start
curl http://127.0.0.1:5000/probe
```

## 🧪 Tests

131 tests automatiques s'exécutent avec `npm test`. Ils n'ont besoin ni de matériel ni de rien en dehors de cette machine.

La CI exécute `HYDRA_UMC_CI=1 python tools/ci_validate.py`, qui vérifie le manifeste, les documents, les huit README et les images.

## 🏗️ Compilation et publication

### Prérequis
- [Node.js](https://nodejs.org/) (v20 ou supérieur recommandé)
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
l'appareil), `GET http://<host>:5000/current` (dernières valeurs de
DataItem) et `GET http://<host>:5000/sample?from=<sequence>` (sémantique
réelle et honnête de tampon de streaming - voir `docs/API.md`).

Pour rapporter un vrai robot, définissez `HYDRA_UMC_SERVER_URL`. HYDRA-UMC-SERVER ne répond à `GET /api/settings` qu'à un compte connecté ; donnez donc aussi un identifiant à l'adaptateur : `HYDRA_UMC_SERVER_TOKEN` (un jeton que le serveur a déjà émis), ou `HYDRA_UMC_SERVER_USER` et `HYDRA_UMC_SERVER_PASSWORD` (l'adaptateur se connecte lui-même et se reconnecte quand la session expire). Sans aucun des deux, la source est signalée comme indisponible (`SOURCE_UNAVAILABLE`). `HYDRA_UMC_MTCONNECT_HOST` restreint l'adresse d'écoute (`0.0.0.0` par défaut), par exemple à `127.0.0.1` derrière un proxy inverse local. Les réponses du serveur sont lues jusqu'à 4 Mio.

### Gestion des versions
`npm run build` ne fait que regrouper le serveur. La version n'est augmentée que par `python tools/hydra_project_tool.py bump` (via `bump_manifest_version.py`), un « compteur kilométrique » en base 10 : patch +1 par bump, avec report sur minor (et de minor sur major) après 9 au lieu d'atteindre un segment à deux chiffres (`0.0.9` -> `0.1.0`, pas `0.0.10`).

## 📂 Structure du dépôt

<p align="center">
  <img src="images/repository-structure.svg" alt="Repository structure of HYDRA-UMC-MTCONNECT-ADAPTER" width="100%">
</p>

<details>
<summary>Version texte de l'arborescence</summary>

```text
HYDRA-UMC-MTCONNECT-ADAPTER/
├── src/                       Code source (Node/TypeScript - Adaptateur, Mappeur, HTTP)
├── tests/                     Suite Vitest - mappage des data items, unités, comportement du reader et du serveur
├── docs/                      documents du projet
├── images/                    Médias et diagrammes
├── schemas/                   mtconnect-1.7/ : les schémas XSD de MTConnect 1.7 contre lesquels les réponses sont validées, avec leur NOTICE
├── scripts/                   Scripts utilitaires (bump-version.mjs)
├── tools/                     build_test.py (contrôle de build sans version), ci_validate.py (validation manifeste/CHANGELOG/docs utilisée par la CI), hydra_project_tool.py et les partagés _doc_policy.py et _readme_parity.py
├── .github/                   workflow de CI et modèles de tickets
├── CHANGELOG.md               ce qui a changé à chaque version
├── Dockerfile                 image de conteneur
├── build-test.sh              vérification de build sans modification
├── build.sh                   construit et vérifie ; ne change jamais la version
├── bump_manifest_version.py   synchronise la version du manifeste
├── dev.sh                     mode développement
├── hydra-umc.project.json     manifeste : version, maturité, famille
├── package.json               métadonnées et scripts du paquet
└── test.sh                    lance les tests
```

</details>

## 🗺️ Feuille de route et limites connues

**Limites connues aujourd'hui**

* **Phase 1 :** Implémentation d'OPC-UA Pub/Sub pour l'échange de données à haute vitesse et le pontage des protocoles hérités.
* **Phase 2 :** Cluster de brokers MQTT pour la gestion massive des appareils IoT et une haute simultanéité.
* **Phase 3 :** Prise en charge de l'adaptateur MTConnect pour l'intégration de machines CNC et d'automates multi-fournisseurs.
* **Phase 4 :** Prise en charge de l'agrégation multi-appareils MTConnect et flux de télémétrie XML/HTTP standardisé.

## 🌍 Langues

Ce README et les documents du dépôt existent en huit langues : anglais, espagnol, allemand, français, italien, japonais, chinois et portugais (Portugal). Ils sont écrits ensemble et la CI vérifie que les huit fichiers ont les mêmes sections et les mêmes liens. Ce dépôt n'a ni écran ni catalogue de messages propre, il n'y a donc aucune chaîne d'interface à traduire.

## 🔗 Projets liés

Ce projet fait partie de l'écosystème robotique HYDRA-UMC du même auteur (JuanenRac / Electro Hobby 3D). Bon à savoir, car une demande pourrait en réalité concerner l'un de ceux-ci plutôt que ce dépôt.

**Projet Parent**
- **[HYDRA-UMC-GATEWAY-INDUSTRIAL](https://github.com/JuanenRac/HYDRA-UMC-GATEWAY-INDUSTRIAL)** — hub d'intégration relayant vers les protocoles industriels, avec une vraie couche de liste blanche de commandes/contre-pression ; le parent dont ce dépôt est un adaptateur de protocole spécifique, au sein de sa propre passerelle industrielle.

**Projets Frères** — les autres adaptateurs de protocole de la propre passerelle industrielle de HYDRA-UMC-GATEWAY-INDUSTRIAL
- **[HYDRA-UMC-OPCUA-SERVER](https://github.com/JuanenRac/HYDRA-UMC-OPCUA-SERVER)** — vrai espace d'adressage OPC-UA, vérifié avec une vraie session client du protocole binaire.
- **[HYDRA-UMC-MQTT-BROKER](https://github.com/JuanenRac/HYDRA-UMC-MQTT-BROKER)** — vrai broker MQTT avec authentification par client optionnelle et ACL de sujets.

**Directement Liés**
- **[HYDRA-UMC-SERVER](https://github.com/JuanenRac/HYDRA-UMC-SERVER)** — le vrai backend headless (REST/WebSocket) auquel parle réellement chaque client de contrôle — la source de l'état que cet adaptateur expose.

**Fait Également Partie de l'Écosystème**

*Matériel & Plateforme de Base*
- **[HYDRA-UMC](https://github.com/JuanenRac/HYDRA-UMC)** — la conception de la carte mère du bras robotique : hôte CM5 + coprocesseur STM32H745 double cœur, destinée à coordonner jusqu'à 8 bras-outils via CAN-OTA/SPI-OTA (firmware à un stade précoce ; aucune carte assemblée pour l'instant).
- **[HYDRA-UMC-OS](https://github.com/JuanenRac/HYDRA-UMC-OS)** — couche produit reproductible sur Raspberry Pi OS pour le CM5 : agent en lecture seule, config/profils validés, provisionnement WiFi de premier contact.
- **[HYDRA-UMC-SDK](https://github.com/JuanenRac/HYDRA-UMC-SDK)** — le contrat JSON-Schema partagé et la barrière logicielle de contrôle des jobs contre laquelle chaque bridge valide ses commandes (pas une fonction de sécurité certifiée).
- **[HYDRA-UMC-CONNECTOR-HUB](https://github.com/JuanenRac/HYDRA-UMC-CONNECTOR-HUB)** — registre déclaratif et validateur de manifestes d'adaptateur pour les connecteurs de machines externes ; étend la propre idée de contrat du SDK aux machines externes sans remplacer les projets de passerelle industrielle.

*Backend Central & Clients*
- **[HYDRA-UMC-STUDIO](https://github.com/JuanenRac/HYDRA-UMC-STUDIO)** — tableau de bord de contrôle web avec visualisation 3D multi-robot en temps réel.
- **[HYDRA-UMC-SUITE](https://github.com/JuanenRac/HYDRA-UMC-SUITE)** — centre de commande d'essaim de bureau (PySide6) pour plusieurs serveurs à la fois, empaqueté en exécutable autonome.
- **[HYDRA-UMC-ANDROID-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-ANDROID-CONTROL)** — application de contrôle Android native avec connexion biométrique et un compagnon Wear OS jumelé.
- **[HYDRA-UMC-IOS-CONTROL](https://github.com/JuanenRac/HYDRA-UMC-IOS-CONTROL)** — application de contrôle iOS/iPadOS (Flutter) avec synchronisation WebSocket en temps réel.
- **[HYDRA-UMC-DSI](https://github.com/JuanenRac/HYDRA-UMC-DSI)** — interface tactile native pour l'écran tactile DSI 7" embarqué, intégrée directement sur le CM5.
- **[HYDRA-UMC-EDITOR-URDF](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-URDF)** — créateur/éditeur graphique de bureau pour URDF qui envoie les modèles terminés vers le propre catalogue de STUDIO.
- **[HYDRA-UMC-EDITOR-STL](https://github.com/JuanenRac/HYDRA-UMC-EDITOR-STL)** — éditeur de bureau de modèles STL, transformant/remplaçant/retirant/ajoutant de vraies pièces dans le même catalogue de modèles qu'édite aussi HYDRA-UMC-EDITOR-URDF.
- **[HYDRA-UMC-BRIDGE-AMR](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-AMR)** — frontière de coordination pour les flottes AGV/AMR via un éditeur MQTT VDA 5050 (testé uniquement contre une flotte émulée).
- **[HYDRA-UMC-BRIDGE-CNC](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-CNC)** — coordinateur haut niveau pour cellules CNC avec accès au statut/octets de contrôle GRBL (testé uniquement contre un émulateur).
- **[HYDRA-UMC-BRIDGE-DROIDS](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-DROIDS)** — frontière de coordination pour droïdes à pattes/humanoïdes, avec un émetteur de commandes Boston Dynamics Spot (testé uniquement contre un émulateur).
- **[HYDRA-UMC-BRIDGE-LASER](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-LASER)** — coordinateur de cellules laser lisant 3 signaux GPIO de clé/enceinte/verrouillage (testé uniquement contre une puce simulée ; il ne peut ni armer ni tirer un laser).
- **[HYDRA-UMC-BRIDGE-OPENPNP](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-OPENPNP)** — coordinateur haut niveau sûr pour le flux de cartes du pick-and-place OpenPnP.
- **[HYDRA-UMC-BRIDGE-PRINTER3D](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-PRINTER3D)** — frontière de coordination sûre pour imprimantes 3D Moonraker/Klipper, avec de vraies commandes de tâche contrôlées.
- **[HYDRA-UMC-BRIDGE-ROS2](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-ROS2)** — coordinateur avec un transport ROS 2 rclpy à importation paresseuse (pas encore exécuté contre une installation ROS 2).
- **[HYDRA-UMC-BRIDGE-UAV](https://github.com/JuanenRac/HYDRA-UMC-BRIDGE-UAV)** — frontière de coordination pour UAV équipés de caméra, avec un émetteur de commandes MAVLink (testé uniquement contre un émulateur).

*Plateforme d'Outils URTC*
- **[URTC](https://github.com/JuanenRac/URTC)** — firmware pour la carte physique Universal Robot Tool Controller, plus de 25 profils d'outil sur bus CAN.
- **[URTC-FLASHER](https://github.com/JuanenRac/URTC-FLASHER)** — outil de bureau à interface graphique pour flasher les cartes URTC, CAN-OTA plus SWD/JTAG puce complète.
- **[URTC-TESTER](https://github.com/JuanenRac/URTC-TESTER)** — outil de bureau de diagnostic CAN-bus en direct pour cartes URTC, un panneau par profil d'outil.
- **[URTC-WEB-STUDIO](https://github.com/JuanenRac/URTC-WEB-STUDIO)** — alternative basée navigateur à URTC-TESTER via la Web Serial API, sans installation locale.
- **[URTC-GATEWAY](https://github.com/JuanenRac/URTC-GATEWAY)** — passerelle devant le bus CAN d'URTC : liste d'identifiants autorisés, limite de débit et clé de session ; logiciel testé sur ordinateur, pas encore sur un bus réel.

*Nœud IA de Vision (Hailo-8)*
- **[HYDRA-UMC-VISION-NODE](https://github.com/JuanenRac/HYDRA-UMC-VISION-NODE)** — hub d'intégration pour le pipeline de vision Hailo-8, avec une vraie vérification de disponibilité matérielle par étape.
- **[HYDRA-UMC-DETECTION-HEF](https://github.com/JuanenRac/HYDRA-UMC-DETECTION-HEF)** — registre réel de modèles compilés avec vérification de chargement sécurisé par architecture Hailo/checksum.
- **[HYDRA-UMC-VISION-STREAMER](https://github.com/JuanenRac/HYDRA-UMC-VISION-STREAMER)** — générateur réel de pipeline GStreamer + config MediaMTX, avec une vraie frontière d'intégration HailoRT.
- **[HYDRA-UMC-VISUAL-SERVOING-API](https://github.com/JuanenRac/HYDRA-UMC-VISUAL-SERVOING-API)** — loi de correction Position-Based Visual Servoing avec autorisation conditionnée à l'état de zone ; pas encore d'estimation de pose par caméra.
- **[HYDRA-UMC-SAFETY-ZONES](https://github.com/JuanenRac/HYDRA-UMC-SAFETY-ZONES)** — logique v0 de violation de zone, de fraîcheur de calibration et de demande d'E-STOP qui lit les positions d'objets dans un fichier ; aucun détecteur ne l'alimente et aucun E-STOP physique n'y est encore relié.

*Nœud IA Cognitif (Hailo-10)*
- **[HYDRA-UMC-COGNITIVE-NODE](https://github.com/JuanenRac/HYDRA-UMC-COGNITIVE-NODE)** — hub d'intégration pour le pipeline cognitif Hailo-10 (orchestration LLM/VLA/voix).
- **[HYDRA-UMC-VLA-ENGINE](https://github.com/JuanenRac/HYDRA-UMC-VLA-ENGINE)** — vrai encodage/décodage de jetons d'action et génération de trajectoire pour un modèle Vision-Language-Action.
- **[HYDRA-UMC-VOICE-UI](https://github.com/JuanenRac/HYDRA-UMC-VOICE-UI)** — vrai front-end vocal (VAD + analyseur d'intention) avec un relais Watch borné et soumis à confirmation.
- **[HYDRA-UMC-SEMANTIC-PLANNER](https://github.com/JuanenRac/HYDRA-UMC-SEMANTIC-PLANNER)** — vraie décomposition de tâches basée sur des règles et récupération sémantique d'erreurs sur les codes d'erreur MCU.
- **[HYDRA-UMC-DOCS-QA](https://github.com/JuanenRac/HYDRA-UMC-DOCS-QA)** — vraie recherche documentaire TF-IDF (bibliothèque standard uniquement) sur les propres documents Markdown de cet écosystème.
- **[HYDRA-UMC-LOCAL-TECHNICIAN](https://github.com/JuanenRac/HYDRA-UMC-LOCAL-TECHNICIAN)** — technicien de maintenance IA local et à portes de politique pour l'écosystème lui-même - observe, diagnostique et propose des corrections ; les deux niveaux de risque les plus élevés ne sont délibérément pas encore implémentés.

*Orchestration & Essaim*
- **[HYDRA-UMC-ORCHESTRATOR](https://github.com/JuanenRac/HYDRA-UMC-ORCHESTRATOR)** — hub d'intégration avec un vrai contrat de rapport de santé gRPC/Protobuf et une machine à états de mission.
- **[HYDRA-UMC-JOB-DISPATCHER](https://github.com/JuanenRac/HYDRA-UMC-JOB-DISPATCHER)** — vraie file de tâches basée sur la priorité avec déduplication, via une vraie API HTTP.
- **[HYDRA-UMC-NODE-HEALING](https://github.com/JuanenRac/HYDRA-UMC-NODE-HEALING)** — vrai chien de garde de santé de flotte basé sur gRPC, avec retry/backoff et détection d'incohérence d'identité.
- **[HYDRA-UMC-PATH-PLANNER-3D](https://github.com/JuanenRac/HYDRA-UMC-PATH-PLANNER-3D)** — vrai planificateur de trajectoire 3D basé sur RRT, avec vraie validation des collisions obstacle/espace de travail.
- **[HYDRA-UMC-SWARM-SYNC](https://github.com/JuanenRac/HYDRA-UMC-SWARM-SYNC)** — vraie synchronisation d'état CRDT LWW-Element-Map, testée par propriétés pour la convergence multi-cellule.

*Jumeau Numérique & Simulation*
- **[HYDRA-UMC-TWIN](https://github.com/JuanenRac/HYDRA-UMC-TWIN)** — hub d'intégration pour le moteur de jumeau numérique, avec un vrai contrat de synchronisation par compatibilité de version.
- **[HYDRA-UMC-HIL-BRIDGE](https://github.com/JuanenRac/HYDRA-UMC-HIL-BRIDGE)** — routeur hardware-in-the-loop avec un verrouillage logiciel de collision entre simulation et matériel réel (testé sans matériel réel).
- **[HYDRA-UMC-PHYSICS-REPLICA](https://github.com/JuanenRac/HYDRA-UMC-PHYSICS-REPLICA)** — vraie cinématique directe et validation des limites articulaires sur un vrai sous-ensemble URDF.
- **[HYDRA-UMC-SYNTHETIC-DATA-GEN](https://github.com/JuanenRac/HYDRA-UMC-SYNTHETIC-DATA-GEN)** — vrai générateur procédural de scènes 2D avec export d'annotations YOLO/COCO.

*Données & Analytique*
- **[HYDRA-UMC-DATALAKE](https://github.com/JuanenRac/HYDRA-UMC-DATALAKE)** — vrai magasin de séries temporelles basé sur sqlite3, avec une vraie API HTTP d'ingestion/requête.
- **[HYDRA-UMC-ANOMALY-DETECTOR](https://github.com/JuanenRac/HYDRA-UMC-ANOMALY-DETECTOR)** — vrai détecteur d'anomalies FFT + ligne de base statistique, avec surveillance de dérive.
- **[HYDRA-UMC-PRODUCTION-REPORTS](https://github.com/JuanenRac/HYDRA-UMC-PRODUCTION-REPORTS)** — vrai calcul OEE/disponibilité sur l'historique de DATALAKE, avec export CSV reproductible.
- **[HYDRA-UMC-TELEMETRY-COLLECTOR](https://github.com/JuanenRac/HYDRA-UMC-TELEMETRY-COLLECTOR)** — vrai pipeline d'ingestion CAN/WebSocket vers DATALAKE, avec déduplication par séquence.

*Outils Complémentaires & Opérations de l'Écosystème*
- **[HYDRA-UMC-DASHBOARD-AI](https://github.com/JuanenRac/HYDRA-UMC-DASHBOARD-AI)** — panneaux Smart Summaries et Anomaly Highlighting sur DATALAKE/ANOMALY-DETECTOR, avec un repli statistique honnête.
- **[HYDRA-UMC-TOOL-CLI](https://github.com/JuanenRac/HYDRA-UMC-TOOL-CLI)** — CLI de flotte avec un vrai contrat de codes de sortie stable, un vrai client en direct de la propre API de HYDRA-UMC-SERVER.
- **[HYDRA-UMC-WATCH](https://github.com/JuanenRac/HYDRA-UMC-WATCH)** — application compagnon WearOS avec des motifs d'alerte haptique et un relais vocal vers le téléphone jumelé (pas encore exécutée sur une montre physique).
- **[URTC-SMART-RACK](https://github.com/JuanenRac/URTC-SMART-RACK)** — firmware pour un rack de montage de cartes avec décodage réel d'ID d'outil et logique de préchauffage Smart Idle.
- **[URTC-VISION-TOOL](https://github.com/JuanenRac/URTC-VISION-TOOL)** — firmware plus un vrai compagnon de vision Python pour une tête d'outil d'inspection thermique/RGB.
- **[HYDRA-UMC-UPDATER](https://github.com/JuanenRac/HYDRA-UMC-UPDATER)** — outil administratif de bureau qui découvre, clone et met à jour chaque dépôt de cet écosystème.
- **[HYDRA-UMC-OS-REBUILDER](https://github.com/JuanenRac/HYDRA-UMC-OS-REBUILDER)** — outil de bureau Windows/Linux qui construit une image de la CM5 prête à graver, préchargée avec les versions les plus actuelles de l'écosystème, avec une configuration de premier démarrage Wi-Fi/utilisateur/SSH façon Raspberry Pi Imager.
- **[HYDRA-UMC-OPS-AGENT](https://github.com/JuanenRac/HYDRA-UMC-OPS-AGENT)** — coordinateur d'incidents de maintenance : un rôle edge à faible privilège collecte un instantané d'inventaire/santé assaini, un rôle control-plane le rend en lecture seule et demande à un fournisseur d'IA de suggérer un diagnostic - n'applique jamais de correctif ni ne déploie rien.
- **[HYDRA-UMC-DEV-SERVER](https://github.com/JuanenRac/HYDRA-UMC-DEV-SERVER)** — hôte de développement reproductible (Raspberry Pi 5 / CM5) qui héberge le code source de l'écosystème et exécute des tâches de compilation/test délimitées via une file d'attente durable ; un rôle de développement dédié, explicitement distinct d'un CM5 opérationnel.

## 📚 Documentation

Où lire la suite :

* **[docs/API.md](docs/API.md)** — la référence réelle des endpoints HTTP : la forme de requête/réponse de `GET /probe`/`GET /current`/`GET /sample`, des exemples complets d'enveloppes XML, les deux vraies implémentations de `MachineReader` (`FixtureMachineReader`/`HydraServerMachineReader`), et une note explicite sur ce qui reste un placeholder (le seul HydraNode figé - l'arbre dynamique un-Device-par-robot est un chantier séparé, plus vaste).
* [Base de sécurité de l'écosystème](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/SECURITY_BASELINE.md)
* [Modèle de menaces de l'écosystème](https://github.com/JuanenRac/HYDRA-UMC-DOCS/blob/main/docs/THREAT_MODEL.md)
* [Journal des modifications de ce dépôt](CHANGELOG.md)
* [Licence de ce dépôt](LICENSE.md)

## 🤝 Contribuer et communauté

* Avant une pull request, exécutez `HYDRA_UMC_CI=1 py -3 tools/ci_validate.py` (ou `HYDRA_UMC_CI=1 python3 tools/ci_validate.py`) : il doit afficher `CI_VALIDATION=PASS`. N'exécutez pas `build.sh` ni `build.bat` pour cette vérification ; compiler n'est pas vérifier.
* Les huit README sont écrits à partir d'une source unique dans HYDRA-UMC-DOCS ; ne les modifiez pas à la main. Changez la source et réécrivez-les avec `tools/make_readmes.py`.
* N'affirmez pas dans un README ce qui n'a pas tourné : écrivez « simulé » ou « non essayé sur matériel » quand c'est la vérité.
* Voir [CONTRIBUTING.md](CONTRIBUTING.md), le [code de conduite](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md) et [SUPPORT.md](SUPPORT.md).

## 👤 AUTEUR

**JuanenRac (Electro Hobby 3D)** · electrohobby3d@gmail.com

## 📜 LICENCE

GPL-3.0-or-later - [LICENSE](LICENSE).
