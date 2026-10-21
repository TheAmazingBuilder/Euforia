---
updatedAt: 2026-03-02T06:38:44.000Z
agentTools:
  projectIndex: https://doc-deriv.readme.io/llms.txt
---

# WebSockets

# General information

## Base endpoint

To connect to Deriv's WebSocket APIs, you'll need to use the following base endpoint:

> `wss://ws.derivws.com/websockets/v3?app_id={app_id}`

Make sure to replace `{app_id}` with the unique ID of the application you registered.

## Rate limits

The rate limits for API requests can change over time. To find out the current limit, you can make a <a href="https://legacy-api.deriv.com/api-explorer#website_status" target="_blank" rel="noopener noreferrer">server status</a> call and check the `api_call_limits` field. This ensures you always have the most up-to-date information.

## Session validity

Your WebSocket session will time out after **2 minutes** of inactivity. If there are no requests or responses during this time, the server will close the connection. To prevent this, send requests periodically to keep the connection alive.

For example, you can send a <a href="https://legacy-api.deriv.com/api-explorer#ping" target="_blank" rel="noopener noreferrer"><strong>ping</strong></a> request or another simple call like <a href="https://legacy-api.deriv.com/api-explorer#time" target="_blank" rel="noopener noreferrer"><strong>time</strong></a> at regular intervals.

# Create WebSocket

To get started with WebSockets, you must first create a new WebSocket instance. Here’s how you can do it:

## Create a WebSocket instance

Use the WebSocket constructor to create a new instance:

> 🚧 Warning:
>
> Make sure to replace <code>{'{app_id}'}</code> with the unique ID of the application you have registered. You can find it in the <a href="https://legacy-api.deriv.com/dashboard/" target="_blank" rel="noopener noreferrer"> Applications</a> tab.

```javascript
let socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id={app_id}');
```

> 📘 Important: Secure vs. Unsecured Connections
>
> **wss\://** establishes a secure WebSocket connection (encrypted and protected).\
> **ws\://** establishes an unsecured WebSocket connection (not encrypted).

### Events

WebSocket communication revolves around 4 key events. Understanding these key events will help you manage the connection effectively.

#### OnOpen

**What it does:** This event is triggered when the connection to the server is successfully established.\
**What to know:** Once this event fires, the WebSocket’s `readyState` property becomes `1` indicating the connection is open and ready for communication. The `readyState` can have several values. For more information, check out the <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState" target="_blank" rel="noopener noreferrer">MDN WebSocket readyState</a> documentation.

```javascript
socket.onopen = function (e) {
  console.log('[open] Connection established');
  console.log('Sending to server');
  const sendMessage = JSON.stringify({ ping: 1 });
  socket.send(sendMessage);
};
```

#### OnMessage

**What it does:** Fires whenever a message is received from the server.\
**Usage:** Use this event to capture and handle incoming data from the server.

```Text JavaScript
socket.onmessage = function (event) {
  console.log(`[message] Data received from server: ${event.data}`);
};
```

#### OnClose

**What it does:** Triggers when the WebSocket connection is closed by the client, server, or due to a connection failure.\
**Additional details:** If you close the connection using the `Close()` method, you can provide a code and message to explain the reason. The server will typically send back the same code and message.

```javascript JavaScript
socket.onclose = function (event) {
  if (event.wasClean) {
    console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
  } else {
    // e.g. server process killed or network down
    // event.code is usually 1006 in this case
    console.log('[close] Connection died');
  }
};
```

#### OnError

**What It does:** Triggers when an error occurs with the WebSocket connection.\
**Handling errors:** Use this event to detect and handle errors, ensuring your application can respond or retry as needed.

```javascript
socket.onerror = function (error) {
  console.log(`[error] ${error.message}`);
};
```

### Methods

Here’s a quick rundown of the essential methods you'll use with WebSockets:

#### Open

