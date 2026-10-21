# COSMOZ — Propositions de fonctionnalités (v1)

> Établies après la refonte design (skills), en croisant la mission du produit
> (journal de trading + coaching personnel) avec l'existant livré (dashboard,
> session live, playbook, discipline, analytics 6 tabs, capture/jugement).

## Priorité 1 — Boucler la boucle de données

Ces propositions lèvent le principal frein à un usage réel : la saisie.

| # | Fonctionnalité | Pourquoi | Effort |
|---|---|---|---|
| 1 | **Import CSV broker** (+ export JSON/CSV) | La saisie manuelle est le goulot n°1 d'un journal. Un mapping colonnes configurable (Deriv, MT5, TradingView) rend l'app vivante dès le jour 1 ; l'export garantit la propriété des données. | Moyen |
| 2 | **Calculateur de taille de position** dans la capture | Risque % + distance de stop → lot. Cohérent avec le risk budget existant ; transforme la discipline en garde-fou *avant* l'entrée, pas après. | Faible |
| 3 | **Captures d'écran par trade** (URL ou upload) | Le contexte visuel de l'entrée/du stop est la matière première du review hebdo. À lier dans le Gate → Reveal. | Faible-Moyen |

## Priorité 2 — Approfondir le coaching

| # | Fonctionnalité | Pourquoi | Effort |
|---|---|---|---|
| 4 | **Rapport hebdomadaire du coach** | Chaque semaine : meilleures/pires décisions, tendance d'adhérence aux règles, UN focus pour la semaine suivante. Généré depuis les agrégats existants, archivé dans le Journal. C'est le cœur du "coach". | Moyen |
| 5 | **Checklist pré-trade par stratégie** | Chaque playbook entry définit ses conditions ; le Gate exige de cocher avant d'enregistrer. Relie Playbook ⇄ Session (aujourd'hui deux îlots). | Moyen |
| 6 | **MAE / MFE par trade** | Savoir de combien le trade est allé contre/pour vous optimise les stops. Complète le DistributionStrip et le What-If. Nécessite de capturer les extrêmes. | Moyen |
| 7 | **Streaks & jalons de discipline** | 5 jours sans violation, 100 % de grading honnête sur une semaine… gamification du *processus* (jamais du P&L), alignée sur la philosophie Cosmoz. | Faible |

## Priorité 3 — Produit & UX

| # | Fonctionnalité | Pourquoi | Effort |
|---|---|---|---|
| 8 | **Palette de commandes (⌘K)** | Navigation + actions rapides (nouveau trade, ghost, noter le prochain trade). Standard des outils pro ; la base (hotkeys N/G) existe déjà. | Faible |
| 9 | **Centre de notifications** | La cloche affiche déjà un compteur — remplacer le toast "later phase" par un panneau listant les alertes non lues (agrégat déjà servi par /alerts). | Faible |
| 10 | **Calendrier économique** | Annoter les jours à fort impact (NFP, CPI, FOMC) sur Session/Calendar pour expliquer les écarts et décider de ne pas trader. | Moyen |
| 11 | **Coach IA conversationnel** | Un chat grounded sur VOS agrégats ("quelle stratégie sous-performe en fin de journée ?"). Valeur wow maximale, mais à faire après l'import CSV (données réelles). | Élevé |
| 12 | **PWA offline + sauvegarde locale** | Journaliser depuis le desk sans réseau ; sync au retour. Backup JSON local en un clic. | Moyen |

## Ordre de montage recommandé

1. **Import CSV** (#1) + **Centre de notifications** (#9) — données réelles + finition boucle d'alertes.
2. **Calculateur de position** (#2) + **Checklist pré-trade** (#5) — durcir le flux de capture.
3. **Rapport hebdo** (#4) + **Streaks** (#7) — le coach prend la parole.
4. Phases déjà prévues : Journal → Goals → Calendar → Settings (placeholders premium en place).
5. **Coach IA** (#11) en dernier : il sera d'autant meilleur que les données et le journal seront riches.
