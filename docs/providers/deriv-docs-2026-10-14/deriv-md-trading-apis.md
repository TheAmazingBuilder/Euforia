---
updatedAt: 2026-03-02T06:30:21.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# Trading APIs

Trading APIs focus on trading and managing contracts.

They include functionalities for buying, selling, and updating contracts, as well as managing copy trading activities. The APIs also allow users to retrieve important trading information such as profit tables, portfolio details, and contract durations.

These APIs are essential for users who actively trade on the platform and need to manage their trading accounts effectively.

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
        <a href="https://legacy-api.deriv.com/api-explorer#buy" target="_blank" rel="noopener noreferrer">Buy Contract: Trade</a>
      </td>

      <td>
        Buys a contract.
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
        2
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#buy_contract_for_multiple_accounts" target="_blank" rel="noopener noreferrer">Buy Contract for Multiple Accounts</a>
      </td>

      <td>
        Buys a contract for multiple accounts specified by the `tokens` parameter. Note that although this is an authorized call, the contract is not purchased for the authorized account.
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
        3
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#cancel" target="_blank" rel="noopener noreferrer">Cancel a Contract</a>
      </td>

      <td>
        Cancels a contract using its contract ID.
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
        4
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#contract_update" target="_blank" rel="noopener noreferrer">Update Contract</a>
      </td>

      <td>
        Updates the conditions of a contract.
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
        5
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#contract_update_history" target="_blank" rel="noopener noreferrer">Update Contract History</a>
      </td>

      <td>
        Retrieves the update history of a contract.
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
        <a href="https://legacy-api.deriv.com/api-explorer#copy_start" target="_blank" rel="noopener noreferrer">Copy Trading: Start</a>
      </td>

      <td>
        Starts copy trader bets.
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
        7
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#copy_stop" target="_blank" rel="noopener noreferrer">Copy Trading: Stop</a>
      </td>

      <td>
        Stops copy trader bets.
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
        8
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#copytrading_list" target="_blank" rel="noopener noreferrer">Copy Trading: List</a>
      </td>

      <td>
        Retrieves a list of active copiers and/or traders involved in copy trading.
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
        9
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#copytrading_statistics" target="_blank" rel="noopener noreferrer">Copy Trading: Statistics</a>
      </td>

      <td>
        Retrieves performance, trading, risk, and copiers statistics for a trader.
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
        10
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#sell" target="_blank" rel="noopener noreferrer">Sell Contract</a>
      </td>

      <td>
        Sells a contract as identified from a previous `portfolio` call.
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
        11
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#sell_contract_for_multiple_accounts" target="_blank" rel="noopener noreferrer">Sell Contracts: Multiple Accounts</a>
      </td>

      <td>
        Sells contracts for multiple accounts simultaneously. Uses the shortcode response from `buy_contract_for_multiple_accounts` to identify the contract and authorization tokens to select which accounts to sell.
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
        12
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#sell_expired" target="_blank" rel="noopener noreferrer">Sell Expired Contracts</a>
      </td>

      <td>
        Attempts to sell any expired contracts and returns the number of sold contracts.
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
        13
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#set_account_currency" target="_blank" rel="noopener noreferrer">Set Account Currency</a>
      </td>

      <td>
        Sets the account's default currency for trading and deposits. The account currency can only be set once and cannot be changed.
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
        <a href="https://legacy-api.deriv.com/api-explorer#trading_durations" target="_blank" rel="noopener noreferrer">Trading Durations</a>
      </td>

      <td>
        Retrieves a list of available underlying contract types and trading duration boundaries. If the user is logged in, assets available only for their landing company will be returned.
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
        <a href="https://legacy-api.deriv.com/api-explorer#profit_table" target="_blank" rel="noopener noreferrer">Profit Table</a>
      </td>

      <td>
        Retrieves a summary of the account's profit table based on the specified search criteria.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read, Trading Information
      </td>
    </tr>

    <tr>
      <td>
        16
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#portfolio" target="_blank" rel="noopener noreferrer">Portfolio</a>
      </td>

      <td>
        Provides information about your current portfolio of outstanding options.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✘
      </td>

      <td>
        Read, Trading Information
      </td>
    </tr>
  </tbody>
</Table>