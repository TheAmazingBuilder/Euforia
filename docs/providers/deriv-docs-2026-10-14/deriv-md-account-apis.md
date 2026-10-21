---
updatedAt: 2026-03-02T06:27:26.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# Account APIs

Account APIs are designed to manage user accounts, settings, and security. They provide functionalities for authorising sessions, managing API tokens, retrieving and updating account information, handling KYC (Know Your Customer) processes, and setting trading and self-exclusion limits.

These APIs ensure secure, compliant, and personalised interactions on the Deriv platforms, empowering users to manage their accounts and trading activities effectively.

<Table>
  <thead>
    <tr>
      <th>
        \# 
      </th>

      <th>
        API Name
      </th>

      <th>
        Description
      </th>

      <th>
        Send
      </th>

      <th>
        Subscribe
      </th>

      <th>
        Scope
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        1
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#api_token" target="_blank" rel="noopener noreferrer">API Token</a>
      </td>

      <td>
        This call manages API tokens.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        2
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#authorize" target="_blank" rel="noopener noreferrer">Authorize</a>
      </td>

      <td>
        Authorises the current WebSocket session using a token. This must precede requests that require access to the client account, such as purchasing or selling contracts.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        NA
      </td>
    </tr>

    <tr>
      <td>
        3
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#balance" target="_blank" rel="noopener noreferrer">Balance</a>
      </td>

      <td>
        Retrieves the user account balance.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✔
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        4
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#document_upload" target="_blank" rel="noopener noreferrer">Document Upload</a>
      </td>

      <td>
        Requests and uploads KYC documents from the client.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        5
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#get_account_status" target="_blank" rel="noopener noreferrer">Account Status</a>
      </td>

      <td>
        Retrieves the current status of the user account.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        6
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#login_history" target="_blank" rel="noopener noreferrer">Login History</a>
      </td>

      <td>
        Retrieves a summary of the user’s login history.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        7
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#logout" target="_blank" rel="noopener noreferrer">Log Out</a>
      </td>

      <td>
        Logs the user out of the current session.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        NA
      </td>
    </tr>

    <tr>
      <td>
        8
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#get_limits" target="_blank" rel="noopener noreferrer">Account Limits</a>
      </td>

      <td>
        Retrieves the user's trading and withdrawal limits.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        9
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#get_self_exclusion" target="_blank" rel="noopener noreferrer">Get Self-Exclusion</a>
      </td>

      <td>
        Allows users to exclude themselves from the website or set limits on their trading activities.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        10
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#get_settings" target="_blank" rel="noopener noreferrer">Get Account Settings</a>
      </td>

      <td>
        Retrieves the user’s account settings, such as email, date of birth, and address.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        11
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#identity_verification_document_add" target="_blank" rel="noopener noreferrer">Identity Verification Add Document</a>
      </td>

      <td>
        Adds documents required for identity verification, including country of issuance and document type.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        12
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#new_account_maltainvest" target="_blank" rel="noopener noreferrer">New Real-Money Account: Deriv Investment (Europe) Ltd</a>
      </td>

      <td>
        Opens a new real-money account with the `Maltainvest` Landing Company.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        13
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#new_account_real" target="_blank" rel="noopener noreferrer">New Real-Money Account: Default Landing Company</a>
      </td>

      <td>
        Opens a new real-money account.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        14
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#new_account_virtual" target="_blank" rel="noopener noreferrer">New Virtual-Money Account</a>
      </td>

      <td>
        Creates a demo account.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        NA
      </td>
    </tr>

    <tr>
      <td>
        15
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#oauth_apps" target="_blank" rel="noopener noreferrer">OAuth Applications</a>
      </td>

      <td>
        Lists all used OAuth applications.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        16
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#verify_email" target="_blank" rel="noopener noreferrer">Verify Email</a>
      </td>

      <td>
        Verifies the user’s email address for various purposes.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        NA
      </td>
    </tr>

    <tr>
      <td>
        17
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#get_financial_assessment" target="_blank" rel="noopener noreferrer">Get Financial Assessment</a>
      </td>

      <td>
        Retrieves the client’s financial assessment details, which are required for compliance with regulatory and KYC requirements.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read
      </td>
    </tr>

    <tr>
      <td>
        18
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#topup_virtual" target="_blank" rel="noopener noreferrer">Top Up Virtual-Money Account</a>
      </td>

      <td>
        Tops up the demo account when the balance is low.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Trade
      </td>
    </tr>

    <tr>
      <td>
        19
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#tnc_approval" target="_blank" rel="noopener noreferrer">Terms and Conditions Approval</a>
      </td>

      <td>
        Approves the latest version of Deriv's terms and conditions.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        20
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#trading_platform_investor_password_reset" target="_blank" rel="noopener noreferrer">Trading Platform: Investor Password Reset</a>
      </td>

      <td>
        Resets the investor password of the trading platform account.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        21
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#trading_platform_password_reset" target="_blank" rel="noopener noreferrer">Trading Platform: Password Reset</a>
      </td>

      <td>
        Resets the password of the trading platform account.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        22
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#set_financial_assessment" target="_blank" rel="noopener noreferrer">Set Financial Assessment</a>
      </td>

      <td>
        Updates the financial assessment based on the client’s knowledge and experience with options trading.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        23
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#set_self_exclusion" target="_blank" rel="noopener noreferrer">Set Self-Exclusion</a>
      </td>

      <td>
        Sets self-exclusion limits (in conjunction with the `get_self_exclusion` function).
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>

    <tr>
      <td>
        24
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#set_settings" target="_blank" rel="noopener noreferrer">Set Account Settings</a>
      </td>

      <td>
        Updates the user’s account settings (in conjunction with `get_account_settings`).
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Admin
      </td>
    </tr>
  </tbody>
</Table>