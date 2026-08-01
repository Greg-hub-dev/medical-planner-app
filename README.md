# 🧠 MémoMed — Révisions médicales par répétition espacée

Planificateur de révisions médicales fondé sur la **méthode des J** (répétition espacée) pour
optimiser la mémorisation. **Application de bureau autonome** : aucune base de données externe,
toutes les données restent **en local** sur votre machine.

> Anciennement « Medical Planner » dépendant de MongoDB Atlas, l'application utilise désormais
> un **stockage local par fichiers JSON** et s'installe comme une application classique
> (`.exe` sous Windows, `.dmg` sous macOS) via Electron.

## ✨ Fonctionnalités

### Méthode des J (répétition espacée adaptative)
- Sessions générées automatiquement à **J0, J+1, J+2, J+10, J+25, J+47**.
- Chaque session se marque **Réussi** ou **À revoir** ; un échec ajoute automatiquement une
  session de **Reprise** quelques jours plus tard.
- Une session terminée peut être **repassée en « à faire »** (annulation).
- Semaine **Lundi → Samedi** ; **dimanche = repos** automatique.
- Bouton **« replanifier les sessions en retard »** pour rattraper un jour manqué.

### Calendrier
- Deux vues commutables : **Mois** (4 semaines) et **Semaine** (avec horaires).
- **Glisser-déposer** et boutons ‹ › pour déplacer une session, y compris d'une semaine à l'autre.
- Par défaut, seul la session déplacée bouge. Option **« déplacer aussi les sessions
  suivantes du même cours »** dans les Réglages (le planning des J reste alors solidaire).
- Horaires calculés automatiquement selon vos préférences (début/fin de journée, pause déjeuner).

### Création & gestion des cours
- **Formulaire d'ajout rapide** : nom, heures/jour, date de départ optionnelle. Les cartes se
  vérifient et se modifient avant création (aucune saisie ne part au hasard).
- Onglet **Gestion des cours** : progression, modification des heures, suppression.
- **Contraintes / indisponibilités** (jour ou plage) qui apparaissent sur le calendrier.

### Suivi & confort
- **Tableau de bord** : nombre de cours, heures du jour, progression, retard.
- **Statistiques** : série (streak), charge sur 7 jours, taux de réussite.
- **Bilingue** français / anglais (bascule FR|EN).
- **Mode sombre** (bascule 🌙).
- **Annulation** de la dernière action avec **Ctrl+Z** (ou ⌘Z).
- **Export / Import** de vos données en JSON (sauvegarde).
- **Notifications** locales pour les sessions du jour.
- **Invitations calendrier** (.ics) envoyées par email (optionnel — voir configuration).

## 📁 Où sont stockées les données ?

L'application enregistre vos **cours**, **sessions** et **contraintes** dans une base
**SQLite locale** (`memomed.db`), dans son dossier utilisateur :

| OS       | Emplacement                                     |
|----------|-------------------------------------------------|
| Windows  | `%APPDATA%\MémoMed\`                             |
| macOS    | `~/Library/Application Support/MémoMed/`         |
| Linux    | `~/.config/MémoMed/`                             |

Fichiers : `memomed.db` (base SQLite) et `config.json` (email). Au premier lancement,
d'anciens fichiers `courses.json` / `constraints.json` présents dans le dossier (ou héritées
de l'ancien dossier « Medical Planner ») sont **importés automatiquement** dans la base.

> Les **préférences** (langue, thème, vue, horaires, déplacement lié) sont stockées séparément
> par l'application. Pour une sauvegarde complète et portable, utilisez le bouton
> **Export (JSON)** dans les Réglages.

## 🚀 Installation depuis une release

Récupérez l'installeur correspondant à votre OS (dossier `dist/` après build) :

- **Windows** : `MémoMed Setup x.y.z.exe`
- **macOS** : `MémoMed-x.y.z.dmg`

Double-cliquez pour installer, puis lancez l'application.

## 🛠️ Développement

Prérequis : **Node.js 20+**.

```bash
npm install
```

### Lancer en application de bureau (dev)

Ouvre la fenêtre Electron avec rechargement à chaud :

```bash
npm run electron:dev
```

### Lancer comme simple app web (dev)

```bash
npm run dev
# puis ouvrir http://localhost:3000
```

## 📦 Construire les installeurs

> ⚠️ Un installeur se construit **sur le système cible** : le `.dmg` sur macOS,
> le `.exe` sur Windows.

```bash
npm run dist
```

Résultat dans `dist/`. Pour un test rapide sans installeur (dossier décompressé) :

```bash
npm run dist:dir
```

## 📧 Activer les invitations calendrier (optionnel)

L'envoi d'emails utilise un compte Gmail avec un **mot de passe d'application**.

1. Lancez l'application une première fois (cela crée `config.json` dans le dossier de données).
2. Ouvrez `config.json` et renseignez :

   ```json
   {
     "EMAIL_USER": "votre.adresse@gmail.com",
     "EMAIL_APP_PASSWORD": "mot-de-passe-application-gmail",
     "NEXTAUTH_URL": ""
   }
   ```

3. Redémarrez l'application, puis saisissez votre email dans **Réglages → Invitations calendrier**.

Sans ces valeurs, toutes les autres fonctionnalités marchent ; seul l'envoi d'emails est désactivé.

## 🔧 Stack technique

- **UI** : Next.js 15, React 19, TailwindCSS 4, Lucide React
- **Bureau** : Electron 33 + electron-builder
- **Stockage** : SQLite local via **better-sqlite3** (`lib/db.js`), avec migrations versionnées
- **Logique** : `lib/spacedRepetition.ts` (méthode des J, adaptation, reprise) et
  `lib/i18n.ts` (traductions FR/EN)
- **Email** : Nodemailer (Gmail)

> ⚙️ **Module natif** : `better-sqlite3` doit être compilé pour l'ABI d'Electron avant
> l'empaquetage. Le script `npm run dist` le fait automatiquement (`rebuild:electron`).
> Après un `rebuild:electron`, relancez `npm install` (ou `npm rebuild better-sqlite3`)
> avant de refaire tourner le mode web (`npm run dev`), qui utilise l'ABI de Node.

## 🏗️ Comment ça marche

L'application Electron démarre le serveur **Next.js autonome** (`output: "standalone"`) sur un
port local, puis l'affiche dans une fenêtre. Les routes API (`/api/courses`,
`/api/constraints`, `/api/send-invitations`) lisent et écrivent la base **SQLite** du dossier de
données, dont le chemin est transmis au serveur via la variable `MEMOMED_DATA_DIR`.
`lib/db.js` gère la connexion, les migrations (`PRAGMA user_version`) et l'import unique des
anciens fichiers JSON. L'interface (calendrier, formulaire d'ajout, statistiques) est entièrement
côté client.
