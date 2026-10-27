# The Evergreen Project — site web

Site officiel de **The Evergreen Project** (écovillage, communauté et ashram à Anavra, mont Kallidromo, Grèce — organisation accréditée du Corps européen de solidarité).
En ligne : **https://dimogdor.github.io/Evergreen/** · Admin : **/admin/**

- **8 langues** : grec (par défaut), anglais, français, espagnol, italien, russe, allemand, portugais
- **Aide à l'écriture dans l'admin** : bouton « ✓ Correct » (correction proposée) et traduction automatique depuis la langue de l'admin (grec, anglais ou français) vers les 7 autres à chaque enregistrement
- **Admin en 3 langues + aperçu en direct** : choix de la langue à la connexion (🌐 pour changer), aperçu du site à droite pendant l'écriture
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
src/admin/          ← formulaires de l'admin (config.yml, étiquettes traduites : labels.yml)
public/admin/       ← page de l'admin + aperçu en direct (preview.js)
worker/             ← Worker Cloudflare (connexion des admins, traduction, témoignages)
```

## Administrateurs

Guide pas-à-pas (grec + anglais) : **[docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md)**. **Aucun compte GitHub n'est nécessaire** : les admins se connectent avec e-mail + mot de passe grâce au petit serveur gratuit ([worker/README.md](worker/README.md)), qui garde seul la clé d'accès au contenu.

## Mise en ligne (une seule fois, environ 1 h 30)

Tout chez **Cloudflare** (gratuit) : hébergement, petit serveur, e-mails. Le dépôt GitHub devient **privé** : les témoignages en attente de validation n'y sont plus visibles publiquement.
Coûts : le domaine (≈ 20 €/an) et la traduction/correction automatique (quelques € par mois, plafonnable). Le reste est gratuit.

0. **Comptes au nom du projet** : registrar et Cloudflare créés avec `evergreenecovillage@gmail.com`, double authentification activée, mots de passe dans un gestionnaire partagé avec Katerina et Kostas. Le site ne dépend alors d'aucune personne.
1. **Domaine** : acheter `evergreenproject.gr` chez un registrar .gr (ex. Papaki), **renouvellement automatique** activé. Disponibilité vérifiée le 27/10/2026 (DNS) : **evergreenproject.gr**, theevergreenproject.gr, evergreen-project.gr, evergreenproject.eu semblent libres ; evergreenproject.org, theevergreenproject.org et evergreenproject.com sont pris.
2. **Cloudflare → Add a domain** → plan *Free* → chez le registrar, remplacer les serveurs DNS (*nameservers*) par les deux donnés par Cloudflare. Activation : quelques heures.
3. **Hébergement** : Cloudflare → Workers & Pages → Create → **Pages** → Connect to Git → `Dimogdor/Evergreen` ; *Build command* `npm run build`, *Output* `dist` ; variables `SITE_URL` = `https://evergreenproject.gr`, `BASE_PATH` = `/`. *Custom domains* : `evergreenproject.gr` et `www.evergreenproject.gr`. Chaque modification de l'admin republie le site automatiquement (`public/_headers` y est appliqué).
4. **Petit serveur** : [worker/README.md](worker/README.md) étapes 1–2. Avant `wrangler deploy`, dans `worker/wrangler.toml` : `SITE_URL` = `https://evergreenproject.gr`, `ALLOWED_ORIGINS` = `https://evergreenproject.gr,https://www.evergreenproject.gr`, et décommenter la ligne `routes` (adresse `https://api.evergreenproject.gr`).
5. **Brancher l'admin** : `/admin` (connexion actuelle par clé GitHub) → *Settings → Site, contact & bank* → **Website API address** = `https://api.evergreenproject.gr` → Save. Deux minutes plus tard, les admins se connectent avec e-mail + mot de passe et le formulaire de témoignages est actif. Ce seul réglage fait les deux.
6. **E-mails** : Cloudflare → Email → **Email Routing** : `contact@evergreenproject.gr` → `evergreenecovillage@gmail.com`, puis les notifications de témoignages ([worker/README.md](worker/README.md) §4).
7. **Anti-spam** (recommandé) : Turnstile ([worker/README.md](worker/README.md)). Facultatif : formulaire de contact → clé gratuite sur [web3forms.com](https://web3forms.com) → *Settings → Contact form key*.
8. **Reconstruction de nuit** (les événements terminés passent dans « Événements passés ») : Cloudflare → le site → Settings → Builds → **Deploy hooks** → créer → `npx wrangler secret put DEPLOY_HOOK` (dans `worker/`) avec l'adresse obtenue.
9. **Dépôt privé** : GitHub → Actions → *Deploy to GitHub Pages* → ⋯ → **Disable workflow** ; Settings → Pages → désactiver ; Settings → General → *Change visibility* → **Private**.
10. **Être trouvé** : [Google Search Console](https://search.google.com/search-console) → propriété de domaine (validation DNS en un clic avec Cloudflare) → envoyer `https://evergreenproject.gr/sitemap-index.xml`. Mettre la nouvelle adresse sur Instagram, Facebook, la fiche du Portail européen de la jeunesse et une fiche Google Maps (Google Business Profile).
11. **Vérifier** : chaque admin se connecte ; une modification est traduite (« Translated into 7 languages ») et en ligne en ~2 min ; un témoignage test avec photo → e-mail reçu → coché « Published » → visible ; « Ajouter à mon agenda » fonctionne.

**Plus tard, quitter GitHub** : le contenu n'est que des fichiers YAML + photos. Changer `backend` dans `src/admin/config.yml` (Sveltia gère GitLab et Gitea/Forgejo) et les fonctions `gh`/`commit` du Worker. La recompression des vidéos est une GitHub Action : ailleurs, privilégier les liens YouTube.

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
