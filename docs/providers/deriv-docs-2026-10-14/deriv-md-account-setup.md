---
updatedAt: 2026-02-27T11:43:00.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# Account setup

This section will guide you through creating your Deriv account and seamlessly registering your application.

<div class="box-container">
  <div class="box">
    <a href="https://legacy-docs.deriv.com/docs/account-setup#create-a-deriv-account" rel="noopener noreferrer" style={{ cursor: "pointer", display: "inline-block" }}>
      <img src="https://files.readme.io/9df9417e54afdbce85a5593741ecb434a063b6039b4e67851affbf4ad19e9c55-New.svg" alt="Account Setup" style={{ pointerEvents: "none" }} />
    </a>
  </div>

  <div class="box">
    <a href="https://legacy-docs.deriv.com/docs/account-setup#register-your-deriv-application" rel="noopener noreferrer" style={{ cursor: "pointer", display: "inline-block" }}>
      <img src="https://files.readme.io/ed59319-App.svg" alt="Register App" style={{ pointerEvents: "none" }} />
    </a>
  </div>

  <div class="box">
    <a href="https://legacy-docs.deriv.com/docs/account-setup#create-an-api-token" rel="noopener noreferrer" style={{ cursor: "pointer", display: "inline-block" }}>
      <img src="https://files.readme.io/c0e1bf2-Token.svg" alt="Token" style={{ pointerEvents: "none" }} />
    </a>
  </div>
</div>

## Create a Deriv account

1. Visit <a href="https://legacy-api.deriv.com/" target="_blank" rel="noopener noreferrer">legacy-api.deriv.com</a>
2. Click **Sign Up** on the top right corner of the page.
3. Provide your **Email Address**.
4. Check your inbox for a verification email and click the link to confirm your account.
5. After verifying your email, provide your **Country of residence**, **Citizenship**, and create a **Password**.
6. Your **Demo** account is now active — you can start building and testing your apps right away.
7. To create a **Real** account, click **Complete my profile**.
8. Choose your **Account Currency**, fill in your **Personal** and **Address details**, and accept the **Terms of use** to proceed.
9. Your **Real** account is now active — you’re eligible to earn markup commissions on your app.

> 📘 Note:
>
> If your country of residence is one of the [supported countries for Wallets](https://legacy-docs.deriv.com/docs/country-list#wallets), you will also receive a virtual Wallet (demo) account. Once you complete the real account creation process, a real Wallet account will also be created, based on the currency you select.

<div style={{ display: "flex", alignItems: "flex-start", backgroundColor: "#fff6f6", borderLeft: "6px solid #e74c3c", padding: "16px", margin: "24px 0", borderRadius: "6px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
  <img src="https://img.icons8.com/color/48/000000/error--v1.png" alt="Warning" style={{ width: "28px", height: "28px", marginRight: "12px", marginTop: "2px" }} />

  <div>
    <div style={{ fontSize: "16px", fontWeight: "600", color: "#c0392b", marginBottom: "6px" }}>
      Attention Developers – Wallet Accounts Can’t Trade!
    </div>

    <div style={{ fontSize: "14px", color: "#333" }}>
      If your account type is <strong>CRW (Wallet)</strong> or <strong>VRW (Virtual Wallet)</strong>, you <span style={{ color: "#e74c3c", fontWeight: "bold" }}>cannot perform trading transactions via API</span>.

      <br />

      To continue using the API for trading operations (like <code>buy</code>, <code>proposal</code>, etc.), please follow these steps:

      <br />

      1️⃣ <strong>Create a real trading account (CR)</strong> on
      <a href="https://hub.deriv.com/tradershub/options" target="_blank" style={{ color: "#2980b9", textDecoration: "none" }}>Traders Hub</a>.<br />
      2️⃣ <strong>Use that CR account</strong> when generating your API token.
    </div>
  </div>
</div>

### How to add or select your real trading (CR) account

To use the Deriv API for trading and earn markup commission, you must have a CR (real trading) account. Here’s how to check or create one:

<br />

<div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px", marginTop: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
  {/* Step 1 */}

  <div style={{ width: "300px", backgroundColor: "#f9f9f9", borderRadius: "12px", padding: "16px", textAlign: "center", boxSizing: "border-box" }}>
    <h3 style={{ marginBottom: "8px", fontSize: "16px", color: "#555" }}>Step 1</h3>
    <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "10px" }}>Open the account switcher</h2>

    <p style={{ fontSize: "14px", color: "#333", marginBottom: "12px" }}>
      Click the dropdown next to your balance to view all available accounts.
    </p>

    <img src="https://files.readme.io/c5817924688262118003b3c1ba41aaf3411c26e670bd03a6a1d96f5261a370bb-Screenshot_2025-08-01_at_15.36.01.png" alt="Step 1" style={{ width: "100%", borderRadius: "8px" }} />
  </div>

  {/* Step 2 */}

  <div style={{ width: "300px", backgroundColor: "#f9f9f9", borderRadius: "12px", padding: "16px", textAlign: "center", boxSizing: "border-box" }}>
    <h3 style={{ marginBottom: "8px", fontSize: "16px", color: "#555" }}>Step 2</h3>
    <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "10px" }}>Manage your accounts</h2>

    <p style={{ fontSize: "14px", color: "#333", marginBottom: "12px" }}>
      Tap <strong>"Add or manage account"</strong> to open or switch to a trading account (CR).
    </p>

    <img src="https://files.readme.io/f917b62510a47be23ba6c825f02768d19df98eb7c67fe260c6157a49f5fabebf-Screenshot_2025-08-01_at_15.38.35.png" alt="Step 2" style={{ width: "100%", borderRadius: "8px" }} />
  </div>

  {/* Step 3 */}

  <div style={{ width: "300px", backgroundColor: "#f9f9f9", borderRadius: "12px", padding: "16px", textAlign: "center", boxSizing: "border-box" }}>
    <h3 style={{ marginBottom: "8px", fontSize: "16px", color: "#555" }}>Step 3</h3>
    <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "10px" }}>Choose your currency</h2>

    <p style={{ fontSize: "14px", color: "#333", marginBottom: "12px" }}>
      Select the <strong>"Fiat currencies"</strong> tab and pick your preferred currency to open a CR account.
    </p>

    <img src="https://files.readme.io/f8765291a32256ba09c9298c8cf39f8b5305e6a732cc843ab7685ca36c1cf563-Screenshot_2025-08-01_at_15.39.52.png" alt="Step 3" style={{ width: "100%", borderRadius: "8px" }} />
  </div>
