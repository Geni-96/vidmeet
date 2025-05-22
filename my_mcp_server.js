// MCP Server Implementation (CommonJS)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authorize, listLabels, createDraft, sendDraft } from "./gmail_auth.js";
// Start the server
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"

const app = express();
app.use(express.json());

// Map to store transports by session IDcan you start a call using #start-call and then once you have the meeting link from this tool call, use the tool #get-email-of-sender-and-recipient to get emails of "Jenny" and "me" to send automatic email using tool #send-email-invite with "Jenny" as recepient and "me" as sender?
const transports= {};
let server;

const emailApiBaseUrl = 'https://localhost:8181/api';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Clean shutdown
function cleanupAndExit() {
  console.log("🧹 Cleaning up MCP server...");
  try {
    server?.disconnect?.(); // graceful shutdown if supported
  } catch (e) {
    console.error("Error during server cleanup:", e);
  }
  process.exit(1);
}

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      }
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    server = new McpServer({
      name: "geni-mcp-server",
      version: "1.0.0"
    });

    // Register the start_call tool
    server.tool(
      "start-call-and-send-email-invite",
      "Starts a meeting and sends an email invite",
      {
        name: {
            type: "string",
            description: "The full name of the contact whose email address you need to retrieve.",
        },
      },
      async ({name}) => {
        console.log("Starting a call with", name);
        try {
          if (!name) {
            return {
              content: [
                {
                  type: "text",
                  text: "Please provide a name to start a call.",
                },
              ],
            };
          }
    
          // Start the meeting
          const response = await fetch(`${emailApiBaseUrl}/startCall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'starting your meeting' }),
          });
          
          const result = await response.json();
          if (!result) {
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to initiate a call.",
                },
              ],
            };
          }
    
          // Get meeting link
          const linkResponse = await fetch(`${emailApiBaseUrl}/link`, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
          });
    
          const {link} = await linkResponse.json();
          if (!link) {
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to create your meeting link.",
                },
              ],
            };
          }
    
          // Get recipient and sender emails
          const recipientEmail = await fetch(`${emailApiBaseUrl}/emails/${encodeURIComponent(name)}`);
          const senderEmail = await fetch(`${emailApiBaseUrl}/emails/${encodeURIComponent('me')}`);
          
          if (!recipientEmail.ok || !senderEmail.ok) {
            const errorData = await recipientEmail.json();
            return {
              content: [
                {
                  type: "text",
                  text: `Error fetching contact emails: ${errorData.error || recipientEmail.statusText}`,
                },
              ],
            };
          }
    
          const recipient = await recipientEmail.json();
          const sender = await senderEmail.json();
          
          if (!recipient?.email || !sender?.email) {
            return {
              content: [
                {
                  type: "text",
                  text: `Could not retrieve email for ${name}. Please check the contact name.`,
                },
              ],
            };
          } 
    
          // Create and send email invitation
          const auth = await authorize(); // Authorize Gmail
          
          const draft = await createDraft(auth,
            recipient.email,
            sender.email,
            "Invitation to join a meeting",
            link,
          );
          
          console.log("draft created successfully", draft);
          
          const sendResult = await sendDraft(auth, draft.id);
          console.log("send result for the draft", sendResult);
          
          if (!sendResult?.id) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error sending email invitation: ${sendResult.error || sendResult.statusText}`,
                },
              ],
            };
          }
    
          // SUCCESS - Return confirmation
          return {
            content: [
              {
                type: "text",
                text: `Successfully started meeting with ${name} and sent email invitation to ${recipient.email}. Meeting link: ${link}`,
              },
            ],
          };
    
        } catch (error) {
          console.error("Error initiating your call:", error);
          return {
            content: [
              {
                type: "text",
                text: `Failed to start meeting with ${name} and send invitation. Error: ${error.message}`,
              },
            ],
          };
        }
      }
    );


    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.listen(3000, () => {
  console.log("✅ MCP server listening on port 3000");
});

app.use((err, req, res, next) => {
  console.error("❌ Express error:", err.stack);
  res.status(500).send('Server Error');
});

// try{
//   const auth = await authorize(); // Authorize Gmail
// console.log(auth, "gmail auth")
// const draft = await createDraft(auth,
//   "gnaneswari.lolugu@gmail.com",
//   "chinni.gnanam@gmail.com",
//   "blah blah blah",
//   "This is a test email body",
// );
// console.log("draft created successfully", draft)
// const sendResult = await sendDraft(auth, draft.id);
// console.log("send result for the draft", sendResult)
// }catch(error){
//   console.error(error)
// }