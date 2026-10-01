import type { Dictionary } from "@/i18n/dictionaries/en";
import { sessionDict as sessionFr } from "@/i18n/dictionaries/fr/session";
import { tradesDict as tradesFr } from "@/i18n/dictionaries/fr/trades";
import { nofyDict as nofyFr } from "@/i18n/dictionaries/fr/nofy";

/**
 * FR language pack — must satisfy `Dictionary` (typeof en), so a missing or
 * mis-shaped key is a COMPILE error, never a runtime gap. Strings resolve at
 * runtime through the I18nProvider; EN remains the fallback for deliberate
 * partials. Traduction française complète de la première tranche :
 * coquille applicative (navigation), surface auth complète, paramètres
 * (catégories + carte Localisation) et chaînes communes.
 */
export const fr: Dictionary = {
  common: {
    save: "Enregistrer",
    saving: "Enregistrement…",
    reset: "Réinitialiser",
    cancel: "Annuler",
    close: "Fermer",
    retry: "Réessayer",
    loading: "Chargement…",
    sessionExpiredTitle: "Votre session a expiré",
    sessionExpiredBody: "Veuillez vous reconnecter pour continuer.",
  },

  nav: {
    items: {
      "/": "Tableau de bord",
      "/session": "Session Live",
      "/trades": "Transactions",
      "/journal": "Revue de trade",
      "/playbook": "Playbook",
      "/analytics": "Analytique",
      "/calendar": "Calendrier",
      "/discipline": "Discipline",
      "/academy": "Académie",
      "/nofy": "Nofy",
      "/monitoring": "Supervision",
      "/integrations": "Intégrations",
      "/security": "Sécurité",
      "/settings": "Paramètres",
    },
    sections: {
      Trading: "Trading",
      Insights: "Analyses",
      Academy: "Académie",
      System: "Système",
    },
    bottom: {
      "/": "Accueil",
      "/trades": "Transactions",
      "/playbook": "Playbook",
      "/analytics": "Stats",
    },
    app: "Cosmoz",
    profile: "Profil",
    signIn: "Connexion",
    createAccount: "Créer un compte",
    language: "Langue",
    // LanguageSelector (header) — puce d'état de sync + sous-titres d'options.
    languageSaving: "Enregistrement…",
    languageSynced: "Synchronisé à votre compte",
    languageSyncError: "Synchronisation impossible — réessayez depuis Paramètres",
    languageLocalOnly: "Enregistré sur cet appareil",
    languageEnSubtitle: "Interface en anglais",
    languageFrSubtitle: "Interface en français",
  },

  auth: {
    brandTagline: "Journal de trading professionnel",
    brandPitch:
      "Le journal de trading qui vous coach — journalisez chaque trade, protégez votre discipline et laissez le coach vous garder honnête.",

    pillars: [
      { title: "Journal", detail: "Chaque trade, noté et revu." },
      { title: "Discipline", detail: "Règles, violations et score." },
      { title: "Coach", detail: "Des analyses qui changent le comportement." },
    ],

    login: {
      title: "Connectez-vous à Cosmoz",
      subtitle: "Bon retour, trader — votre journal et votre coach vous attendent.",
      email: "E-mail",
      password: "Mot de passe",
      remember: "Se souvenir de cet appareil",
      submit: "Se connecter",
      submitting: "Connexion…",
      forgot: "Mot de passe oublié ?",
      createAccount: "Créer un compte",
      noAccount: "Pas encore de compte ?",
      mfaTitle: "Authentification à deux facteurs",
      mfaSubtitle: "Saisissez le code à 6 chiffres de votre application d'authentification.",
      mfaCode: "Code d'authentification",
      mfaSubmit: "Vérifier",
      mfaVerifying: "Vérification…",
      mfaUseRecovery: "Utiliser un code de récupération à la place",
      mfaUseCode: "Utiliser un code d'authentification à la place",
      mfaRecoveryLabel: "Code de récupération",
      mfaDemoHint: "Authentificateur simulé (démo) :",
      demoHintTitle: "Compte démo",
      demoHintFill: "Remplir",
      demoHintNote:
        "Environnement simulé — le journal démo est partagé par toutes les connexions démo.",
    },

    register: {
      title: "Créez votre compte",
      subtitle: "Commencez à journaliser vos trades et laissez le coach vous garder honnête.",
      name: "Nom",
      email: "E-mail",
      password: "Mot de passe",
      confirmPassword: "Confirmer le mot de passe",
      submit: "Créer le compte",
      submitting: "Création du compte…",
      haveAccount: "Vous avez déjà un compte ?",
      signIn: "Se connecter",
      passwordRule: "Au moins 10 caractères.",
      mismatch: "Les mots de passe ne correspondent pas.",
      pendingTitle: "Consultez votre boîte mail",
      pendingBody:
        "Votre compte a été créé. Nous avons envoyé un lien de vérification à votre adresse e-mail — le lien expire dans 24 heures.",
      pendingMockTitle: "Envoi simulé",
      pendingMockBody:
        "Aucun service de messagerie n'existe dans cet environnement de démo : le lien de vérification à usage unique est fourni ci-dessous (en production il arrive par e-mail).",
      pendingMockOpen: "Ouvrir le lien de vérification",
      resend: "Renvoyer l'e-mail de vérification",
      resending: "Envoi…",
    },

    verifyEmail: {
      verifying: "Vérification de votre e-mail…",
      successTitle: "E-mail vérifié",
      successBody: "Votre adresse e-mail est confirmée. Votre compte est prêt.",
      successCta: "Continuer vers la connexion",
      alreadyTitle: "Déjà vérifié",
      alreadyBody:
        "Cette adresse e-mail était déjà vérifiée — vous pouvez vous connecter directement.",
      expiredTitle: "Lien expiré",
      expiredBody:
        "Ce lien de vérification a expiré. Demandez un nouvel e-mail ci-dessous.",
      invalidTitle: "Lien non valide",
      invalidBody:
        "Ce lien de vérification n'est pas valide. Vérifiez le lien ou demandez un nouvel e-mail.",
      usedTitle: "Lien déjà utilisé",
      usedBody:
        "Ce lien de vérification a déjà été utilisé. Si vous ne pouvez toujours pas vous connecter, demandez un nouvel e-mail.",
      resend: "Envoyer un nouvel e-mail de vérification",
      resending: "Envoi…",
      resendDone: "E-mail de vérification envoyé.",
      ctaLogin: "Retour à la connexion",
    },

    forgot: {
      title: "Mot de passe oublié ?",
      subtitle:
        "Saisissez l'adresse e-mail de votre compte et nous vous enverrons un lien de réinitialisation.",
      email: "E-mail",
      submit: "Envoyer le lien de réinitialisation",
      submitting: "Envoi…",
      sentTitle: "Consultez votre boîte mail",
      sentBody:
        "Si un compte existe pour cette adresse e-mail, les instructions ont été envoyées. Le lien de réinitialisation expire dans 30 minutes.",
      sentMockTitle: "Envoi simulé",
      sentMockBody:
        "Aucun service de messagerie n'existe dans cet environnement de démo : le lien de réinitialisation à usage unique est fourni ci-dessous (en production il arrive par e-mail).",
      sentMockOpen: "Ouvrir le lien de réinitialisation",
      backToLogin: "Retour à la connexion",
    },

    reset: {
      title: "Choisissez un nouveau mot de passe",
      subtitle: "Choisissez un mot de passe solide et unique — au moins 10 caractères.",
      password: "Nouveau mot de passe",
      confirmPassword: "Confirmer le nouveau mot de passe",
      submit: "Réinitialiser le mot de passe",
      submitting: "Réinitialisation…",
      successTitle: "Mot de passe réinitialisé",
      successBody:
        "Votre mot de passe a été modifié. Connectez-vous avec votre nouveau mot de passe — les sessions existantes ont été déconnectées.",
      successCta: "Continuer vers la connexion",
      invalidTitle: "Lien non valide",
      invalidBody: "Ce lien de réinitialisation n'est pas valide. Demandez-en un nouveau ci-dessous.",
      expiredTitle: "Lien expiré",
      expiredBody:
        "Ce lien de réinitialisation a expiré. Demandez un nouvel e-mail ci-dessous.",
      usedTitle: "Lien déjà utilisé",
      usedBody:
        "Ce lien de réinitialisation a déjà été utilisé. Demandez un nouvel e-mail ci-dessous.",
      requestNew: "Demander un nouveau lien de réinitialisation",
    },

    gate: {
      splashLabel: "Préparation de votre espace de travail…",
      verificationTitle: "Vérifiez votre e-mail pour continuer",
      verificationBody:
        "Nous avons envoyé un lien de vérification à votre adresse e-mail. Confirmez votre adresse pour débloquer le journal — puis rechargez cette page ou reconnectez-vous.",
      verificationMockOpen: "Ouvrir le lien de vérification (démo)",
      blockedTitle: "Compte indisponible",
      blockedBody:
        "Ce compte ne peut pas être consulté pour le moment. Contactez le support si vous pensez qu'il s'agit d'une erreur.",
      signOut: "Se déconnecter",
    },

    errors: {
      invalidCredentials: "E-mail ou mot de passe incorrect.",
      rateLimited: "Trop de tentatives. Veuillez patienter avant de réessayer.",
      network:
        "Erreur réseau — vérifiez votre connexion et réessayez.",
      server: "Un problème est survenu de notre côté. Veuillez réessayer.",
      suspended: "Ce compte est suspendu. Contactez le support pour obtenir de l'aide.",
      deactivated: "Ce compte est désactivé.",
      emailNotVerified:
        "Vérifiez votre adresse e-mail avant de vous connecter. Consultez votre boîte pour le lien de confirmation.",
      invalidMfa: "Ce code ne correspond pas — vérifiez votre authentificateur et réessayez.",
      challengeExpired:
        "Ce défi de vérification a expiré — recommencez avec votre mot de passe.",
      recoveryInvalid: "Ce code de récupération n'a pas été reconnu.",
    },

    reasons: {
      "session-expired": {
        title: "Votre session a expiré",
        body: "Veuillez vous reconnecter pour continuer.",
      },
      "signed-out": {
        title: "Vous êtes déconnecté",
        body: "Reconnectez-vous pour retrouver votre journal.",
      },
      revoked: {
        title: "Cette session a été révoquée",
        body: "La session a été déconnectée à distance. Reconnectez-vous pour continuer.",
      },
      verified: {
        title: "E-mail vérifié",
        body: "Votre adresse e-mail est confirmée — connectez-vous pour continuer.",
      },
    } as Record<string, { title: string; body: string } | undefined>,
  },

  settings: {
    categories: {
      profile: { label: "Profil", description: "Avatar, nom, identifiant, bio, fuseau horaire" },
      trading: { label: "Trading", description: "Valeurs par défaut du formulaire de trade et de la session" },
      risk: { label: "Risque", description: "Chiffres de risque et lien avec le moteur de règles" },
      journal: { label: "Journal", description: "Champs obligatoires, suivi, rappels" },
      notifications: { label: "Notifications", description: "Par événement, par canal" },
      appearance: { label: "Apparence", description: "Thème, densité, affichage P&L" },
      academy: { label: "Académie", description: "Préférences d'apprentissage et rappels" },
      privacy: { label: "Confidentialité", description: "Analytique, visibilité et propriété des données" },
      localization: { label: "Localisation", description: "Langue, formats, fuseau horaire" },
      account: { label: "Compte", description: "Offre, comptes connectés, actions sensibles" },
    } as Record<string, { label: string; description: string }>,

    localization: {
      title: "Localisation",
      description: "La langue, les formats et la présentation des nombres — partout dans le journal.",
      preview: "Aperçu",
      language: "Langue",
      timezone: "Fuseau horaire",
      timezoneHint: "Enregistré instantanément via votre profil — il définit vos journées de trading.",
      dateFormat: "Format de date",
      timeFormat: "Format d'heure",
      decimalSeparator: "Séparateur décimal",
      numberFormat: "Format des nombres",
      currencyDisplay: "Affichage de la devise",
      weekStart: "La semaine commence le",
      optionLanguageDefault: "Langue par défaut",
      optionDecimalComma: "Virgule — 1 234,50",
      optionDecimalDot: "Point — 1,234.50",
      optionCurrencyCode: "Code — USD 1,234.50",
      optionCurrencySymbol: "Symbole — $1,234.50",
      optionMonday: "Lundi",
      optionSunday: "Dimanche",
      toastSaved: "Localisation enregistrée",
      toastSaveFailed: "Impossible d'enregistrer la localisation",
      toastTimezoneSaved: "Fuseau horaire mis à jour — les journées de trading le suivent",
      toastTimezoneFailed: "Impossible de mettre à jour le fuseau horaire",
      toastReset: "Localisation réinitialisée aux valeurs par défaut",
      resetTitle: "Réinitialiser aux valeurs par défaut ?",
      resetBody: "Les formats reviennent aux valeurs sûres (votre fuseau horaire n'est pas touché). Cette action est irréversible.",
      resetConfirm: "Réinitialiser la carte",
    },
  },

  session: sessionFr,

  trades: tradesFr,

  nofy: nofyFr,
};