**How it works:** Call `Open()` to start the connection process with the server.\
**Non-blocking call:** After `OnOpen` is triggered, you can begin sending messages. The call doesn’t block your script, and you can continue executing other code while waiting for the connection.

#### Send

**Purpose:** The `Send` method transmits data to the server. It supports several data formats, including strings and byte arrays (`byte[]`).\
**Handling large messages:** For messages larger than 32,767 bytes, the WebSocket automatically splits them into fragments, managing the transmission of each part sequentially.

#### Close

**When to use:** Once you’ve finished all communication, call `Close()` to terminate the connection.\
**Graceful shutdown:** This ensures the connection closes properly, freeing up resources and signalling to the server that communication has ended. Once a WebSocket is closed, it cannot be reused; you’ll need to create a new instance for future connections.

> 🚧 You cannot reuse a closed WebSocket instance, you have to create and set up a new one.

```javascript
const app_id = 'app_id'; // Replace with your app_id.
const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`); // Create a new WebSocket connection using the app_id

// Event handler for when the WebSocket connection is opened
socket.onopen = function (e) {
  console.log('[open] Connection established'); // Log connection establishment
  console.log('Sending to server');

  const sendMessage = JSON.stringify({ ping: 1 }); // Create a ping message in JSON format
  socket.send(sendMessage); // Send the ping message to the server
};

// Event handler for when a message is received from the server
socket.onmessage = function (event) {
  console.log(`[message] Data received from server: ${event.data}`); // Log the message received from the server
};

