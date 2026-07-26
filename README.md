# 🧠 Medical Planner — Application locale (Windows / macOS)

Planning médical basé sur la **méthode d'espacement J** (répétition espacée) pour optimiser
la mémorisation. **Application de bureau autonome** : aucune base de données externe, toutes
les données restent **en local** sur votre machine.

> Anciennement dépendante de MongoDB Atlas, l'application utilise désormais un **stockage
> local par fichiers JSON**. Elle s'installe comme une application classique (`.exe` sous
> Windows, `.dmg` sous macOS) via Electron.

## ✨ Fonctionnalités

- **Méthode des J** : sessions générées à J0, J+1, J+2, J+10, J+25, J+47
- **Planning hebdomadaire** (Lundi→Samedi, dimanche = repos), avec horaires calculés
  automatiquement et glisser-déposer
- **Assistant** en langage naturel (français) pour ajouter des cours et consulter le planning
- **Invitations calendrier** (.ics) envoyées par email (optionnel — voir configuration)
- **Stockage 100 % local** : vos données ne quittent jamais votre ordinateur

## 📁 Où sont stockées les données ?

Dans le dossier utilisateur de l'application (`userData`) :

| OS       | Emplacement                                                            |
|----------|-----------------------------------------------------------------------|
| Windows  | `%APPDATA%\Medical Planner\`                                           |
| macOS    | `~/Library/Application Support/Medical Planner/`                       |
| Linux    | `~/.config/Medical Planner/`                                          |

Fichiers créés : `courses.json`, `constraints.json`, et `config.json` (email).
**Pour sauvegarder / transférer vos données**, copiez simplement ces fichiers.

## 🚀 Installation depuis une release

Récupérez l'installeur correspondant à votre OS dans le dossier `dist/` (généré par le build) :

- **Windows** : `Medical Planner Setup x.y.z.exe`
- **macOS** : `Medical Planner-x.y.z.dmg`

Double-cliquez pour installer, puis lancez l'application.

## 🛠️ Développement

Prérequis : **Node.js 20+**.

```bash
npm install
```

### Lancer en mode application (dev)

Ouvre l'app Electron avec rechargement à chaud (via `next dev`) :

```bash
npm run electron:dev
```

### Lancer comme simple app web (dev)

```bash
npm run dev
# puis ouvrir http://localhost:3000
```

## 📦 Construire les installeurs

> ⚠️ Un installeur doit être construit **sur le système cible** :
> le `.dmg` macOS se construit sur macOS, le `.exe` Windows sur Windows.

```bash
npm run dist
```

Résultat dans `dist/`. Pour un test rapide sans installeur (dossier décompressé) :

```bash
npm run dist:dir
```

## 📧 Activer les invitations calendrier (optionnel)

L'envoi d'emails utilise un compte Gmail avec un **mot de passe d'application**.

1. Lancez l'application une première fois (cela crée `config.json` dans le dossier `userData`).
2. Ouvrez `config.json` et renseignez :

   ```json
   {
     "EMAIL_USER": "votre.adresse@gmail.com",
     "EMAIL_APP_PASSWORD": "mot-de-passe-application-gmail",
     "NEXTAUTH_URL": ""
   }
   ```

3. Redémarrez l'application.

Sans ces valeurs, toutes les autres fonctionnalités marchent ; seul l'envoi d'emails est désactivé.

## 🔧 Stack technique

- **UI** : Next.js 15, React 19, TailwindCSS 4, Lucide React
- **Bureau** : Electron 33 + electron-builder
- **Stockage** : fichiers JSON locaux (`lib/localStore.js`)
- **Email** : Nodemailer (Gmail)

## 🏗️ Comment ça marche

L'application Electron démarre le serveur **Next.js autonome** (`output: "standalone"`) sur un
port local, puis l'affiche dans une fenêtre. Les routes API (`/api/courses`,
`/api/constraints`, `/api/send-invitations`) lisent et écrivent les fichiers JSON du dossier
`userData`, dont le chemin est transmis au serveur via la variable `MEDICAL_DATA_DIR`.
