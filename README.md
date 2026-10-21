# The Evergreen Project — site web

Site officiel de **The Evergreen Project** (écovillage, communauté et ashram à Anavra, mont Kallidromo, Grèce — organisation accréditée du Corps européen de solidarité).

- **8 langues** : grec (par défaut), anglais, français, espagnol, italien, russe, allemand, portugais
- **Espace administrateur** `/admin/` pour des non-techniciens : calendrier, photos, vidéos, textes, contacts — avec bouton de **traduction automatique**
- **Rapide et léger** : site 100 % statique, images recompressées automatiquement (WebP, plusieurs tailles), aucune base de données, hébergement gratuit
- **Responsive** : ordinateur, tablette, smartphone

## Plan du site

| Page | Contenu |
|---|---|
| Accueil | Manifeste, chiffres clés, portes d'entrée (projet, lieu, mode de vie, habitants), activités, bandeau CES, prochaines dates, lien vers les studios de yoga, galerie, contact |
| Le projet | Qui sommes-nous, mission, ce que nous faisons, pour qui, vision, lien avec Evergreen Yoga, fiche d'identité (AMKE, label CES, OID) |
| Le lieu | La forêt, le Kallidromo, vie hors réseau, saisons, équipements (tentes, maisons en bauge, shala…), alentours |
| Mode de vie | Vie simple, travail de la terre, cuisine végétarienne, pratique, communauté, une journée type, valeurs |
| Les habitants | Humains, animaux, plantes (fiches gérées dans l'admin) |
| Activités | 9 fiches détaillées : volontariat CES, séjourner chez nous (18 €/jour), retraites de yoga, construction naturelle, permaculture, bien-être, rassemblements, randonnée, groupes |
| Calendrier | Mini-calendrier mensuel + liste des prochaines dates + événements passés (les événements passés se retirent tout seuls) |
| Galerie | Albums photo (visionneuse plein écran) + vidéos YouTube/Vimeo/MP4 |
| Nous soutenir | Dons de matériel, liste de souhaits, volontariat, partage |
| Contact | E-mail, téléphone, WhatsApp, Messenger, Instagram, Facebook, carte, formulaire, comment venir, quoi apporter |
| Studios de yoga ↗ | Lien externe vers evergreenyogastudios.com (pas de doublon : cours, tarifs et formations restent sur leur site) |

## Architecture (choix techniques)

| Besoin | Solution | Pourquoi |
|---|---|---|
| Générer le site | [Astro 7](https://astro.build) | HTML statique ultra-rapide, optimisation d'images intégrée |
| Administration | [Sveltia CMS](https://sveltiacms.app) | Gratuit, interface en grec, multilingue natif avec traduction automatique (DeepL, Google, Claude…), glisser-déposer de photos, compression à l'envoi |
| Stockage du contenu | Fichiers YAML dans ce dépôt GitHub | Pas de base de données ; chaque modification est versionnée (on peut toujours revenir en arrière) |
| Hébergement | Cloudflare Pages (gratuit) | Bande passante illimitée, rapide en Europe, rebuild automatique à chaque modification |
| Photos | Converties en WebP ≤ 2000 px dans le navigateur à l'envoi, puis déclinées en 5 tailles au build | Pages légères sur mobile |
| Vidéos | Liens YouTube/Vimeo (chargés au clic) ou MP4 recompressés automatiquement par une GitHub Action | Pas de vidéo lourde dans les pages |
| Formulaire de contact | [Web3Forms](https://web3forms.com) (gratuit, optionnel) | Pas de serveur à maintenir |

```
src/content/      ← tout le contenu (modifié par l'admin)
  settings/site.yml   contacts, réseaux, liens
  pages/*.yml         textes des pages
  programs/*.yml      activités
  events/*.yml        calendrier
  inhabitants/*.yml   habitants
  albums/*.yml        galerie
src/assets/uploads/ ← photos (optimisées au build)
public/admin/       ← espace administrateur (config.yml)
src/pages/          ← gabarits des pages
src/i18n.ts         ← textes de l'interface (menus, boutons) dans les 8 langues
```

## Mise en ligne (une seule fois, ~20 min)

### 1. Fusionner dans `main`
L'admin enregistre sur la branche `main`. Créer `main` à partir de cette branche (ou fusionner la PR).

### 2. Héberger sur Cloudflare Pages (gratuit)
1. Créer un compte sur [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → choisir `Dimogdor/Evergreen`.
2. Réglages : *Framework preset* **Astro**, *Build command* `npm run build`, *Output directory* `dist`, branche de production `main`.
3. Variable d'environnement : `SITE_URL` = l'adresse finale (ex. `https://evergreenproject.gr`).
4. Le site est en ligne sur `https://<nom>.pages.dev`. Domaine personnalisé : onglet **Custom domains**.
5. Mettre la même adresse dans `public/admin/config.yml` (`site_url`, `display_url`) et `public/robots.txt`.

### 3. Connexion des administrateurs
Chaque administrateur a besoin d'un compte GitHub gratuit, ajouté comme collaborateur du dépôt (**Settings → Collaborators**).

Pour le bouton « Se connecter avec GitHub » (recommandé pour des débutants) :
1. Déployer [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) (bouton « Deploy to Cloudflare » — gratuit).
2. Créer une OAuth App GitHub ([github.com/settings/developers](https://github.com/settings/developers)) avec comme *callback URL* `https://<worker>.workers.dev/callback`, puis copier Client ID / Secret dans les variables du worker (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_DOMAINS` = votre domaine).
3. Décommenter `base_url` dans `public/admin/config.yml` avec l'adresse du worker.

En attendant, on peut se connecter avec « Sign in with token » (jeton GitHub personnel).

### 4. Options
- **Formulaire de contact** : créer une clé gratuite sur [web3forms.com](https://web3forms.com) avec l'e-mail de l'association, puis la coller dans *Admin → Ρυθμίσεις · Settings → Contact form key*.
- **Traduction automatique** : dans l'admin, menu compte → *Settings → Languages* → choisir un service (DeepL Free, Google, Claude…) et coller sa clé API. Ensuite, le bouton 文A traduit tous les champs d'une langue vers les autres.

Guide pas-à-pas pour les administrateurs (grec + anglais) : [docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md).

## Développement local

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # génère dist/
```

## Sources du contenu initial

Instagram et Facebook bloquent l'accès automatisé (connexion obligatoire) : le contenu a été reconstitué à partir des captures fournies, de la fiche officielle sur le [Portail européen de la jeunesse](https://youth.europa.eu/volunteering/organisation/82546_en), des anciens appels CES, de [evergreenyogagreece.com](https://www.evergreenyogagreece.com/the-ashram), [evergreenyogastudios.com](https://www.evergreenyogastudios.com/en) et de [BookRetreats](https://bookretreats.com/centers/c/the-evergreen-project). Les photos proviennent de l'ancien site Wix et du site Evergreen Yoga.

### À vérifier / compléter par l'équipe
- [ ] Superficie du terrain (« 5,4 acres » d'après la fiche CES — à confirmer)
- [ ] Noms, photos et rôles des habitants (humains et animaux) — seule la fiche de Panos existe, sans photo
- [ ] Vidéos (reels Instagram → YouTube, puis lien dans la galerie)
- [ ] Prochains appels CES et dates 2027 dans le calendrier
- [ ] Événement annoncé sur Facebook pour le 13 décembre 2026 (à ajouter au calendrier)
- [ ] Relecture des traductions par des locuteurs natifs (surtout le grec)