// Event handler for when the WebSocket connection is closed
socket.onclose = function (event) {
  if (event.wasClean) {
    console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`); // Log clean close with code and reason
  } else {
    console.log('[close] Connection died'); // Log an abrupt close
  }
};

// Event handler for when an error occurs with the WebSocket connection
socket.onerror = function (error) {
  console.log(`[error] ${error.message}`); // Log the error that occurred
};

/*
Instructions to run this code:

1. Ensure Node.js is installed on your machine. You can download it from https://nodejs.org/.
2. Install the `ws` WebSocket library by running:
   npm install ws
3. Save this code to a file, e.g., `websocket_client.js`.
4. Open a terminal and navigate to the directory where you saved the file.
5. Run the code using the following command:
   node websocket_client.js

Ensure that the `app_id` in the URL is replaced with your own if needed.
*/
```
```python
import asyncio
import websockets
import json

async def connect_to_websocket():
    app_id = app_id  # Replace with your app_id
    uri = f"wss://ws.derivws.com/websockets/v3?app_id={app_id}"  # WebSocket URI with the app_id

    try:
        # Establish a connection to the WebSocket server
        async with websockets.connect(uri) as websocket:
            print("[open] Connection established")  # Connection opened
            print("Sending to server")

            # Prepare the message to send (ping message in JSON format)
            send_message = json.dumps({"ping": 1})
            await websocket.send(send_message)  # Send the ping message to the server

            # Wait for a response from the server
            response = await websocket.recv()
            print(f"[message] Data received from server: {response}")  # Log the server's response

    except websockets.ConnectionClosedError as e:
        # Handle the scenario where the connection is closed
        if e.code == 1000:
            print(f"[close] Connection closed cleanly, code={e.code} reason={e.reason}")  # Clean close
        else:
            print("[close] Connection died")  # Abrupt close, likely due to network or server issues

    except Exception as e:
        # Handle any other exceptions that may occur
        print(f"[error] {str(e)}")  # Log any errors that occur

# Run the WebSocket client
# asyncio.get_event_loop().run_until_complete() starts the coroutine connect_to_websocket()
asyncio.get_event_loop().run_until_complete(connect_to_websocket())

'''
Instructions to run this code:

1. Ensure Python 3 is installed on your machine. You can download it from https://www.python.org/.
2. Install the `websockets` library by running:
   pip install websockets
3. Save this code to a file, e.g., `websocket_client.py`.
4. Open a terminal and navigate to the directory where you saved the file.
5. Run the code using the following command:
   python websocket_client.py

Replace `app_id` with your own application ID if needed.
'''
```
```java
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;

public class WebSocketExample {

    public static void main(String[] args) {
        try {
            // Replace with your app_id.
            int app_id = app_id;
            String serverUri = "wss://ws.derivws.com/websockets/v3?app_id=" + app_id;

            // Initialize the WebSocket client
            WebSocketClient client = new WebSocketClient(new URI(serverUri)) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    System.out.println("[open] Connection established");
                    System.out.println("Sending to server");

                    // Create a ping message in JSON format
                    String sendMessage = "{\"ping\": 1}";
                    this.send(sendMessage); // Send the ping message to the server
                }

                @Override
                public void onMessage(String message) {
                    System.out.println("[message] Data received from server: " + message); // Log the received message
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    if (remote) {
                        System.out.println("[close] Connection closed by server, code=" + code + " reason=" + reason); // Remote close
                    } else {
                        System.out.println("[close] Connection closed by client, code=" + code + " reason=" + reason); // Client close
                    }
                }

                @Override
                public void onError(Exception ex) {
                    System.out.println("[error] " + ex.getMessage()); // Log any errors
                }
                
                @Override
                public void onMessage(ByteBuffer bytes) {
                    System.out.println("[message] ByteBuffer received from server"); // Handle binary message if necessary
                }
            };

            client.connect(); // Connect to the WebSocket server

        } catch (URISyntaxException e) {
            System.out.println("[error] Invalid URI: " + e.getMessage());
        }
    }
}

/*
Instructions to run this code:

1. Add the Java-WebSocket library to your project. You can do this by:
   - Using Maven: Add the following dependency to your `pom.xml`:
     <dependency>
         <groupId>org.java-websocket</groupId>
         <artifactId>Java-WebSocket</artifactId>
         <version>1.5.2</version>
     </dependency>
   - Using Gradle: Add the following to your `build.gradle`:
     implementation 'org.java-websocket:Java-WebSocket:1.5.2'

2. Save this code to a file, e.g., `WebSocketExample.java`.

3. Compile the program:
   javac WebSocketExample.java

4. Run the program:
   java WebSocketExample

Make sure to replace `app_id` with your actual application ID if needed.
*/
```
```perl
#!/usr/bin/env perl
use strict;
use warnings;
use AnyEvent;
use AnyEvent::WebSocket::Client 0.12;
use JSON;
use feature 'say';

# WebSocket URL and app_id
my $app_id = app_id; //Replace with your app_id
my $url = "wss://ws.derivws.com/websockets/v3?app_id=$app_id";

# Create WebSocket client and connection
my $client = AnyEvent::WebSocket::Client->new;
$| = 1;  # Flush output immediately for real-time logging



# Establish WebSocket connection
$client->connect($url)->cb(sub {
    my $connection = eval { shift->recv };
    if (!$connection) {
        # handle error...
        warn $@;
        return;

    }
    say "WebSocket connection established.";


    $connection->send('{ ping => 1 }');
    say "Ping sent to keep connection alive.";
    # $connection->send(encode_json({ ping => 1 }));
    # say "Ping sent to keep connection alive.";
    # $connection->send(encode_json({ ping => 1 }));
    # say "Ping sent to keep connection alive.";


    # Handle incoming messages
    $connection->on(each_message => sub {
        my($connection, $message) = @_;

        say "message received";
    });

    # Handle connection close
    $connection->on(finish => sub {
        say "WebSocket connection closed.";
    });
});

# Start the AnyEvent event loop
AnyEvent->condvar->recv;

# Instructions to run the code on a local machine:
# 1. Ensure you have Perl installed on your machine.
# 2. Install the necessary Perl modules using the following commands:
#      cpanm AnyEvent AnyEvent::WebSocket::Client JSON
#    If `cpanm` is not installed, install it using `cpan App::cpanminus`.
# 3. Save this script to a file, e.g., `connect.pl`.
# 4. Run the script using the command:
#      perl connect.pl
# This script will connect to the Deriv WebSocket API, subscribe to a proposal, and send a ping every 30 seconds to keep the connection alive.
```
```php
<?php

// Include Composer's autoload file
require 'vendor/autoload.php';

use WebSocket\Client;

// Replace with your specific app ID
$app_id = app_id;
$uri = "wss://ws.derivws.com/websockets/v3?app_id=$app_id";

// Create a new WebSocket client
$client = new Client($uri);

try {
    echo "[open] Connection established\n";
    echo "Sending to server\n";

    // Send a ping message
    $client->send(json_encode(["ping" => 1]));
    echo "[debug] Message sent: {\"ping\":1}\n";

    // Receive a response from the server
    $response = $client->receive();
    echo "[message] Received from WebSocket: '$response'\n";

    // Close the connection
    $client->close();
    echo "[close] Connection closed\n";

} catch (\WebSocket\ConnectionException $e) {
    echo "[error] Connection error: " . $e->getMessage() . "\n";
} catch (Exception $e) {
    echo "[error] General error: " . $e->getMessage() . "\n";
}

/*
Instructions to run this code:

1. Ensure PHP is installed on your machine. You can check by running `php -v` in your terminal.
2. Install Composer, the dependency manager for PHP, from https://getcomposer.org/.
3. Initialize a Composer project in the directory where this file is saved:
composer init
4. Install the `textalk/websocket` package by adding it to your `composer.json` file or by running:
composer require textalk/websocket
5. Save the PHP code above to a file, e.g., `websocket_client.php`.
6. Run the code in the terminal:
php websocket_client.php
Note: Replace the `app_id` in the URL with your own application ID if needed.
*/
```
```rust
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message;
use futures_util::{SinkExt, StreamExt};
use tokio;
use url::Url;

#[tokio::main]
async fn main() {
    let app_id = app_id;//Replace with your app_id
    let url = format!("wss://ws.derivws.com/websockets/v3?app_id={}", app_id);
    let url = Url::parse(&url).expect("Invalid URL");

    // Connect to the WebSocket server
    let (mut socket, _response) = connect_async(url).await.expect("Failed to connect");

    println!("[open] Connection established");

    // Prepare the ping message
    let send_message = r#"{"ping": 1}"#;
    socket.send(Message::Text(send_message.into())).await.expect("Failed to send message");

    println!("Message sent to server");

    // Receive a message from the server
    if let Some(Ok(msg)) = socket.next().await {
        println!("[message] Data received from server: {:?}", msg);
    }

    // Close the connection
    socket.close(None).await.expect("Failed to close connection");
    println!("[close] Connection closed cleanly");
}

/*
Instructions to run this code:

1. Ensure that Rust and Cargo (Rust's package manager) are installed. You can install them from https://rustup.rs/.
2. Initialize a new Rust project if you haven’t already:
cargo new websocket_client
cd websocket_client
3. Add the following dependencies to your `Cargo.toml` file under `[dependencies]`:
tokio = { version = “1”, features = [“full”] }
tokio-tungstenite = “0.15”
futures-util = “0.3”
url = “2.2”
4. Replace the contents of `src/main.rs` with the code above.
5. Compile and run the code using:
cargo run
Note: Replace `app_id` in the URL with your own application ID if needed.
*/
```
```swift
import Foundation

// Make webSocketTask a global variable to keep the connection open
var webSocketTask: URLSessionWebSocketTask?

// Function to create and handle WebSocket connection
func connectWebSocket() {
    let appID = app_id // Replace with your app_id.
    let url = URL(string: "wss://ws.derivws.com/websockets/v3?app_id=\(appID)")! // WebSocket URL with the app_id
    let request = URLRequest(url: url)
    
    // Initialize webSocketTask with URLSession
    webSocketTask = URLSession.shared.webSocketTask(with: request)
    
    // Start the WebSocket connection
    webSocketTask?.resume()
    print("[open] Connection established")
    
    // Function to send a ping message to the server
    func sendPingMessage() {
        let message = URLSessionWebSocketTask.Message.string("{\"ping\": 1}") // Prepare the ping message in JSON format
        webSocketTask?.send(message) { error in
            if let error = error {
                print("[error] Failed to send message: \(error.localizedDescription)")
            } else {
                print("Sending to server")
            }
        }
    }
    
    // Send the ping message initially
    sendPingMessage()

    // Function to receive messages from the server
    func receiveMessage() {
        webSocketTask?.receive { result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    print("[message] Data received from server: \(text)")
                case .data(let data):
                    print("[message] Data received from server: \(data)")
                @unknown default:
                    print("[message] Received unknown message type")
                }

                // Continue to receive messages
                receiveMessage()

            case .failure(let error):
                print("[error] Failed to receive message: \(error.localizedDescription)")
            }
        }
    }

    // Start receiving messages
    receiveMessage()
}

// Function to close the WebSocket connection
func closeWebSocketConnection() {
    // Use this function when you need to close the connection
    webSocketTask?.cancel(with: .normalClosure, reason: nil)
    print("[close] Connection closed cleanly")
}

// Call the function to connect to the WebSocket
connectWebSocket()

// Example usage: Call closeWebSocketConnection() to close the connection when needed
// The following line will close the connection after 10 seconds for demonstration purposes
DispatchQueue.main.asyncAfter(deadline: .now() + 10) { closeWebSocketConnection() }

// Keep the program running to wait for messages
RunLoop.main.run()

/*
Instructions to run this code:

1. Ensure that Xcode is installed on your macOS system, or if you're using another platform, ensure Swift is set up correctly.
2. Create a new Swift file in Xcode or any text editor, and paste the above code into it.
3. In Xcode:
   - Go to `File` -> `New` -> `Project`, and select a macOS Command Line Tool.
   - In the project, create a new Swift file and paste this code.
4. Run the project in Xcode to execute the WebSocket client.
5. Alternatively, save the code to a file named `websocket_client.swift` and run it from the terminal using:
swift websocket_client.swift
Note: Replace `app_id` in the WebSocket URL with your own application ID if needed.
*/
```
```c
#include <libwebsockets.h>
#include <string.h>
#include <signal.h>

// Set up WebSocket context and connection details
static struct lws_context *context;
static int interrupted = 0, port = 443, ssl_connection = LCCSCF_USE_SSL;
static const char *server_address = "ws.derivws.com";
static const char *path = "/websockets/v3?app_id=app_id";//replace with your app_id
static const char *pro = "lws-minimal-client";

// Signal handler for graceful shutdown
static void sigint_handler(int sig) {
    interrupted = 1;
}

// Callback function for WebSocket events
static int callback_minimal(struct lws *wsi, enum lws_callback_reasons reason,
                            void *user, void *in, size_t len) {
    switch (reason) {
    case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
        lwsl_err("CLIENT_CONNECTION_ERROR: %s\n", in ? (char *)in : "(null)");
        interrupted = 1;
        break;

    case LWS_CALLBACK_CLIENT_ESTABLISHED:
        lwsl_user("Connection established\n");
        lws_callback_on_writable(wsi); // Request writable callback
        break;

    case LWS_CALLBACK_CLIENT_WRITEABLE: {
        const char *ping_msg = "{\"ping\": 1}";
        unsigned char buf[LWS_PRE + 20];
        memcpy(&buf[LWS_PRE], ping_msg, strlen(ping_msg));
        lws_write(wsi, &buf[LWS_PRE], strlen(ping_msg), LWS_WRITE_TEXT);
        break;
    }

    case LWS_CALLBACK_CLIENT_RECEIVE:
        lwsl_hexdump_notice(in, len); // Log received message
        break;

    case LWS_CALLBACK_CLIENT_CLOSED:
        lwsl_user("Connection closed\n");
        interrupted = 1;
        break;

    default:
        break;
    }

    return 0;
}

// Define supported protocols for the WebSocket
static const struct lws_protocols protocols[] = {
    { "lws-minimal-client", callback_minimal, 0, 0, 0, NULL, 0 },
    LWS_PROTOCOL_LIST_TERM
};

// Main function to set up and manage the WebSocket client
int main(int argc, const char **argv) {
    struct lws_context_creation_info info;
    struct lws_client_connect_info i;

    // Handle Ctrl+C interrupt for graceful shutdown
    signal(SIGINT, sigint_handler);
    memset(&info, 0, sizeof info);
    memset(&i, 0, sizeof(i));

    lwsl_user("LWS Deriv ws client\n");

    info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
    info.port = CONTEXT_PORT_NO_LISTEN;
    info.protocols = protocols;
    info.fd_limit_per_thread = 1 + 1 + 1;

    context = lws_create_context(&info);
    if (!context) {
        lwsl_err("lws init failed\n");
        return 1;
    }

    i.context = context;
    i.port = port;
    i.address = server_address;
    i.path = path;
    i.host = i.address;
    i.origin = i.address;
    i.ssl_connection = ssl_connection;
    i.protocol = pro;
    i.local_protocol_name = "lws-minimal-client";

    if (!lws_client_connect_via_info(&i)) {
        lwsl_err("Failed to initiate connection\n");
        return 1;
    }

    // Run the WebSocket client event loop
    while (!interrupted)
        lws_service(context, 0);

    lws_context_destroy(context);
    lwsl_user("Completed\n");

    return 0;
}

/*
 * Instructions:
 * 1. Install the libwebsockets library on your system if it's not already installed.
 *    - On Ubuntu, you can install it by running:
 *        sudo apt-get install libwebsockets-dev
 *    - On macOS, you can use Homebrew:
 *        brew install libwebsockets
 *    - For other operating systems, refer to the libwebsockets documentation for installation details.
 * 2. Compile the code using the following command:
 *      gcc -o connect connect.c -lwebsockets -lssl -lcrypto -lm
 *    - This command links the required libraries: `libwebsockets`, `ssl`, `crypto`, and `m`.
 * 3. Run the compiled executable:
 *      ./connect
 * 4. Ensure you have internet connectivity as the WebSocket will attempt to connect to `ws.derivws.com`.
 * 5. Replace "app_id=1089" in the `path` variable with your actual app_id if required.
 */
```
```csharp
using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

class WebSocketExample
{
    public static async Task Main(string[] args)
    {
        string app_id = "app_id"; // Replace with your app_id.
        string uri = $"wss://ws.derivws.com/websockets/v3?app_id={app_id}"; // WebSocket URI with the app_id

        using (ClientWebSocket webSocket = new ClientWebSocket())
        {
            try
            {
                // Connect to the WebSocket server
                await webSocket.ConnectAsync(new Uri(uri), CancellationToken.None);
                Console.WriteLine("[open] Connection established");

                // Send a ping message to the server
                string sendMessage = "{\"ping\": 1}"; // Prepare the ping message in JSON format
                ArraySegment<byte> bytesToSend = new ArraySegment<byte>(Encoding.UTF8.GetBytes(sendMessage));
                await webSocket.SendAsync(bytesToSend, WebSocketMessageType.Text, true, CancellationToken.None);
                Console.WriteLine("Sending to server");

                // Receive message from the server
                var buffer = new byte[1024];
                WebSocketReceiveResult result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                string response = Encoding.UTF8.GetString(buffer, 0, result.Count);
                Console.WriteLine("[message] Data received from server: " + response);

                // Close the WebSocket connection cleanly
                await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Close connection", CancellationToken.None);
                Console.WriteLine("[close] Connection closed cleanly");
            }
            catch (WebSocketException e)
            {
                Console.WriteLine("[error] WebSocket error: " + e.Message);
            }
            catch (Exception e)
            {
                Console.WriteLine("[error] " + e.Message);
            }
        }
    }
}

/*
 * Instructions:
 * 1. Ensure you have the .NET SDK installed on your machine. You can download it from https://dotnet.microsoft.com/download.
 * 2. Save this code in a file, e.g., WebSocketExample.cs.
 * 3. Open a terminal and navigate to the directory where you saved the file.
 * 4. Create a new .NET console project and add the required WebSocket package:
 *      dotnet new console -o WebSocketExampleApp
 *      mv WebSocketExample.cs WebSocketExampleApp/WebSocketExample.cs
 *      cd WebSocketExampleApp
 *      dotnet add package System.Net.WebSockets.Client --version 4.5.3
 * 5. Run the application with:
 *      dotnet run
 *
 * Note: Replace "app_id=1089" in the URL with your actual app_id if necessary.
 */
```
```go
package main

import (
    "fmt"
    "log"
    "net/url"
    "os"
    "os/signal"
    "time"

    "github.com/gorilla/websocket"
)

func main() {
    // Define the WebSocket server URL
    appID := "app_id" // Replace with your app_id.
    serverURL := url.URL{Scheme: "wss", Host: "ws.derivws.com", Path: "/websockets/v3", RawQuery: "app_id=" + appID}
    fmt.Printf("Connecting to %s\n", serverURL.String())

    // Connect to the WebSocket server
    c, _, err := websocket.DefaultDialer.Dial(serverURL.String(), nil)
    if err != nil {
        log.Fatal("Dial error:", err)
    }
    defer c.Close()

    done := make(chan struct{})

    // Goroutine to handle receiving messages from the server
    go func() {
        defer close(done)
        for {
            _, message, err := c.ReadMessage()
            if err != nil {
                log.Println("Read error:", err)
                return
            }
            fmt.Printf("[message] Data received from server: %s\n", message)
        }
    }()

    // Send a ping message to the server
    pingMessage := `{"ping": 1}` // Prepare the ping message in JSON format
    err = c.WriteMessage(websocket.TextMessage, []byte(pingMessage))
    if err != nil {
        log.Println("Write error:", err)
        return
    }
    fmt.Println("Sending to server")

    // Set up signal handling to gracefully close the connection
    interrupt := make(chan os.Signal, 1)
    signal.Notify(interrupt, os.Interrupt)

    // Loop to handle connection closure or interruptions
    for {
        select {
        case <-done:
            return
        case <-interrupt:
            fmt.Println("[close] Interrupt signal received. Closing connection.")
            // Close the WebSocket connection gracefully
            err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
            if err != nil {
                log.Println("Write close error:", err)
                return
            }
            select {
            case <-done:
            case <-time.After(time.Second):
            }
            return
        }
    }
}

/*
Instructions:
1. Ensure you have Go installed on your machine. You can download it from https://golang.org/dl/.
2. Install the Gorilla WebSocket package by running:
       go get github.com/gorilla/websocket
3. Save this code to a file, e.g., websocket_client.go.
4. Open a terminal, navigate to the directory where you saved the file, and run:
       go run websocket_client.go

Note: Replace "app_id=1089" in the URL with your actual app_id if necessary.
*/
```

By understanding these events and methods, you can efficiently handle WebSocket connections in your application.

WebSockets provide a robust solution for real-time communication, allowing you to maintain smooth, responsive and dynamic applications.

> ℹ️ References
>
> <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebSocket" target="_blank" rel="noopener noreferrer">WebSocket APIs - MDN</a>