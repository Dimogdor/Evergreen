# The Evergreen Project — site web

Site officiel de **The Evergreen Project** (écovillage, communauté et ashram à Anavra, mont Kallidromo, Grèce — organisation accréditée du Corps européen de solidarité).
En ligne : **https://dimogdor.github.io/Evergreen/** · Admin : **/admin/**

- **8 langues** : grec (par défaut), anglais, français, espagnol, italien, russe, allemand, portugais
- **Espace administrateur sans code** : calendrier, photos, vidéos, textes, contacts, IBAN, couleurs, menus, petits textes de l'interface, nouvelles pages, modération des témoignages
- **Rapide et léger** : site 100 % statique, images recompressées automatiquement (WebP, plusieurs tailles), vidéos recompressées par une GitHub Action, hébergement gratuit
- **Responsive** : ordinateur, tablette, smartphone

## Plan du site

| Page | Contenu |
|---|---|
| Accueil | Manifeste, chiffres clés, portes d'entrée, activités, bandeau CES, prochaines dates, témoignages, studios de yoga, photos (chaque bloc peut être masqué dans l'admin) |
| Le projet | Qui sommes-nous (Katerina Zerva, Kostas Trigazis, Panos Katsandris), mission, vision, fiche d'identité (AMKE, ΑΦΜ, label CES, OID) |
| Le lieu · Mode de vie · Les habitants | La forêt, le Kallidromo, les saisons ; vie quotidienne et valeurs ; humains, animaux, plantes |
| Activités | 9 fiches : volontariat CES, séjourner chez nous (18 €/jour), retraites de yoga, construction naturelle, permaculture, bien-être, rassemblements, randonnée, groupes |
| Calendrier | Mini-calendrier + prochaines dates ; **« Ajouter à mon agenda »** (Google / Apple / Outlook) avec conversion de fuseau horaire ; abonnement à tout le calendrier (`/calendar.ics`) |
| Galerie | Albums photo (visionneuse plein écran) + vidéos |
| Témoignages | Récits d'anciens volontaires, publiés après validation par l'équipe |
| Nous soutenir | Don par virement (IBAN + bouton copier), matériel, volontariat |
| Contact | E-mail, téléphone, Messenger, réseaux, carte, formulaire (optionnel), autres contacts Evergreen Yoga, comment venir |
| Confidentialité | Aucun cookie ni pistage ; RGPD |

## Architecture

| Besoin | Solution |
|---|---|
| Générer le site | [Astro](https://astro.build) (HTML statique, optimisation d'images) |
| Administration | [Sveltia CMS](https://sveltiacms.app) (version figée + empreinte d'intégrité), contenu en YAML dans ce dépôt — chaque modification est versionnée |
| Hébergement | GitHub Pages (gratuit), rebuild automatique à chaque modification |
| Connexion admin (e-mail + mot de passe) + témoignages | Un Worker Cloudflare gratuit : [worker/README.md](worker/README.md) |
| Formulaire de contact | [Web3Forms](https://web3forms.com) (gratuit, optionnel) |
| Sécurité | Content-Security-Policy stricte (scripts hachés), aucun cookie ni traceur |

```
src/content/        ← tout le contenu (modifié par l'admin)
  settings/site.yml     contacts, IBAN, couleurs, liens
  settings/ui.yml       petits textes de l'interface (8 langues)
  pages/*.yml  programs/*.yml  events/*.yml  inhabitants/*.yml  albums/*.yml
  testimonials/*.yml    témoignages (published: true/false)
  extra/*.yml           pages créées dans l'admin (dont « privacy »)
src/assets/uploads/ ← photos (optimisées au build)
public/admin/       ← espace administrateur (config.yml)
worker/             ← Worker Cloudflare (connexion GitHub + témoignages)
```

## Administrateurs

Guide pas-à-pas (grec + anglais) : **[docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md)**.

**Aucun compte GitHub n'est nécessaire** : les admins se connectent avec e-mail + mot de passe grâce au Worker Cloudflare gratuit ([worker/README.md](worker/README.md)), qui garde seul la clé d'accès au contenu.
1. Déployer le Worker et y mettre les admins (`ADMINS` = `katerina@…=motdepasse;kostas@…=motdepasse`).
2. Décommenter `base_url` et `api_root` dans `public/admin/config.yml`.
3. Mettre l'adresse du Worker dans *Admin → Settings → Website API address* (active le formulaire de témoignages).

## Nom de domaine propre

Disponibilité vérifiée le 22/10/2026 (DNS) : **evergreenproject.gr**, theevergreenproject.gr, evergreenproject.eu, theevergreenproject.org semblent libres ; evergreenproject.org et evergreenproject.com sont pris.

Une fois le domaine acheté (ex. `evergreenproject.gr`) :
1. Chez le registrar, DNS : 4 enregistrements **A** `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` et **CNAME** `www` → `dimogdor.github.io`.
2. Dépôt → **Settings → Pages → Custom domain** : `evergreenproject.gr`, puis cocher **Enforce HTTPS**.
3. Dépôt → **Settings → Secrets and variables → Actions → Variables** : `SITE_URL` = `https://evergreenproject.gr`, `BASE_PATH` = `/`. Relancer le déploiement (onglet Actions).
4. `public/admin/config.yml` : `site_url` / `display_url` ; Worker : ajouter le domaine à `ALLOWED_ORIGINS` et changer `SITE_URL`.

## Quitter GitHub (préparé)

Le site est 100 % statique et le contenu n'est que des fichiers YAML + photos : rien ne dépend de GitHub côté visiteurs ni côté admins (après l'étape « Administrateurs »).
1. **Hébergement → Cloudflare Pages** (gratuit, illimité) : Workers & Pages → Create → Pages → Connect to Git → ce dépôt ; *Build command* `npm run build`, *Output* `dist` ; variables `SITE_URL` = `https://evergreenproject.gr`, `BASE_PATH` = `/`. Brancher le domaine dans *Custom domains*. Les en-têtes de sécurité/cache de `public/_headers` y sont appliqués automatiquement.
2. Désactiver GitHub Pages et supprimer `.github/workflows/deploy.yml` ; le dépôt peut alors devenir **privé**.
3. Notifications de témoignages par e-mail : activer Email Routing sur le domaine (voir [worker/README.md](worker/README.md)).
4. Stockage ailleurs que GitHub plus tard (GitLab, Codeberg…) : changer `backend` dans `public/admin/config.yml` et les fonctions `gh`/`commit` du Worker. Note : la recompression automatique des vidéos est une GitHub Action — ailleurs, privilégier les liens YouTube.

## Développement

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # génère dist/
npm test         # calendrier (fuseaux, .ics) + Worker
```

## Sources du contenu

Facebook et Instagram du projet (publications 2025–2026), fiche officielle du [Portail européen de la jeunesse](https://youth.europa.eu/volunteering/organisation/82546_en), registre Diavgeia (ΑΦΜ), appels CES, [evergreenyogastudios.com](https://www.evergreenyogastudios.com), [evergreenyogaretreats.com](https://www.evergreenyogaretreats.com), [evergreenyogagreece.com](https://www.evergreenyogagreece.com) et [BookRetreats](https://bookretreats.com/r/8-day-essence-of-yoga-and-immersion-retreat-in-anavra-greece). En cas de conflit, l'information la plus récente a été retenue ; ce qui n'était pas confirmé a été retiré.

### À compléter par l'équipe (dans l'admin)
- [ ] Photos de Katerina, Kostas et Panos (Habitants)
- [ ] Prochains appels CES et dates 2027
- [ ] Relecture des traductions par des locuteurs natifs (surtout le grec)
