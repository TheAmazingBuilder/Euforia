/**
 * Security center verification — MASTER PROMPT §20/§21.
 *
 * NOTE (MSW): the mock engine reseeds on every FULL page load — this script
 * therefore navigates CLIENT-SIDE (tab clicks) after the initial goto, like
 * verify-integrations-hub.js. The password change in step 6 also updates the
 * engine password, so later re-auths use the tracked current password.
 *
 * Covers: 9-tab structure, URL-persisted tabs, protection checklist with
 * methodology, password change behind re-auth (wrong password + success),
 * 2FA enroll (codes shown once, then never again) + confirm + disable,
 * API key create (secret shown once) + revoke, session revocation (one /
 * others), connected accounts derived from Integrations (masked secrets),
 * append-only events, login history, active devices, rate-limit lockout,
 * console cleanliness, light + mobile.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const results = [];
const ok = (name, cond) => results.push(`${cond ? "PASS" : "FAIL"} — ${name}`);
let currentPassword = "cosmoz-demo-2026";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const text = m.text();
    if (
      m.type() === "error" &&
      !text.includes("socket.io") &&
      !text.includes("404") &&
      !text.includes("Failed to load resource")
    )
      errors.push(text);
  });

  const reauth = async () => {
    await page.waitForSelector('[data-testid="reauth-dialog-password"]');
    await page.fill('[data-testid="reauth-dialog-password"]', currentPassword);
    await page.click('[data-testid="reauth-dialog-submit"]');
  };

  // ── 1. Structure: 9 tabs per MASTER PROMPT §3 ─────────────────────────────
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  ok("h1 Security", (await page.locator("h1").first().textContent())?.includes("Security") ?? false);
  const tabCount = await page.locator('[data-testid="security-tablist"] [role="tab"]').count();
  ok("9 onglets (§3)", tabCount === 9);

  // ── 2. URL-persisted tab ──────────────────────────────────────────────────
  await page.click('[data-testid="security-tab-api-keys"]');
  await page.waitForTimeout(300);
  ok("onglet persisté dans l'URL (?tab=)", page.url().includes("tab=api-keys"));

  // ── 3. Overview: checklist + méthodologie + tuiles ────────────────────────
  await page.click('[data-testid="security-tab-overview"]');
  await page.waitForTimeout(300);
  const checks = await page.locator('[data-testid^="protection-"]').count();
  ok("checklist protection (7 checks)", checks === 7);
  const methodology = await page.locator("text=Methodology:").count();
  ok("méthodologie affichée (pas de faux score)", methodology === 7);
  const stats = await page.locator('[data-testid^="overview-stat-"]').count();
  ok("4 tuiles de statut", stats === 4);

  // ── 4. Authentication: carte Password conservée + rate limiting ───────────
  await page.click('[data-testid="security-tab-authentication"]');
  await page.waitForTimeout(200);
  ok("carte Password présente", (await page.locator("#security-password-current").count()) === 1);
  ok("politique rate limiting visible", (await page.locator("text=Rate limiting").count()) >= 1);

  // ── 5. Password change: re-auth (mauvais mot de passe → erreur) ───────────
  await page.fill("#security-password-current", "irrelevant-current");
  await page.fill("#security-password-new", "brand-new-password-42");
  await page.fill("#security-password-confirm", "brand-new-password-42");
  await page.click('[data-testid="password-submit"]');
  await page.waitForSelector('[data-testid="reauth-dialog-password"]');
  await page.fill('[data-testid="reauth-dialog-password"]', "wrong-password");
  await page.click('[data-testid="reauth-dialog-submit"]');
  await page.waitForSelector('[data-testid="reauth-dialog-error"]');
  const wrongPwError = await page.locator('[data-testid="reauth-dialog-error"]').textContent();
  ok("mauvais mot de passe → erreur + compteur", wrongPwError.includes("attempt"));
  await page.click('[data-testid="reauth-dialog"] >> text=Cancel');

  // ── 6. Password change: re-auth réussie (le moteur adopte le nouveau mdp) ─
  await page.click('[data-testid="password-submit"]');
  await reauth();
  await page.waitForSelector("text=Password updated after re-authentication");
  currentPassword = "brand-new-password-42";
  ok("mot de passe changé derrière re-auth", true);

  // ── 7. Événements: PASSWORD_CHANGED loggé (append-only) ───────────────────
  await page.click('[data-testid="security-tab-events"]');
  await page.waitForTimeout(400);
  ok("PASSWORD_CHANGED loggé", (await page.locator('[data-testid="event-PASSWORD_CHANGED"]').count()) >= 1);
  ok("badge retention visible", (await page.locator("text=append-only").count()) >= 1);

  // ── 8. 2FA: enable → codes montrés UNE fois → confirm → active ────────────
  await page.click('[data-testid="security-tab-two-factor"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="tfa-switch"]');
  await reauth();
  await page.waitForSelector('[data-testid="tfa-enroll-dialog"]');
  const codeCount = await page.locator('[data-testid="tfa-recovery-codes"] span').count();
  ok("10 recovery codes montrés une fois", codeCount === 10);
  const enrollHint = await page.locator('[data-testid="tfa-enroll-dialog"]').textContent();
  const demoCode = enrollHint.match(/would generate is\s*(\d{6})/)?.[1];
  ok("code démo affiché", demoCode !== undefined && demoCode.length === 6);
  await page.check('[data-testid="tfa-saved"]');
  await page.fill('[data-testid="tfa-code"]', demoCode ?? "");
  await page.click('[data-testid="tfa-verify"]');
  await page.waitForSelector("text=Two-factor authentication is on");
  ok("2FA activée après challenge", true);
  const recoveryShown = await page
    .waitForSelector("text=10 of 10 unused", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ok("codes restants = 10", recoveryShown);

  // ── 9. Navigation away & back: les codes ne réapparaissent JAMAIS (§6) ────
  await page.click('[data-testid="security-tab-api-keys"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="security-tab-two-factor"]');
  await page.waitForTimeout(300);
  const codesAfterAway = await page.locator('[data-testid="tfa-recovery-codes"]').count();
  ok("codes plus visibles après fermeture du setup", codesAfterAway === 0);

  // ── 10. TFA_ENABLED loggé ─────────────────────────────────────────────────
  await page.click('[data-testid="security-tab-events"]');
  await page.waitForTimeout(400);
  ok("TFA_ENABLED loggé", (await page.locator('[data-testid="event-TFA_ENABLED"]').count()) >= 1);

  // ── 11. 2FA: disable (confirm + re-auth) ──────────────────────────────────
  await page.click('[data-testid="security-tab-two-factor"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="tfa-switch"]');
  await page.waitForSelector('[data-testid="tfa-disable-confirm-confirm"]');
  await page.click('[data-testid="tfa-disable-confirm-confirm"]');
  await reauth();
  await page.waitForSelector("text=Two-factor disabled");
  ok("2FA désactivée (confirm + re-auth)", true);

  // ── 12. API keys: création (secret une fois) + révocation ────────────────
  await page.click('[data-testid="security-tab-api-keys"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="api-key-create"]');
  await page.fill('[data-testid="api-key-name"]', "Playwright key");
  await page.check('[data-testid="api-key-scope-read-calendar"]');
  await page.selectOption('[data-testid="api-key-expiry"]', "30");
  await page.click('[data-testid="api-key-dialog-create"]');
  await reauth();
  await page.waitForSelector('[data-testid="secret-once-secret"]');
  const secret = (await page.locator('[data-testid="secret-once-secret"]').textContent()).trim();
  ok("secret cz_live_* affiché une fois", secret.startsWith("cz_live_"));
  await page.click('[data-testid="secret-once-done"]');
  await page.waitForTimeout(500);
  const pageContent = await page.content();
  ok("secret plus présent dans le DOM après fermeture", !pageContent.includes(secret));
  ok("liste: préfixe masqué + fingerprint", pageContent.includes("cz_live_") && pageContent.includes("fingerprint"));
  const revokeBtn = page.locator('[data-testid^="api-key-revoke-"]').last();
  await revokeBtn.click();
  await page.waitForSelector('[data-testid="api-key-revoke-confirm-confirm"]');
  await page.click('[data-testid="api-key-revoke-confirm-confirm"]');
  await reauth();
  await page.waitForSelector("text=revoked — clients lose access now");
  ok("clé révoquée derrière re-auth", true);

  // ── 13. Sessions: révoquer une + les autres ───────────────────────────────
  await page.click('[data-testid="security-tab-sessions"]');
  await page.waitForTimeout(300);
  const before = await page.locator('[data-testid^="session-row-"]').count();
  await page.click('[data-testid="session-revoke-ses-mbp"]');
  await page.waitForTimeout(600);
  const afterOne = await page.locator('[data-testid^="session-row-"]').count();
  ok("révocation d'une session", afterOne === before - 1);
  await page.click('[data-testid="sessions-logout-others"]');
  await page.waitForSelector('[data-testid="sessions-confirm-confirm"]');
  await page.click('[data-testid="sessions-confirm-confirm"]');
  await page.waitForTimeout(600);
  const afterOthers = await page.locator('[data-testid^="session-row-"]').count();
  ok("logout others → ne garde que la session courante", afterOthers === 1);

  // ── 14. Connected accounts: dérivés d'Integrations, secrets masqués ───────
  await page.click('[data-testid="security-tab-connected-accounts"]');
  await page.waitForTimeout(400);
  const derivRow = await page.locator('[data-testid="connected-deriv"]').count();
  ok("compte connecté Deriv dérivé du hub", derivRow === 1);
  const connectedText = await page.locator('[data-testid="connected-deriv"]').textContent();
  ok("identifiant masqué + hint vault, jamais de secret", connectedText.includes("paired") && connectedText.includes("••"));

  // ── 15. Login history + devices ───────────────────────────────────────────
  await page.click('[data-testid="security-tab-login-history"]');
  await page.waitForTimeout(400);
  ok("historique: succès présents", (await page.locator('[data-testid="login-ok"]').count()) >= 3);
  ok("historique: échec présent avec raison", (await page.locator('[data-testid="login-fail"]').count()) >= 1);
  await page.click('[data-testid="security-tab-devices"]');
  await page.waitForTimeout(300);
  ok("onglet appareils: carte courante + autres", (await page.locator("text=Current device").count()) === 1);

  // ── 16. Rate limiting: 6 mauvais re-auth → 429 lockout (§14) ──────────────
  await page.click('[data-testid="security-tab-authentication"]');
  await page.waitForTimeout(300);
  let lastError = "";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await page.fill("#security-password-current", "x");
    await page.fill("#security-password-new", "another-password-99");
    await page.fill("#security-password-confirm", "another-password-99");
    await page.click('[data-testid="password-submit"]');
    await page.waitForSelector('[data-testid="reauth-dialog-password"]');
    await page.fill('[data-testid="reauth-dialog-password"]', `wrong-${attempt}`);
    await page.click('[data-testid="reauth-dialog-submit"]');
    await page.waitForSelector('[data-testid="reauth-dialog-error"]');
    lastError = (await page.locator('[data-testid="reauth-dialog-error"]').textContent()) ?? "";
    await page.click('[data-testid="reauth-dialog"] >> text=Cancel');
    await page.waitForTimeout(150);
  }
  ok("6ᵉ tentative → verrouillage 429 (Retry-After)", lastError.includes("Too many attempts"));

  // ── 17. Screenshots (light + mobile) ──────────────────────────────────────
  await page.screenshot({ path: "scripts/shots/security-overview.png" });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: "scripts/shots/security-mobile.png", fullPage: true });
  ok("captures light + mobile prises", true);

  // ── Console ───────────────────────────────────────────────────────────────
  ok("0 erreur console", errors.length === 0);

  await browser.close();
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (errors.length > 0) console.log("Console errors:", errors);
  process.exit(failed.length === 0 ? 0 : 1);
})();
