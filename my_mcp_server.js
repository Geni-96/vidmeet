// MCP Server Implementation (CommonJS)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { authorize, listLabels, createDraft, sendDraft } from "./gmail_auth.js";
const emailApiBaseUrl = 'https://localhost:8181/api';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Create server instance
const server = new McpServer({
  name: "contacts",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
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
        method: 'POST', // Or PUT, depending on your API
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'starting your meeting' }), // Example data
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
      const {link} = await fetch(`${emailApiBaseUrl}/link`, {
        method: 'GET',
        headers: {'Content-Type': 'application/json'}
      })
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
        content: [
          {
            type: "text",
            text: `Started your meeting with ${name}. Here is your meeting link: ${link}`,
          },
        ],
      }
    } catch(error){
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
    sender: {
      type: "string",
      description: "The mailId from which the email should be sent",
    },
    recipients: {
      type: "array",
      items: { type: "string", format: "email" },
      description: "An array of recipient email addresses",
    },
    subject: {
      type: "string",
      description: "The subject line of the email invitation",
    },
    body: {
      type: "string",
      description: "The meeting link received from the api in the earlier tool call"
    }
  },
  async ({ sender, recipients, subject, body }) => {
    try {
      const auth = await authorize(); // Authorize Gmail

      const draft = await createDraft(auth, {
        to: recipients.join(', '),
        from: sender,
        subject: subject,
        body: body,
      });

      const sendResult = await sendDraft(auth, draft.id);

      if (sendResult?.id) {
        return {
          content: [
            {
              type: "text",
              text: `Email invitation sent successfully to ${recipients.join(', ')}.`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to send email invitation to ${recipients.join(', ')}.`,
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

// Handle crashes and exits
process.on('SIGINT', () => {
  console.log("🛑 Caught SIGINT");
  cleanupAndExit();
});

process.on('SIGTERM', () => {
  console.log("🛑 Caught SIGTERM");
  cleanupAndExit();
});

process.on('uncaughtException', (err) => {
  console.error("💥 Uncaught exception:", err);
  cleanupAndExit();
});

process.on('unhandledRejection', (reason) => {
  console.error("💥 Unhandled rejection:", reason);
  cleanupAndExit();
});


// Start the server
const transport = new StdioServerTransport();
server.connect(transport)
  .then(() => console.log("MCP Server started successfully"))
  .catch(err => {
    cleanupAndExit()
    console.error("Failed to start MCP Server:", err)
  });