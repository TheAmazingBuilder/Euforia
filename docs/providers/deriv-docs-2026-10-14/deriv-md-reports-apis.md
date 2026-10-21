---
updatedAt: 2026-03-02T06:29:40.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# Reports APIs

Reports APIs are designed to monitor and report user account activity. They provide functionalities for retrieving reality check summaries, generating account statements, and subscribing to real-time transaction notifications.

These APIs are essential for ensuring regulatory compliance and giving clients up-to-date insights into their trading activities and account status.

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
        <a href="https://legacy-api.deriv.com/api-explorer#reality_check" target="_blank" rel="noopener noreferrer">Reality Check</a>
      </td>

      <td>
        Retrieves a summary of the client’s trades and account status for the Reality Check feature. <br /><br />This includes the time elapsed since the session began and the associated profit/loss.
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
        2
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#statement" target="_blank" rel="noopener noreferrer">Statement</a>
      </td>

      <td>
        Retrieves a summary of account transactions according to the specified search criteria.
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
        3
      </td>

      <td>
        <a href="https://legacy-api.deriv.com/api-explorer#transaction" target="_blank" rel="noopener noreferrer">Transactions Stream</a>
      </td>

      <td>
        Subscribes to real-time transaction notifications.
      </td>

      <td>
        ✔
      </td>

      <td>
        ✔
      </td>

      <td>
        Read, Trading Information
      </td>
    </tr>
  </tbody>
</Table>