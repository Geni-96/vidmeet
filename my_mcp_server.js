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
    server.tool("start-call", 
      "Start a meeting with a given user",
      {
        name: { type: "string", description: "The name or identifier of the person to be invited to meeting" },
      },
      async ({name}) => {
        try{
          const response = await fetch(`${emailApiBaseUrl}/startCall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'starting your meeting' }),
          });
          
          const result = await response.json();
          if(!result){
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to initiate a call.",
                },
              ],
            };
          }


          const linkResponse = await fetch(`${emailApiBaseUrl}/link`, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
          });

          
          const {link} = await linkResponse.json();
          if(!link){
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to create your meeting link.",
                },
              ],
            };
          }

          return {
            meetingLink: link,
            content: [
              {
                type: "text",
                text: `Started your meeting with ${name}. Here is your meeting link: ${link}`,
              },
            ],
          }
        } catch(error){
          if (error.name === 'AbortError') {
            return {
              content: [
                {
                  type: "text",
                  text: `Request timed out while trying to start meeting with ${name}.`,
                },
              ],
            };
          }
          console.error("Error initiating your call:", error);
          return {
            content: [
              {
                type: "text",
                text: `Failed to start meet with ${name}. Error: ${error.message}`,
              },
            ],
          };
        }
    });

    server.tool(
      "get-email-of-sender-and-recipient",
      "Get's the contact emails for the sender and recipient from api",
      {
        name: { type: "string", description: "The name or identifier of the person to be invited to meeting" },
      },
      async ({name='Jenny'}) => {
        try {
          const response = await fetch(`${emailApiBaseUrl}/emails/${encodeURIComponent(name)}`);
          const result = await fetch(`${emailApiBaseUrl}/emails/${encodeURIComponent('me')}`);
          if (!response.ok || ! result.ok) {
            const errorData = await response.json();
            return {
              content: [
                {
                  type: "text",
                  text: `Error fetching contact emails: ${errorData.error || response.statusText}`,
                },
              ],
            };
          }

          const contactData = await response.json();
          const sender = await result.json()
          if (contactData?.email && sender.email) {
            return {
              to: contactData.email,
              from: sender.email,
              content: [
                {
                  type: "text",
                  text: `The email for ${contactData.name} is: ${contactData.email}. The sender email is ${sender.email}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `Could not retrieve emails.`,
                },
              ],
            };
          }
        } catch (error) {
          console.error("Error fetching contact email:", error);
          return {
            content: [
              {
                type: "text",
                text: `Failed to fetch contact email: ${error.message}`,
              },
            ],
          };
        }
      }
    );


    server.tool(
      "send-email-invite",
      "Send an email invitation for a meeting",
      {
        to: {
          type: "string",
          description: "The mailId to which the email should be sent - retreived from previous tool call.",
        },
        from: {
          type: "string",
          description: "The mailId from which email should be sent - retreived from previous tool call.",
        },
        subject: {
          type: "string",
          description: "The subject line of the email invitation - a generic subject line",
        },
        body: {
          type: "string",
          description: "The meeting link received from the api in the earlier tool call - retreived from first tool call.",
        }
      },
      async ({ to, from, subject, body }) => {
        try {
          const auth = await authorize(); // Authorize Gmail
          console.log('gmail auth', auth, "to", to, 'from',from, 'subject', subject, 'body', body)
          function validateEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
          }

          if (!validateEmail(to)) {
            throw new Error(`Invalid recipient address: ${to}`);
          }
          const draft = await createDraft(auth,
            to,
            from,
            subject,
            body,
          );
          console.log("draft created successfully", draft)
          const sendResult = await sendDraft(auth, draft.id);
          console.log("send result for the draft", sendResult)
          if (sendResult?.id) {
            return {
              content: [
                {
                  type: "text",
                  text: `Email invitation sent successfully to ${to}.`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to send email invitation to ${to}.`,
                },
              ],
            };
          }
        } catch (error) {
          console.error("Error sending email invitation:", error);
          return {
            content: [
              {
                type: "text",
                text: `Failed to send email invitation: ${error.message}`,
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