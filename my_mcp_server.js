// MCP Server Implementation (CommonJS)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import contacts from "./test-emails.js";
import { authorize, listLabels, createDraft, sendDraft } from "./gmail_auth.js";

// Create server instance
const server = new McpServer({
  name: "contacts",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Function to get meeting link
async function getMeetingLink() {
  console.log("sending meeting link to llm")
  const link = `https://localhost:8181?offererUserName=${username}`;
  return link;
}

// Helper function to send automatic email invites
async function sendInvite(user) {
  let found = false;
  let myEmail;
  let recipientEmail;
  let sender;
  let link;
  
  try {
    // Get meeting link first
    link = await getMeetingLink();
    
    // Search through contacts correctly
    for (const contactId in contacts) {
      const userObject = contacts[contactId];
      if (userObject.name === user) {
        found = true;
        recipientEmail = userObject.email;
      } else if (userObject.name === "me") {
        myEmail = userObject.email;
        sender = userObject.name;
      }
    }
    
    if (!found) {
      console.error("User's contact not found");
      return false;
    } else {
      // Send email to this user with the meeting link
      try {
        // Authenticate
        await authorize().then(listLabels).catch(console.error);
        
        // Send invite
        const subject = `${sender || 'Someone'} is inviting you to join a meeting`;
        const draft = await createDraft(recipientEmail, subject, link);
        const sendMail = await sendDraft(draft.id);
        console.log(sendMail);
        return true;
      } catch (err) {
        console.error('Error sending email', err);
        cleanupAndExit()
        return false;
      }
    }
  } catch (err) {
    console.error("Error inviting the user:", err);
    cleanupAndExit()
    return false;
  }
}


server.resource(
  "contact-emails", // A name for this resource type
  "emails://all",    // A URI to access all emails
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        json: contacts, // Serve the data as JSON
      },
    ],
  })
);

// Register the start_call tool
server.tool("start_call", 
  "Start a meeting with a given user",
  {
    name: { type: "string", description: "The name or identifier of the person to be invited to meeting" },
  },
  async ({name}) => {
    try{
      const response = await fetch('/api/startCall', {
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
      const link = await fetch('/api/username', {
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
  "get_contact_email",
  "Fetch the contact email for a given name",
  {
    name: { type: "string", description: "The name of the contact to retrieve the email for" },
  },
  async ({ name }, client) => {
    try {
      const response = await client.fetchResource(`emails://${name}`);
      if (response?.contents?.[0]?.json?.email) {
        return {
          content: [
            {
              type: "text",
              text: `The email for ${name} is: ${response.contents[0].json.email}`,
            },
          ],
        };
      } else if (response?.contents?.[0]?.text) {
        return {
          content: [
            {
              type: "text",
              text: response.contents[0].text,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Could not find contact information for ${name}.`,
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
            text: `Failed to fetch contact email for ${name}.`,
          },
        ],
      };
    }
  }
);


server.tool(
  "send_email_invite",
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
      description: "The body of the email invitation, including the meeting link",
    },
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