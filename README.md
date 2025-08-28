# 🧠 Agent Médical - Planning Intelligent

Un système de planning médical avancé utilisant la méthode d'espacement J pour optimiser la rétention mémorielle, avec gestion automatique des contraintes et réorganisation intelligente.

## ✨ Fonctionnalités Principales

### 🎯 Méthode d'Espacement J
- **J0** : Apprentissage initial
- **J+1, J+3, J+7** : Consolidation progressive
- **J+15, J+30, J+90** : Mémorisation à long terme

### 🤖 Assistant IA Intégré
- Traitement du langage naturel en français
- Commandes vocales intuitives
- Réorganisation automatique du planning

### ⚠️ Gestion Avancée des Contraintes
- Rendez-vous médicaux
- Formations et déplacements
- Créneaux personnalisés
- Évitement automatique des conflits

### 📅 Planning Intelligent
- Vue hebdomadaire (Lundi-Samedi)
- Dimanche automatiquement libre
- Maximum 10h de travail par jour
- Indicateurs visuels de charge de travail

## 🚀 Déploiement sur Vercel

### 1. Prérequis
- Compte [Vercel](https://vercel.com)
- Base de données MongoDB (gratuite sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

### 2. Variables d'environnement
Créez un fichier `.env.local` :

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/medical-planner
API_KEY=votre-cle-api-secrete
WEBHOOK_URL=https://hooks.exemple.com/webhook (optionnel)
```

### 3. Déploiement
1. Connectez votre repository GitHub à Vercel
2. Configurez les variables d'environnement dans Vercel
3. Déployez automatiquement

### 4. Configuration Post-Déploiement
- Testez l'interface avec quelques cours d'exemple
- Vérifiez la connexion à MongoDB
- Configurez les webhooks si nécessaire

## 💡 Utilisation

### Commandes IA Disponibles

#### 📚 Gestion des Cours
```
"Ajouter Anatomie avec 2 heures par jour"
"Ajouter Physiologie avec 1.5h démarrage le 15/03"
```

#### ⚠️ Gestion des Contraintes
```
"J'ai une contrainte le 20/03 de 9h à 12h"
"Rendez-vous médical le 15 septembre toute la journée"
"Mes contraintes"
```

#### 📋 Consultation du Planning
```
"Mon planning du jour"
"Planning de la semaine"
"Aide"
```

### Interface Visuelle
- **Cartes statistiques** : Vue d'ensemble de vos cours et progression
- **Planning hebdomadaire** : Visualisation complète avec codes couleur
- **Chat IA** : Interaction naturelle pour toutes les opérations
- **Boutons rapides** : Actions fréquentes en un clic

## 🛠️ API REST

### Endpoints Disponibles

#### Cours
- `GET /api/courses` - Liste des cours
- `POST /api/courses` - Ajouter un cours (requis: API key)

#### Contraintes
- `GET /api/constraints` - Liste des contraintes
- `POST /api/constraints` - Ajouter une contrainte (requis: API key)

#### Planning
- `GET /api/planning/week/:offset` - Planning hebdomadaire
- `POST /api/reorganize` - Réorganiser le planning (requis: API key)

#### Utilitaires
- `GET /api/export` - Export des données
- `POST /api/import` - Import des données (requis: API key)

### Exemple d'utilisation
```javascript
// Ajouter un cours
fetch('/api/courses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'votre-cle-api'
  },
  body: JSON.stringify({
    name: 'Anatomie Cardiaque',
    hoursPerDay: 2,
    description: 'Étude du système cardiovasculaire'
  })
});
```

## 🔧 Technologies Utilisées

- **Frontend** : Next.js 15, React 19, TailwindCSS 4
- **Backend** : Next.js API Routes, MongoDB avec Mongoose
- **UI/UX** : Lucide React (icônes), design responsive
- **IA** : Traitement du langage naturel personnalisé
- **Déploiement** : Vercel avec intégration continue

## 📱 Responsive Design

L'interface s'adapte automatiquement :
- **Desktop** : Vue complète avec 3 colonnes
- **Tablet** : Vue adaptée avec navigation optimisée
- **Mobile** : Interface mobile-first avec priorité au chat IA

## 🎨 Personnalisation

### Couleurs des Intervalles J
```css
J0: Bleu (Apprentissage)
J+1: Rouge (Révision immédiate)
J+3: Orange (Consolidation)
J+7: Jaune (Renforcement)
J+15: Vert (Ancrage)
J+30: Violet (Mémorisation)
J+90: Rose (Rétention long terme)
```

### Horaires de Travail
Modifiables dans le code :
- **Début** : 9h00
- **Fin** : 20h00
- **Pause déjeuner** : 13h00-14h00
- **Capacité max** : 10h/jour

## 🤝 Contribution

1. Fork le projet
2. Créez votre branche feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Créez une issue sur GitHub
- Consultez la documentation des API
- Vérifiez les logs Vercel pour le debugging

---

**Fait avec ❤️ pour optimiser l'apprentissage médical**
