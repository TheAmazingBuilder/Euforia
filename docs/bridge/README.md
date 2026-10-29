# Pont MT5 — connecter un compte de trading à Euforia

> **Principe** : Euforia utilise le terminal MT5 déjà connecté à ton compte. Un petit
> programme (**EA**) tourne **dans TON terminal MT5**, lit les informations autorisées
> et pousse les données signées vers Euforia. Le même pont peut servir pour les brokers
> qui fournissent un compte MT5 compatible, notamment IC Markets, Axi (si MT5 est proposé
> dans ton pays et pour ton compte) et PU Prime. Ce n'est pas une API cloud directe du
> broker. **Tes identifiants broker ne quittent JAMAIS le terminal** : Euforia ne les reçoit
> pas. L'intégration reste strictement en lecture seule.

## Ce que le pont envoie (lecture seule, jamais d'ordre)

| Événement | Contenu | Cadence |
|---|---|---|
| `ACCOUNT_INFO` | login, serveur, société broker, devise, levier, démo/réel | chaque cycle |
| `SNAPSHOT` | balance, equity, marge, marge libre, niveau de marge | chaque cycle |
| `POSITIONS` | la liste **complète** des positions ouvertes | chaque cycle |
| `ORDERS` | la liste **complète** des ordres en attente | chaque cycle |
| `DEALS` | l'historique des deals **incrémental** (checkpoint persisté) | chaque cycle |

Chaque push est signé **HMAC-SHA256** avec le secret généré par Euforia au pairage.
Le checkpoint d'historique des deals est stocké séparément par **login MT5 + serveur** : changer de compte dans le même terminal ne réutilise pas le checkpoint d'un autre compte (EA v1.0.2).
Côté Euforia : le compte s'active au premier push, le broker est identifié à partir du
nom déclaré par le terminal et du serveur (ex. IC Markets, Axi ou PU Prime). Si le nom
ne correspond à aucun broker connu, Euforia conserve le libellé reçu sans inventer son
identité. **Les deals deviennent des trades du journal** (regroupement MT5 par position
— netting — déjà implémenté).

## Installation (5 minutes)

### 1. Choisir le broker et créer le compte pont dans Euforia
Dans `Accounts ▸ Connect`, tu peux choisir directement **Axi**, **PU Prime** ou
**IC Markets** dans le catalogue des brokers, ou sélectionner le connecteur générique
`MT5 Terminal Bridge`. Le nom choisi est une attente de sécurité : Euforia le compare
au nom de société et au serveur remontés par MT5 lors du premier push. Si le broker ne
correspond pas, le compte reste en attente et l'événement n'est pas accepté.

Saisis **uniquement ton numéro de login MT5** (ex. `52988790`) + environnement
(DEMO/LIVE). Euforia te montre la **fiche de pairage** : *Ingest URL*, *Bridge key*,
*Bridge secret* (tu pourras la revoir ou régénérer une nouvelle paire depuis le détail
du compte). Pour Axi, vérifie d'abord que MT5 est bien disponible pour ta région et ton
compte ; un compte MT4 ou la plateforme propriétaire Axi ne fonctionne pas via ce pont.

### 2. Installer l'EA dans MetaTrader 5
1. Télécharge `EuforiaBridge.mq5` (bouton de la fiche de pairage, ou
   `/bridge/EuforiaBridge.mq5` sur ton instance web).
2. MT5 : `Fichier ▸ Ouvrir le dossier de données ▸ MQL5 ▸ Experts` — copie le fichier là.
3. Dans MetaEditor (F4), ouvre le fichier et **compile (F7)** — « 0 errors » attendu.

### 3. Autoriser la sortie réseau (obligatoire)
MT5 : `Outils ▸ Options ▸ Expert Advisors` → coche
**« Autoriser WebRequest pour les URL listées »** et ajoute l'**hôte** de ton instance
Euforia (ex. `https://ton-euforia.exemple` — le domaine seul, sans le chemin).

### 4. Attacher l'EA
1. Ouvre ton terminal MT5 et connecte-toi au compte voulu (démo ou réel). Utilise
   exactement le serveur communiqué par ton broker ; exemples de familles de serveurs :
   `ICMarkets...`, `Axi...`, ou `PUPrime-Demo / PUPrime-Live...`.
2. Glisse `EuforiaBridge` sur **n'importe quel graphique** de ce compte.
3. Renseigne les entrées : `InpEndpointURL` (Ingest URL complète), `InpBridgeKey`,
   `InpBridgeSecret`. Laisse `InpPushSeconds = 30`.
4. Autorise le trading algorithmique **au niveau de l'EA** (bouton « AutoTrading » n'est
   PAS requis — l'EA ne trade pas — mais l'EA doit être autorisé à s'exécuter : coche
   « Autoriser le trading algorithmique » dans l'onglet Commun de l'EA si demandé).

### 5. Vérifier
- Sur le graphique : le bandeau `Euforia Bridge` affiche `state: pushed`, pushes qui
  montent, `last error: none`.
- Dans Euforia : le compte passe de **« En attente du terminal »** à connecté sous ~30 s,
  le broker s'affiche, et l'historique (90 jours par défaut) devient des trades de
  journal au prochain rafraîchissement.

## Sécurité — lire une fois

- Le **secret du pont** est généré par Euforia, stocké chiffré (AES-256-GCM) et
  **jamais** envoyé au terminal broker. Il autorise uniquement l'*écriture* de données
  de lecture vers TON compte pont (pas d'accès au broker, pas d'exécution).
- Tu peux le **régénérer** (bouton Rotation) : l'ancienne configuration du terminal
  cesse immédiatement de fonctionner. Euforia attend un nouveau push avant de réafficher
  le pont comme connecté.
- Euforia vérifie le login du terminal, l'environnement DEMO/LIVE et le broker choisi
  avant d'accepter les données d'identité. Une clé révoquée ne peut ni reconnecter le
  compte ni ajouter de nouveaux événements.
- Déconnecter le compte détruit la clé et le secret et purge le cache brut du pont ;
  l'historique normalisé du journal est conservé.
- ⚠️ **Ne partage jamais ton mot de passe MT5 avec qui que ce soit** — un pont
  correctement conçu n'en a pas besoin (l'EA tourne *dans* ton terminal déjà connecté).
  Si tu l'as partagé en chat à un moment donné, change-le depuis MT5
  (Outils ▸ Options ▸ Serveur ▸ Modifier) par précaution.

## Limites honnêtes (v1)

- Fraîcheur = dernier push (terminal ouvert). Terminal fermé ⇒ données figées
  (l'historique rattrape au retour, le checkpoint est persisté).
- Profondeur d'historique initiale : 90 jours (`InpDealsDaysBack`), puis incrémental.
- MT5 uniquement pour l'instant (MT4 = variante MQL4 à demander ; cTrader = API
  officielle Open API, chemin séparé).
- L'EA n'a PAS pu être compilé dans cet environnement (pas de MetaEditor) — si F7
  signale une erreur, reporte-la et je corrige immédiatement.
