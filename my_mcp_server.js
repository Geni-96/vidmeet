// MCP Server Implementation (CommonJS)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { contacts } from "./test-emails.js";
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
  io.emit("start_call")
  const link = `https://localhost:8181?offererUserName`;
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
        return false;
      }
    }
  } catch (err) {
    console.error("Error inviting the user:", err);
    return false;
  }
}

// Register the start_call tool
server.tool("start_call", async (params) => {
  // Extract user from params if needed
  const user = params?.user || "the recipient";
  
  const res = await getMeetingLink();
  if (!res) {
    return {
      content: [
        {
          type: "text",
          text: `There's an error starting your meeting`,
        },
      ],
    };
  } else {
    return {
      content: [
        {
          type: "text",
          text: `Successfully started a meeting to join the meeting with ${user}`,
        },
      ],
    };
  }
});

// Register the invite tool with proper parameter handling
server.tool("invite", async (params) => {
  // Extract user from params object
  const user = params?.user;
  
  if (!user) {
    return {
      content: [
        {
          type: "text",
          text: "No user specified for invitation",
        },
      ],
    };
  }
  
  const res = await sendInvite(user);
  if (!res) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to invite ${user}. User may not be found in contacts.`,
        },
      ],
    };
  } else {
    return {
      content: [
        {
          type: "text",
          text: `Successfully invited ${user} to join the meeting`,
        },
      ],
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport)
  .then(() => console.log("MCP Server started successfully"))
  .catch(err => console.error("Failed to start MCP Server:", err));