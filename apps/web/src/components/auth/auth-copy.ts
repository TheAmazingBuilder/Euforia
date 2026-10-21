/**
 * Centralized authentication copy (spec §59).
 *
 * The whole application currently ships a single English surface; an
 * i18n system does not exist yet and building one only for auth would
 * fragment the product language. Every user-facing auth string lives here
 * as a named constant so a future i18n layer (EN/FR) can replace this
 * module without touching a single component.
 */

export const authCopy = {
  brandTagline: "Professional Trading Journal",
  brandPitch:
    "The trading journal that coaches you — journal every trade, guard your discipline, and let the coach keep you honest.",

  pillars: [
    { title: "Journal", detail: "Every trade, graded and reviewed." },
    { title: "Discipline", detail: "Rules, violations and score." },
    { title: "Coach", detail: "Insights that change behavior." },
  ],

  login: {
    title: "Sign in to Euforia",
    subtitle: "Welcome back, trader — your journal and your coach are waiting.",
    email: "Email",
    password: "Password",
    remember: "Remember this device",
    submit: "Sign in",
    submitting: "Signing in…",
    forgot: "Forgot password?",
    createAccount: "Create account",
    noAccount: "No account yet?",
    mfaTitle: "Two-factor authentication",
    mfaSubtitle: "Enter the 6-digit code from your authenticator app.",
    mfaCode: "Authentication code",
    mfaSubmit: "Verify",
    mfaVerifying: "Verifying…",
    mfaUseRecovery: "Use a recovery code instead",
    mfaUseCode: "Use an authenticator code instead",
    mfaRecoveryLabel: "Recovery code",
    mfaDemoHint: "Mock authenticator (this demo):",
    demoHintTitle: "Demo account",
    demoHintFill: "Fill",
    demoHintNote:
      "Mocked environment — the demo journal is shared by all demo sign-ins.",
  },

  register: {
    title: "Create your account",
    subtitle: "Start journaling your trades and let the coach keep you honest.",
    name: "Name",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm password",
    submit: "Create account",
    submitting: "Creating account…",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    passwordRule: "At least 10 characters.",
    mismatch: "Passwords do not match.",
    pendingTitle: "Check your inbox",
    pendingBody:
      "Your account has been created. We sent a verification link to your email address — the link expires in 24 hours.",
    pendingMockTitle: "Mocked delivery",
    pendingMockBody:
      "No mail service exists in this demo environment, so the one-time verification link is provided below (in production this arrives by email).",
    pendingMockOpen: "Open verification link",
    resend: "Resend verification email",
    resending: "Sending…",
  },

  verifyEmail: {
    verifying: "Verifying your email…",
    successTitle: "Email verified",
    successBody: "Your email address is confirmed. Your account is ready.",
    successCta: "Continue to sign in",
    alreadyTitle: "Already verified",
    alreadyBody:
      "This email address was already verified — you can sign in right away.",
    expiredTitle: "Link expired",
    expiredBody:
      "This verification link has expired. Request a fresh email below.",
    invalidTitle: "Link not valid",
    invalidBody:
      "This verification link is not valid. Double-check the link, or request a new email.",
    usedTitle: "Link already used",
    usedBody:
      "This verification link was already used. If you still cannot sign in, request a new email.",
    resend: "Send a new verification email",
    resending: "Sending…",
    resendDone: "Verification email sent.",
    ctaLogin: "Back to sign in",
  },

  forgot: {
    title: "Forgot your password?",
    subtitle:
      "Enter the email address you registered with and we will send you a reset link.",
    email: "Email",
    submit: "Send reset link",
    submitting: "Sending…",
    sentTitle: "Check your inbox",
    sentBody:
      "If an account exists for this email address, instructions have been sent. The reset link expires in 30 minutes.",
    sentMockTitle: "Mocked delivery",
    sentMockBody:
      "No mail service exists in this demo environment, so the one-time reset link is provided below (in production this arrives by email).",
    sentMockOpen: "Open reset link",
    backToLogin: "Back to sign in",
  },

  reset: {
    title: "Choose a new password",
    subtitle: "Pick a strong, unique password — at least 10 characters.",
    password: "New password",
    confirmPassword: "Confirm new password",
    submit: "Reset password",
    submitting: "Resetting password…",
    successTitle: "Password reset",
    successBody:
      "Your password has been changed. Sign in with your new password — existing sessions have been signed out.",
    successCta: "Continue to sign in",
    invalidTitle: "Link not valid",
    invalidBody: "This reset link is not valid. Request a fresh one below.",
    expiredTitle: "Link expired",
    expiredBody:
      "This reset link has expired. Request a fresh email below.",
    usedTitle: "Link already used",
    usedBody:
      "This reset link was already used. Request a fresh email below.",
    requestNew: "Request a new reset link",
  },

  gate: {
    splashLabel: "Preparing your workspace…",
    verificationTitle: "Verify your email to continue",
    verificationBody:
      "We sent a verification link to your email address. Confirm your address to unlock the journal — then reload this page or sign in again.",
    verificationMockOpen: "Open verification link (mock)",
    blockedTitle: "Account unavailable",
    blockedBody:
      "This account cannot be accessed right now. Contact support if you believe this is a mistake.",
    signOut: "Sign out",
  },

  errors: {
    invalidCredentials: "Incorrect email or password.",
    rateLimited: "Too many attempts. Please wait before trying again.",
    network:
      "Network error — check your connection and try again.",
    server: "Something went wrong on our side. Please try again.",
    suspended: "This account is suspended. Contact support for help.",
    deactivated: "This account is deactivated.",
    emailNotVerified:
      "Verify your email address before signing in. Check your inbox for the confirmation link.",
    invalidMfa: "That code does not match — check your authenticator and try again.",
    challengeExpired:
      "This verification challenge expired — start again with your password.",
    recoveryInvalid: "That recovery code was not recognized.",
  },

  reasons: {
    "session-expired": {
      title: "Your session has expired",
      body: "Please sign in again to continue.",
    },
    "signed-out": {
      title: "You are signed out",
      body: "Sign in again to get back to your journal.",
    },
    revoked: {
      title: "This session was revoked",
      body: "The session was signed out remotely. Sign in again to continue.",
    },
    verified: {
      title: "Email verified",
      body: "Your email address is confirmed — sign in to continue.",
    },
  } as Record<string, { title: string; body: string } | undefined>,
} as const;
