---
updatedAt: 2026-02-27T21:58:38.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# Authentication

Secure access for your users.

To unlock the complete functionality of Deriv APIs, you must first authenticate and then authorize your users.

For Deriv APIs, your users must be authenticated and authorized by our OAuth provider and WebSocket Server.

The OAuth provider handles user logins and grants secure access tokens. The WebSocket server then uses these tokens to verify users and facilitate seamless communication with the Deriv API. Together, these components ensure the security and efficiency of your app.

<Image align="center" src="https://files.readme.io/da5ca10-5.png" />

## Authentication process

OAuth, short for Open Authorization, is a protocol that enables a client to access server-hosted resources on behalf of the user without exposing their credentials. For more information, refer to <a href="https://legacy-docs.deriv.com/docs/oauth" target="_blank">OAuth</a>.

This method enables Deriv account holders to log into third-party apps without generating an API token. Consequently, the third-party app does not access the user’s password or permanent API token, enhancing security.

To authenticate your user:

1. Make sure the URL is specified correctly in the OAuth Details. To verify this, navigate to the **Application manager** under the **Applications** tab in the <strong><a href="https://legacy-api.deriv.com/dashboard/" target="_blank">Dashboard</a></strong> and click the copy icon ![](https://files.readme.io/d5f85df822ad6a2c6f4fc30ae3440d4627e73f37262c6fe5f870d89a5bcc6593-Screenshot_2025-05-22_at_11.12.50_AM.png) to copy the **OAuth redirect URL**. To change or update the URL, click the **pencil icon** ![](https://files.readme.io/5fe2a31fa40a02a3e24fb441fa90976cf1c45cf0958c0a3518b5b534986a9cbf-Screenshot_2025-05-19_at_3.38.58_PM.png) next to the app you want to edit.
2. Add a login button on your website or app.
3. When users click the button, automatically send them to the following URL: `https://oauth.deriv.com/oauth2/authorize?app_id=YOUR_APP_ID`\
   Replace `YOUR_APP_ID` with the actual ID of your app (found under **Dashboard → Applications → Application manager**).
4. If you're a Deriv partner and want to ensure that all your users are correctly tagged under your account, you must include your **affiliate token** and **UTM campaign** in the OAuth URL for **sign in**.\
   For example:  `https://oauth.deriv.com/oauth2/authorize?app_id=YOUR_APP_ID&affiliate_token=YOUR_TOKEN&utm_campaign=YOUR_CAMPAIGN`\ <br />\
   You’ll find these values in the referral links shared with you. Here’s how to extract and use them:
   1. If your referral link looks like:\
      <https://deriv.com/signup?sidc=FB58247C-6B33-4677-A6AD-168C2D72323C&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU00001>\
      Your **affiliate\_token** is the **sidc** value: `FB58247C-6B33-4677-A6AD-168C2D72323C`\
      Your **utm\_campaign** is: `dynamicworks`\
      Your OAuth URL should be:\
      <https://oauth.deriv.com/oauth2/authorize?app_id=YOUR_APP_ID&affiliate_token=FB58247C-6B33-4677-A6AD-168C2D72323C&utm_campaign=dynamicworks>
   2. If your referral link looks like:\
      <https://track.deriv.com/_jqd7qq_iBB18zg8lBvFoLmNd7ZgqdRLk/1/>\
      Your **affiliate\_token** is: `jqd7qq_iBB18zg8lBvFoLmNd7ZgqdRLk`\
      Your **utm\_campaign** is: `myaffiliates`\
      Your OAuth URL should be:\
      <https://oauth.deriv.com/oauth2/authorize?app_id=YOUR_APP_ID&affiliate_token=jqd7qq_iBB18zg8lBvFoLmNd7ZgqdRLk&utm_campaign=myaffiliates>\
      Adding these parameters ensures proper referral tracking and commissions under your partnership.

> 📘 Important note:
>
> For **sign-ups**, use the parameter `t` and `utm_campaign`:
>
> ```json
> https://hub.deriv.com/tradershub/signup?t=YOUR_TOKEN&utm_campaign=YOUR_CAMPAIGN
> ```

When the user completes the signup or login, they will be redirected to the Redirect URL.

<Image align="center" src="https://files.readme.io/57d8341-7.png" />

The redirected URL will include appended arguments containing the user's session tokens. For instance:

<Image align="center" src="https://files.readme.io/88ca650-6.png" />

```json
https://[YOUR_WEBSITE_URL]/redirect/?acct1=cr799393&token1=a1-f7pnteezo4jzhpxclctizt27hyeot&cur1=usd& acct2=vrtc1859315&token2=a1clwe3vfuuus5kraceykdsoqm4snfq&cur2=usd&acct3=CRW1157&token3=a1-Yxh5gJS8m406Jopon5JlvKNRsxLMC&cur3=usd&acct4=VRW1160&token4=a1-yUqdjiIN0t6ICRc4eIMHDr1i6uKSV&cur3=usd
```

## Authorisation process

The query parameters within the redirect URL represent the user's accounts and associated session tokens.

1. To convert these query parameters into an array, follow this approach:

   ```json
   const user_accounts = [
     {
       currency: 'usd',
       token: 'a1-Yxh5gJS8m406Jopon5JlvKNRsxLMC',
       account: 'CRW1157'
     },
     {
       account: 'VRW1160',
       token: 'a1-yUqdjiIN0t6ICRc4eIMHDr1i6uKSV',
       currency: 'usd',
     },
     {
       account: 'cr799393',
       token: 'a1-f7pnteezo4jzhpxclctizt27hyeot',
       currency: 'usd',
     },
     {
       account: 'vrtc1859315',
       token: 'a1clwe3vfuuus5kraceykdsoqm4snfq',
       currency: 'usd',
     },
   ];
   ```

   Call the <a href="https://legacy-api.deriv.com/api-explorer#authorize" target="_blank" rel="noopener noreferrer">authorize API</a> using the session token linked to the selected user's account to grant authorization.

   ```json
   {
     "authorize": "a1-Yxh5gJS8m406Jopon5JlvKNRsxLMC"
   }

   ```

   The response to the authorize call is an object as follows:

   ```json
   {
     "account_list": [
       {
         "account_category": "wallet",
         "account_type": "doughflow",
         "broker": "CRW",
         "created_at": 1753955451,
         "currency": "USD",
         "currency_type": "fiat",
         "is_disabled": 0,
         "is_virtual": 0,
         "landing_company_name": "svg",
         "linked_to": [],
         "loginid": "CRW1157"
       },
       {
         "account_category": "wallet",
         "account_type": "virtual",
         "broker": "VRW",
         "created_at": 1753955451,
         "currency": "USD",
         "currency_type": "fiat",
         "is_disabled": 0,
         "is_virtual": 1,
         "landing_company_name": "virtual",
         "linked_to": [],
         "loginid": "VRW1160"
       },
       {
         "account_type": "trading",
         "created_at": 1647509550,
         "currency": "USD",
         "is_disabled": 0,
         "is_virtual": 0,
         "landing_company_name": "svg",
         "loginid": "CR799393",
         "trading": {}
       },
       {
         "account_type": "trading",
         "created_at": 1664132232,
         "currency": "USD",
         "is_disabled": 0,
         "is_virtual": 0,
         "landing_company_name": "svg",
         "loginid": "VRTC1859315",
         "trading": {}
       },
     ],
     "balance": 0,
     "country": "aq",
     "currency": "USD",
     "email": "ss@deriv.com",
     "fullname": "Ms QA script ssRPPta",
     "is_virtual": 0,
     "landing_company_fullname": "Deriv (SVG) LLC",
     "landing_company_name": "svg",
     "linked_to": [],
     "local_currencies": {
       "AAD": {
         "fractional_digits": 2
       }
     },
     "loginid": "CRW1157",
     "preferred_language": "EN",
     "scopes": [
       "admin",
       "payments",
       "read",
       "trade",
       "trading_information"
     ],
     "upgradeable_landing_companies": [],
     "user_id": 464
   }
   ```

Now that the selected user is authorised, and you can use Deriv API calls on behalf of the account.