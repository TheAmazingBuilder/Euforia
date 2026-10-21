# Pont MT5 — connecter ton compte IC Markets (démo ou réel) à Euforia

> **Principe** : IC Markets n'expose aucune API cloud directe (c'est un broker, pas une
> plateforme — voir `docs/architecture/accounts-connectivity-provider-feasibility.md`).
> Le pont MT5 est le mécanisme officiellement documenté : un petit programme (**EA**)
> tourne **dans TON terminal MT5**, lit ton compte, et pousse les données signées vers
> Euforia. **Tes identifiants broker ne quittent JAMAIS le terminal** — Euforia ne les
> reçoit jamais, ni maintenant ni plus tard.

## Ce que le pont envoie (lecture seule, jamais d'ordre)

| Événement | Contenu | Cadence |
|---|---|---|
| `ACCOUNT_INFO` | login, serveur, société broker (IC Markets…), devise, levier, démo/réel | chaque cycle |
| `SNAPSHOT` | balance, equity, marge, marge libre, niveau de marge | chaque cycle |
| `POSITIONS` | la liste **complète** des positions ouvertes | chaque cycle |
| `ORDERS` | la liste **complète** des ordres en attente | chaque cycle |
| `DEALS` | l'historique des deals **incrémental** (checkpoint persisté) | chaque cycle |

Chaque push est signé **HMAC-SHA256** avec le secret généré par Euforia au pairage.
Côté Euforia : le compte s'active au premier push, le broker est identifié
automatiquement (ex. « IC Markets (SC) Global »), et **les deals deviennent des trades
du journal** (regroupement MT5 par position — netting — déjà implémenté).

## Installation (5 minutes)

### 1. Créer le compte pont dans Euforia
`Accounts ▸ Connect ▸ MT5 Terminal Bridge` → saisis **uniquement ton numéro de login
MT5** (ex. `52988790`) + environnement (DEMO/LIVE). Euforia te montre la **fiche de
pairage** : *Ingest URL*, *Bridge key*, *Bridge secret* (tu pourras la revoir ou la
régénérer à tout moment depuis le détail du compte).

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
1. Ouvre le terminal sur **le compte IC Markets démo** (login `52988790`, serveur
   `ICMarketsSC-MT5` — le serveur est déjà mémorisé par ton terminal).
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
  cesse immédiatement de fonctionner.
- Déconnecter le compte détruit la clé et le secret ; l'historique du journal est
  conservé.
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
