# OSA FOOT 7 — site officiel

Site one-page de l'**Olympique Saint-Affrique (football à 7)**, avec panel
d'administration intégré pour mettre à jour le prochain match, les résultats,
le calendrier, les statistiques et les photos — sans toucher au code.

- **Technologie** : HTML / CSS / JavaScript natif (ES modules). Aucun framework,
  aucune étape de build, aucune police ou bibliothèque distante.
- **Hébergement** : Cloudflare Pages — gratuit, bande passante illimitée,
  **usage commercial autorisé**.
- **Backend** : Cloudflare Pages Functions + D1 (contenu, messages) + KV (images).
  D1 et KV font partie du palier gratuit **sans carte bancaire**.

---

## Sommaire

1. [Structure du projet](#1-structure-du-projet)
2. [Déploiement en 5 minutes (site public)](#2-déploiement-en-5-minutes-site-public)
3. [Activer le panel d'administration](#3-activer-le-panel-dadministration)
4. [Utiliser l'administration](#4-utiliser-ladministration)
5. [Développement local](#5-développement-local)
6. [Nom de domaine personnalisé](#6-nom-de-domaine-personnalisé)
7. [Architecture & choix techniques](#7-architecture--choix-techniques)
8. [Sécurité](#8-sécurité)
9. [À personnaliser avant la mise en ligne](#9-à-personnaliser-avant-la-mise-en-ligne)

---

## 1. Structure du projet

```
OSA/
├─ public/                     ← tout ce qui est publié (build output)
│  ├─ index.html               ← la page d'accueil
│  ├─ effectif.html            ← fiches des joueurs
│  ├─ mentions-legales.html
│  ├─ robots.txt · sitemap.xml
│  ├─ _headers                 ← en-têtes HTTP + CSP + cache
│  ├─ _routes.json             ← limite les Functions à /api/*
│  ├─ admin/index.html         ← panel d'administration
│  ├─ assets/
│  │  ├─ css/style.css         ← site public
│  │  ├─ css/admin.css         ← administration
│  │  └─ js/
│  │     ├─ content.js         ← contenu par défaut (source de vérité initiale)
│  │     ├─ squad.js           ← cartes et fiches de l'effectif
│  │     ├─ app.js             ← logique du site public
│  │     └─ admin.js           ← logique de l'administration
│  └─ img/                     ← photos, logos, calendriers (optimisés)
│
├─ functions/api/              ← Cloudflare Pages Functions
│  ├─ session.js               ← GET / POST / DELETE  → connexion admin
│  ├─ content.js               ← GET / PUT / DELETE   → contenu du site
│  ├─ contact.js               ← POST                 → formulaire de contact
│  ├─ messages/index.js        ← GET                  → boîte de réception
│  ├─ messages/[id].js         ← PATCH / DELETE       → un message
│  ├─ media/index.js           ← GET / POST           → médiathèque
│  └─ media/[key].js           ← GET / DELETE         → un fichier
│
├─ lib/                        ← code partagé par les Functions
│  ├─ http.js  · auth.js  · store.js  · validate.js
│
├─ schema.sql                  ← schéma D1 (optionnel : auto-créé)
├─ wrangler.toml               ← configuration Cloudflare
├─ package.json
└─ .dev.vars.example           ← modèle de secrets pour le local
```

---

## 2. Déploiement en 5 minutes (site public)

> À ce stade le site est **entièrement fonctionnel** : contenu, compte à rebours,
> modales, calendrier, stats. Seuls l'édition en ligne et le formulaire de contact
> attendent l'étape 3.

### Option A — via GitHub (recommandé : chaque `git push` redéploie)

1. Créez un dépôt et poussez le projet :

   ```bash
   git init
   git add .
   git commit -m "Site OSA FOOT 7"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/osa-foot-7.git
   git push -u origin main
   ```

2. Sur [dash.cloudflare.com](https://dash.cloudflare.com) →
   **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.

3. Sélectionnez le dépôt, puis renseignez :

   | Champ | Valeur |
   |---|---|
   | Framework preset | `None` |
   | Build command | *(laisser vide)* |
   | Build output directory | `public` |
   | Root directory | `/` |

4. **Save and Deploy**. Le site est en ligne sur `https://osa-foot-7.pages.dev`.

### Option B — en ligne de commande

```bash
npm install
npx wrangler login
npm run deploy
```

---

## 3. Activer le panel d'administration

Trois ressources à créer, toutes gratuites et sans carte bancaire.

### 3.1 — Le mot de passe

```bash
npx wrangler pages secret put ADMIN_PASSWORD
# → saisissez un mot de passe long (20+ caractères)

npx wrangler pages secret put SESSION_SECRET
# → collez une chaîne aléatoire, générée par :
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Depuis le dashboard : **Workers & Pages → osa-foot-7 → Settings →
> Variables and Secrets → Add → Type: Secret**.

### 3.2 — La base de données (contenu + messages)

**En ligne de commande :**

```bash
npx wrangler d1 create osa-foot-7
```

**Ou depuis le dashboard :** *Storage & Databases → D1 SQL Database → Create*,
nom `osa-foot-7`. L'identifiant s'affiche sur la page de la base.

Dans les deux cas, décommentez le bloc `[[d1_databases]]` de `wrangler.toml`,
collez-y le `database_id`, puis committez et poussez.

> Les tables sont créées automatiquement à la première écriture.
> Pour les provisionner tout de suite : `npm run db:init`.

### 3.3 — Le stockage des images

**En ligne de commande :**

```bash
npx wrangler kv namespace create MEDIA
```

**Ou depuis le dashboard :** *Storage & Databases → KV → Create a namespace*,
nom `osa-foot-7-media`.

Dans les deux cas, décommentez le bloc `[[kv_namespaces]]` de `wrangler.toml`
et collez-y l'`id`.

### 3.4 — Redéployez

```bash
npm run deploy     # ou : git push
```

L'administration est disponible sur **`https://votre-site.pages.dev/admin/`**.

> ⚠️ **`wrangler.toml` fait autorité.** Tant que ce fichier est présent à la
> racine, Cloudflare **ignore** les bindings ajoutés depuis *Settings → Bindings*
> du dashboard. Les bindings `DB` et `MEDIA` doivent donc être décommentés dans
> `wrangler.toml`, pas saisis dans l'interface.
>
> Les **secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`) ne sont pas concernés :
> ils se définissent toujours depuis le dashboard ou via `wrangler pages secret put`.
>
> Si vous préférez malgré tout tout piloter depuis le dashboard, supprimez
> `wrangler.toml` — les réglages de build (`public`, aucune commande) restent
> alors à saisir dans l'interface.

### Récapitulatif des variables

| Nom | Type | Rôle | Sans elle |
|---|---|---|---|
| `ADMIN_PASSWORD` | Secret | Mot de passe du panel | Admin désactivée, site public OK |
| `SESSION_SECRET` | Secret | Signature des cookies | Repli sur `ADMIN_PASSWORD` |
| `DB` | Binding D1 | Contenu + messages | Contenu par défaut, formulaire en repli `mailto:` |
| `MEDIA` | Binding KV | Images téléversées | Seules les images de `/img/` sont disponibles |

---

## 4. Utiliser l'administration

Rendez-vous sur `/admin/` et connectez-vous avec `ADMIN_PASSWORD`.

| Onglet | Ce qu'on y fait |
|---|---|
| **Prochain match** | Équipes, logos, date/heure du coup d'envoi (alimente le compte à rebours), lieu, compétition |
| **Actualités** | Ajouter / réordonner / supprimer les matchs : titre, score, buteurs, accroche, texte complet, photo |
| **Effectif** | Fiches de joueurs repliées en accordéon : photo, identité, âge, nationalité, poste (gardien, défenseur, milieu, attaquant, coach), année d'arrivée, étoiles mauvais pied et gestes techniques, 6 notes sur 99 (jeu de notes propre aux gardiens, aucune pour le staff), note générale, compagne, descriptif, valeur marchande |
| **Calendrier** | Images du calendrier, légendes, textes alternatifs |
| **Classement** | Captures du classement de la poule, téléversées et légendées |
| **Galerie** | Photos du club : téléversement, légende, texte alternatif, réordonnancement. Jusqu'à 200 photos |
| **Stats saison** | Neuf classements (buteurs, passeurs, CSC, penaltys concédés, matchs joués, présence à l'entraînement, buts sur coup franc, buts sur penalty, arrêts) : un compteur par joueur de l'effectif, plus le titre, l'unité, la couleur, l'icône et le poste concerné de chaque colonne. Les 3 premiers forment le podium, le reste se déroule à la demande |
| **Club & réseaux** | Nom, logo, e-mail public, adresse du stade, Facebook, Instagram, année du copyright, et la section « Notre stade » (titre, nom du stade, accroche, carte Google Maps) |
| **Mentions légales** | Dénomination, statut, siège social, RNA/SIREN, directeur de la publication, e-mail légal, crédits de réalisation |
| **Médiathèque** | Téléverser des images (glisser-déposer), copier leur chemin, supprimer |
| **Messages** | Lire, marquer lu/non lu, répondre et supprimer les messages du formulaire |

**Bon à savoir**

- Rien n'est publié tant que vous n'avez pas cliqué **Enregistrer** (ou `Ctrl+S`).
  Le bandeau du haut indique en permanence s'il reste des modifications.
- Quitter la page avec des modifications non enregistrées déclenche une confirmation.
- **Réinitialiser** efface le contenu en base : le site repart des valeurs
  d'origine de `public/assets/js/content.js`.
- Laisser les **deux** champs de score vides marque un match comme non joué :
  la pastille Victoire / Nul / Défaite disparaît.
- Les classements **suivent l'effectif** : chaque joueur de l'onglet Effectif y
  reçoit un compteur, et tout l'effectif apparaît dans chaque colonne, compteurs
  à zéro compris. Ajouter, renommer, changer la photo ou supprimer une fiche se
  répercute partout sans double saisie ; un compteur dont le joueur disparaît est
  effacé à l'enregistrement suivant.
- Les classements sont **triés automatiquement** par valeur décroissante — à
  égalité, dans l'ordre de l'effectif. L'ordre de saisie n'a aucune importance.
- **Un clic sur une ligne de classement ouvre la fiche du joueur** sur la page
  Effectif (`/effectif#joueur-keks`).
- Un compteur laissé vide vaut zéro : inutile de saisir des zéros partout.
- Un classement peut être **réservé à un poste** (champ « Poste concerné ») :
  c'est le cas des **arrêts**, réservés aux gardiens. Seuls les joueurs de ce
  poste y reçoivent un compteur et y apparaissent.
- Une section d'images laissée vide (calendrier, classement, galerie) affiche
  « Bientôt disponible » plutôt qu'un trou dans la page.
- La **galerie** a sa propre page (`/galerie`), et l'accueil en montre les
  **six premières photos** avec un lien vers la page complète. L'ordre est celui
  de l'onglet Galerie : mettez en tête ce que vous voulez voir sur l'accueil.

### Packs & collection (`/packs`)

Un jeu, rien de plus. Les comptes créés ici **n'ouvrent aucun accès** au reste du
site : l'administration garde sa propre session, sur un cookie distinct.

- **Inscription** : un pseudo (3 à 20 caractères) et un mot de passe (8 minimum).
  Aucune adresse e-mail n'est demandée. Le mot de passe est haché en PBKDF2-SHA256
  avec un sel propre à chaque compte ; il n'est jamais stocké en clair.
- **15 packs offerts** à l'inscription, puis **5 de plus** au premier passage de
  chaque journée — minuit se lit à l'heure de Paris, pas en UTC. Le stock est
  **cumulable** : les packs non ouverts se gardent.
- **3 cartes par pack**, sans doublon à l'intérieur d'un même pack.
- **Cinq paliers de rareté.** Quatre suivent la note générale, le cinquième se
  décide à la main :

  | Palier | Condition | Chance relative |
  |---|---|---|
  | **Légendaire** | case « Carte légendaire » dans l'admin | 1 |
  | **Ultra rare** | note ≥ 88 | 6 |
  | **Rare** | note 84 – 87 | 45 |
  | **Peu commune** | note 75 – 83 | 700 |
  | **Commune** | note < 75 | 1400 |

  Sur l'effectif actuel, cela donne environ **95 % de peu communes**, 4,5 % de
  rares, et **une légendaire tous les 480 packs**. Les seuils sont volontairement
  hauts : avec une majorité de joueurs au-dessus de 85, un palier « ultra rare »
  à 85 ne distinguait plus personne.
- **Les légendaires sont un choix éditorial**, pas un calcul : aucune note, même
  99, ne suffit à en décrocher une. La case se coche fiche par fiche dans l'onglet
  Effectif. Cinq joueurs sont marqués au départ (Valérian, Noan, Joris, Stéphane
  et Patrice) ; en ajouter ou en retirer se fait depuis l'admin.
- **Le tirage a lieu sur le serveur.** Le navigateur ne fait qu'afficher : on ne
  peut pas s'offrir une carte depuis la console.
- La collection couvre **l'effectif publié** : un joueur ajouté apparaît en carte
  manquante, un joueur supprimé disparaît de la collection.
- Deux garde-fous : **5 inscriptions par adresse IP et par jour**, et un délai de
  600 ms après un mot de passe refusé.

- **Remettre les collections à zéro** : onglet *Effectif*, encadré rouge en bas
  de page. Efface toutes les collections et rend à chaque compte ses 15 packs de
  départ. **Les comptes sont conservés** — pseudo et mot de passe restent
  valables, personne n'a à se réinscrire. C'est le geste à faire après avoir
  remanié les notes ou les raretés : les collections constituées sous les
  anciennes règles ne veulent plus rien dire. L'action est **définitive**.

**Nouvelles tables D1** — `users` et `user_cards`. Elles se créent toutes seules
à la première inscription, comme le reste du schéma ; `schema.sql` les décrit
pour qui préfère provisionner à la main.

### Composer une équipe (`/compo`)

Rien à administrer : la page se sert de l'effectif tel qu'il est saisi.

- Trois dispositifs de foot à 7 : **1-2-3-1**, **1-3-2-1**, **1-3-3**.
  Chacun aligne 7 titulaires, plus 4 remplaçants et 1 coach sur le banc.
- On clique un emplacement, puis un joueur. Les joueurs **au poste attendu**
  remontent en tête de liste, et l'emplacement libre suivant s'ouvre tout seul
  pour enchaîner. Un joueur déjà placé ailleurs **déménage** au lieu d'être
  dupliqué.
- **Composer pour moi** remplit les trous avec les meilleures notes disponibles,
  sans jamais déloger un joueur déjà posé.
- **Changer de dispositif garde les joueurs** : les postes se correspondent, et
  celui qui n'a plus de place équivalente glisse sur le banc.
- La **note d'équipe** est la moyenne des notes générales des titulaires en
  place — ni le banc ni le coach n'y entrent. Une compo incomplète affiche la
  moyenne de ce qui est déjà posé, et le nombre de places restantes.
- La compo vit **dans l'URL** : « Copier le lien » l'envoie telle quelle. Elle
  est aussi gardée sur l'appareil, et un lien qui pointe sur un joueur supprimé
  depuis laisse simplement la place ouverte.
- La **note générale** se calcule seule — moyenne des six notes — tant que le
  champ « Note générale » reste vide ; la moyenne du moment y sert de valeur
  fantôme. Y saisir un nombre de 1 à 99 l'impose : c'est cette note-là qui
  s'affiche sur la carte, colore le badge et sert au classement. Vider le champ
  rend la main au calcul.
- Le poste **Coach** existe pour le staff : il porte sa propre couleur, se range
  après les joueurs dans le tri par poste, et **n'est pas noté** — ni étoiles, ni
  notes sur 99. Sa carte n'affiche une note générale que si vous en imposez une.
- La **carte de joueur** montre, sous l'identité, ses **trois meilleures notes**
  (chacune à la couleur de son palier) puis un pied de carte avec la **valeur
  marchande** et le **rang de la saison** en cours au club. Le bandeau défilant
  de l'accueil garde le pied de carte mais pas les points forts, pour rester léger.
- La valeur marchande reste du **texte libre**, repris tel quel. Le tri
  « Valeur marchande » sait en extraire un montant : `240 000 €`, `1,2 M€`,
  `50k`, `12 millions`. Une fiche sans montant lisible reste en fin de liste,
  dans les deux sens.
- Chaque fiche a une adresse partageable : `/effectif#joueur-keks`. Le bandeau
  défilant de l'accueil pointe dessus, et l'ancre s'efface à la fermeture.
- La page Effectif s'ouvre classée sur la meilleure note, et se trie aussi par
  poste, valeur marchande, âge ou ancienneté, dans les deux sens. Chaque critère a son sens
  naturel, et « Ordre de l'effectif » rend la main à l'ordre défini dans
  l'administration.
- Un gardien a ses propres notes (réflexes, positionnement, plongeon, jeu au
  pied, jeu à la main, vitesse). Les deux jeux cohabitent dans la fiche :
  changer un joueur de poste n'efface rien.
- Couleur des barres de notes, par palier : rouge en dessous de 65, jaune de
  65 à 74, vert de 75 à 84, vert foncé à partir de 85.
- Les images acceptées sont JPG, PNG, WebP, GIF et AVIF, jusqu'à 5 Mo.
  Le SVG est refusé pour des raisons de sécurité.
- **La carte du stade ne se charge qu'au clic.** Tant que le visiteur n'a pas
  appuyé sur « Afficher le plan », aucune requête ne part vers Google : le site
  reste sans tiers ni cookie par défaut, et la page se charge plus vite. Le
  bandeau explique ce qui se passe avant d'y consentir.
- Le champ **Carte Google Maps** n'accepte que l'adresse `google.com/maps/embed`
  (pas le code de l'iframe entier), et la politique de sécurité du site
  n'autorise l'affichage d'aucun autre domaine dans un cadre.
- Le document enregistré porte une **version de modèle** (`version`, actuellement 5).
  Un contenu plus ancien est migré à la volée au chargement, étape par étape :
  v1 → v2 remplace les anciens classements à noms libres par ceux liés à
  l'effectif (compteurs à zéro) ; v2 → v3 ajoute coup franc, penalty et arrêts
  **sans toucher aux compteurs déjà saisis**, et sans faire revenir un classement
  supprimé exprès ; v3 → v4 marque les cinq cartes légendaires ; v4 → v5 corrige
  l'adresse du stade, **uniquement si elle était restée sur l'ancienne valeur**.

---

## 5. Développement local

```bash
npm install
cp .dev.vars.example .dev.vars     # puis éditez le mot de passe
npm run dev
```

Le site tourne sur `http://localhost:8788`. Wrangler simule D1 et KV en local
(`npm run db:init:local` pour créer les tables tout de suite).

Vérification syntaxique rapide :

```bash
npm run check
```

---

## 6. Nom de domaine personnalisé

**Workers & Pages → osa-foot-7 → Custom domains → Set up a domain.**

Si le domaine est déjà géré par Cloudflare, tout est automatique. Sinon, ajoutez
l'enregistrement `CNAME` indiqué chez votre registrar. Le certificat HTTPS est
émis et renouvelé gratuitement.

Pensez ensuite à remplacer `osa-foot-7.pages.dev` dans :
`public/sitemap.xml`, `public/robots.txt` et la balise `<link rel="canonical">`
de `public/index.html`.

---

## 7. Architecture & choix techniques

**Un seul document de contenu.** Tout le site (club, prochain match, actus,
calendrier, stats) tient dans un objet JSON unique. L'édition est donc atomique,
la sauvegarde triviale et l'API minuscule : un `GET` et un `PUT`.

**Dégradation progressive.** `app.js` affiche d'abord le contenu par défaut de
`content.js`, puis interroge `/api/content` et rerend si la base contient
quelque chose. Conséquences :

- déployé en pur statique (sans D1), le site est complet et rapide ;
- une panne de base n'affiche jamais une page vide ;
- le premier rendu ne dépend d'aucun aller-retour réseau.

**Pourquoi KV plutôt que R2 pour les images ?** R2 exige une carte bancaire sur
le compte Cloudflare, même sur le palier gratuit. KV non — et une médiathèque de
club tient très largement dans ses limites (1 Go, valeurs jusqu'à 25 Mo).

**Pourquoi pas de framework ?** Le site est une page unique dont le contenu
change quelques fois par mois. Sans build, il n'y a ni dépendances à mettre à
jour, ni pipeline à réparer dans deux ans : `git push` et c'est en ligne.

**Aucune ressource externe.** Polices système, SVG en ligne, zéro CDN : le site
ne dépose aucun cookie tiers, ne fuit aucune donnée vers un autre domaine et
reste conforme au RGPD sans bandeau de consentement.

**Le schéma D1 est auto-créé.** `lib/store.js` intercepte l'erreur
« no such table », applique le schéma puis rejoue la requête. Aucune migration
manuelle n'est nécessaire au premier déploiement.

---

## 8. Sécurité

| Mesure | Où |
|---|---|
| Mot de passe comparé en temps constant + délai de 600 ms sur échec | `lib/auth.js` |
| Session = jeton signé HMAC-SHA256, cookie `HttpOnly` + `Secure` + `SameSite=Strict`, 8 h | `lib/auth.js` |
| Vérification de l'en-tête `Origin` sur toute requête mutante (anti-CSRF) | `lib/auth.js` |
| Normalisation stricte de tout contenu écrit (types, longueurs, listes blanches) | `lib/validate.js` |
| URLs `javascript:` et images externes rejetées à l'écriture | `lib/validate.js` |
| Échappement HTML systématique au rendu | `app.js`, `admin.js` |
| Upload : signature binaire vérifiée, SVG refusé, 5 Mo max, nom de fichier assaini | `functions/api/media/index.js` |
| Traversée de chemin bloquée sur les clés de média | `functions/api/media/[key].js` |
| Formulaire : honeypot + validation + 5 messages/heure/IP | `functions/api/contact.js` |
| CSP stricte, `nosniff`, `frame-ancestors`, `Referrer-Policy` | `public/_headers` |
| `/admin/` et `/api/` exclus de l'indexation | `public/robots.txt`, `_headers` |

**Changer le mot de passe** invalide immédiatement toutes les sessions ouvertes
si `SESSION_SECRET` n'est pas défini (il sert alors de clé de signature).

---

## 9. À personnaliser avant la mise en ligne

**Tout se fait depuis le panel `/admin/`** — aucun fichier à éditer à la main.

| À renseigner | Où, dans l'admin |
|---|---|
| Date, heure, adversaire et lieu du prochain match | *Prochain match* |
| Dates des 6 matchs (le champ est vide : rien ne s'affiche tant qu'il l'est) | *Actualités* → champ **Date** |
| E-mail réel du club (`contact@osafoot7.fr` est un exemple) | *Club & réseaux* |
| Vraies URLs Facebook / Instagram (vide = lien masqué) | *Club & réseaux* |
| Siège social, RNA/SIREN, directeur de la publication | *Mentions légales* |
| Classements de la saison (buteurs, passeurs, CSC, penaltys, matchs joués, entraînement) | *Stats saison* |

Une pastille **!** reste affichée sur l'onglet *Mentions légales* tant que les
informations obligatoires manquent, et un encadré d'avertissement s'affiche sur
la page publique. Les deux disparaissent automatiquement une fois complété.

Seul élément restant dans le code : l'**URL canonique** `osa-foot-7.pages.dev`,
à remplacer dans `public/sitemap.xml`, `public/robots.txt` et la balise
`<link rel="canonical">` de `public/index.html` si vous prenez un domaine (§6).

---

© 2026 OSA FOOT 7 — Tous droits réservés.