</div>

Once created, your CR account (e.g. **CR12345678**) will be ready to use with API tokens for trading actions like `buy`, `proposal`, etc.

## Register your Deriv application

### First-time app registration

1. Open the <a href="https://legacy-api.deriv.com/dashboard/" target="_blank"><strong>Dashboard</strong></a> which will take you directly to the <strong>Register application</strong> screen.

<Image align="center" src="https://files.readme.io/e0c9973785ae1c7737efce8a8b622481011364d8609bcb274a3e27a9c0b0c4b8-Screenshot_2025-05-20_at_11.16.20_AM.png" />

### To create additional apps

1. Open the <a href="https://legacy-api.deriv.com/dashboard/" target="_blank"><strong>Dashboard</strong></a> and go to the <strong>Applications</strong> tab.

2. Click the **pencil icon**

<Image align="center" src="https://files.readme.io/975b3ab606c6ccfae9189135cf4b4fd3f5310800251a762d69b2908e174d1442-Screenshot_2025-05-19_at_4.00.43_PM.png" />

***

### Register a new application

1. Provide a **name** for your application and accept the **Terms and conditions**.

2. Configure your application:

   1. Add your **markup fee percentage**.

      > 📘 **Note**
      >
      > Markup is the commission added to the trade price to earn additional income.\
      > Learn more about markup calculation <a href="https://legacy-docs.deriv.com/docs/mark-up" target="_blank">here</a>.

   2. Fill in your **OAuth details**:

      1. **Redirect URL** – Allows users to log in to your app using their Deriv accounts without using an API token.
      2. **Verification URL** – Used for email verification. If provided, a link with a verification token will be sent to the user’s email. Otherwise, the **Redirect URL** is used.\
         Example: If your domain is `https://example.com` and your verification endpoint is `/verify`, the full URL would be:\
         `https://example.com/verify`
      3. Select the required **Scopes of authorization** and click **Create**.

Your app will now appear in the **Application Manager** under the **Applications** tab.

<Image align="center" src="https://files.readme.io/0ebb94a5cb1f995b591318c0cd337eff6e4d23bd5f8a42368604a8a004ed790b-registerapp02.gif" />

***

### To update an existing app

1. Open the <a href="https://legacy-api.deriv.com/dashboard/" target="_blank"><strong>Dashboard</strong></a> and go to the <strong>Applications</strong> tab.

2. Click the **pencil icon** ![](https://files.readme.io/5fe2a31fa40a02a3e24fb441fa90976cf1c45cf0958c0a3518b5b534986a9cbf-Screenshot_2025-05-19_at_3.38.58_PM.png) next to the app you want to edit.

   <Image align="center" src="https://files.readme.io/b0aa9adcdf9f8436dcd6bd4ef18a13b1baea149084ff25cc133c4465d238bc8a-Screenshot_2025-05-20_at_2.19.42_PM.png" />

3. You can update the **App name**, **Markup fee percentage**, and **OAuth details** as needed.

<Image align="center" src="https://files.readme.io/5b62f1290c6589a56d6549c47f42dc9f95b39ec3e38a777660ccc4418cb0bd4d-edit_app.gif" />

## Create an API token

1. Open the <a href="https://legacy-api.deriv.com/dashboard/" target="_blank"><strong>Dashboard</strong></a> and go to the **API tokens** tab.

2. Click **Create new token** from the left panel.

3. Select the **account type** for which you want to generate a token.
   > ❗️ **Important**
   >
   > To use the API for trading operations (like buy, proposal, etc.), use your **real trading account (CR)**.

4. Choose the required **access level (scopes)**:

   1. **Read** – View market data and account information.
   2. **Trade** – Full access to trade, manage funds, and sensitive data.
   3. **Payments** – Enables withdrawals to payment agents and inter-account transfers.
   4. **Trading Information** – View trading history.
   5. **Admin** – Full access to account settings, token usage, and account management.

      > ❗️ **Not recommended**
      >
      > The **Admin** scope gives extensive access to all account functions and should only be used when absolutely necessary. Make sure the token is stored and used securely.

5. Enter a **descriptive name** for your token.

6. Click **Create token** to generate the token.

7. A confirmation pop-up will appear — **“Token created successfully.”**\
   Make sure to **copy and save the token key** now.

> ⚠️ **Important**
>
> For security reasons, the token **cannot be viewed or copied again**.\
> If you lose the token, you’ll need to create a new one.

<Image align="center" src="https://files.readme.io/245eca19393f1488d60d997a3c99a8c5b833d614e26b53568fd1eb7966f704e0-TokenCreation.gif" />