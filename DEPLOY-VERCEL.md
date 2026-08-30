# Déployer MémoMed en ligne (Vercel + Turso)

MémoMed fonctionne de **deux façons, depuis le même code** :

| Mode | Stockage | Usage |
|---|---|---|
| **Application de bureau** (`.exe` / `.dmg`) | Fichier SQLite local (`memomed.db`) | Hors ligne, données sur ta machine |
| **Site en ligne** (Vercel) | Base hébergée **Turso** (libSQL) | Accessible partout : iPad, téléphone, autre PC |

Le backend est choisi **automatiquement** : si la variable `TURSO_DATABASE_URL`
existe → Turso ; sinon → fichier local. **La génération des installeurs n'est pas
affectée.**

> ⚠️ Les deux bases sont **indépendantes** : les données du bureau et celles du
> site ne se synchronisent pas entre elles. Utilise **Export / Import (JSON)**
> dans les Réglages pour transférer tes données de l'une à l'autre.

---

## 1. Créer la base Turso (gratuit)

1. Crée un compte sur <https://turso.tech> et une base de données.
2. Récupère les deux valeurs (bouton *Connect* / CLI `turso db show`) :
   - l'**URL** de la base (`libsql://...`)
   - un **token d'authentification**

Aucune table à créer : les migrations s'exécutent automatiquement au premier appel.

## 2. Déployer sur Vercel

1. Sur <https://vercel.com>, **Add New → Project**, importe le dépôt
   `medical-planner-app`.
2. Laisse les réglages par défaut (Next.js est détecté).
3. Avant de déployer, ajoute les **variables d'environnement** :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://…` | ✅ (sinon le site n'a pas de stockage persistant) |
| `TURSO_AUTH_TOKEN` | le token Turso | ✅ |
| `APP_PASSWORD` | un mot de passe de ton choix | 🔒 fortement recommandé |
| `APP_USER` | un identifiant imposé | optionnel |
| `EMAIL_USER` / `EMAIL_APP_PASSWORD` | compte Gmail | optionnel (invitations calendrier) |

4. **Deploy**. Ton URL : `https://<projet>.vercel.app`.

### Accélérer l'installation

Le projet dépend d'Electron pour générer les installeurs de bureau. Sur Vercel,
`npm install` téléchargerait inutilement le binaire Electron (~263 Mo), ce qui
ralentit le build et peut le faire échouer.

**C'est déjà géré** : le fichier `vercel.json` à la racine impose
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` à l'installation. Rien à configurer, et la
génération des `.exe`/`.dmg` par GitHub Actions n'est **pas** affectée.

### Sécurité

Si `APP_PASSWORD` est défini, le site entier (pages **et** API) demande une
authentification **HTTP Basic** : le navigateur affiche une fenêtre de connexion
au premier accès. Sans ce mot de passe, **toute personne connaissant l'URL peut
lire et modifier tes cours**.

## 3. Utiliser sur iPad / téléphone

Ouvre l'URL dans Safari, puis **Partager → Sur l'écran d'accueil** pour obtenir
une icône qui lance le site en plein écran.

---

## Transférer tes données existantes

1. Sur l'application de bureau : **Réglages → Export (JSON)**.
2. Sur le site : **Réglages → Importer une sauvegarde**, choisis le fichier.

(Et inversement pour rapatrier les données du site vers le bureau.)

## Notes techniques

- `lib/db/index.js` choisit le backend ; `lib/db/localSqlite.js` (better-sqlite3)
  et `lib/db/turso.js` (@libsql/client) partagent le schéma de `lib/db/schema.js`.
  Les modules sont chargés en **import dynamique** : Vercel ne charge jamais le
  module natif, Electron ne charge jamais le client réseau.
- Les migrations sont versionnées via `PRAGMA user_version`, identiques des deux côtés.
- `better-sqlite3` reste installé sur Vercel mais **n'est jamais chargé**. Si son
  installation échouait sur Vercel, le déplacer dans `optionalDependencies`.
