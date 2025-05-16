import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import dotenv from "dotenv";
dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const anthropic = new Anthropic({apiKey: ANTHROPIC_API_KEY})

const mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" })
let transport;
let tools;

async function connectToServer(serverScriptPath) {
  try {
    console.log("calling mcp server connection from mcp client")
    const isJs = serverScriptPath.endsWith(".js");
    const isPy = serverScriptPath.endsWith(".py");
    if (!isJs && !isPy) {
      throw new Error("Server script must be a .js or .py file");
    }
    const command = isPy
      ? process.platform === "win32"
        ? "python"
        : "python3"
      : process.execPath;

    transport = new StdioClientTransport({
      command,
      args: [serverScriptPath],
    });
    mcp.connect(transport);

    const toolsResult = await mcp.listTools();
    tools = toolsResult.tools.map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
    console.log(
      "Connected to server with tools:",
      tools.map(({ name }) => name)
    );
  } catch (e) {
    console.log("Failed to connect to MCP server: ", e);
    cleanup()
    throw e;
  }
}

async function processQuery(query) {
  const messages = [
    {
      role: "user",
      content: query,
    },
  ];

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1000,
    messages,
    tools: tools,
  });

  const finalText = [];
  const toolResults = [];

  for (const content of response.content) {
    if (content.type === "text") {
      finalText.push(content.text);
    } else if (content.type === "tool_use") {
      const toolName = content.name;
      const toolArgs = content.input;

      const result = await mcp.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      toolResults.push(result);
      finalText.push(
        `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
      );

      messages.push({
        role: "user",
        content: result.content,
      });

      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages,
      });

      finalText.push(
        response.content[0].type === "text" ? response.content[0].text : ""
      );
    }
  }

  return finalText.join("\n");
}

async function chatLoop(voiceCommand) {
  const command = voiceCommand + "/n I need you to use available tools to start a call with the name specified. This name will be the parameter for tool calls - start-call and get-email-of-sender-and-recipient. The call itself will be started by my app. You don't need to worry about which meeting platform to use or how to start the call. Just get that meeting link which you will receive in the start-call tool call. And send that meeting link to the user specified via gmail. The email ids for sender and recipient can be fetched from api as well with the keyword - name and keyword - me. You have all the necessary tools to finish the request. Finally, confirm that the invitation has been sent.";
  try {
    console.log("\nMCP Client Started!");

    while (true) {
      if (command.toLowerCase() === "quit") {
        break;
      }
      const response = await processQuery(command);
      console.log("\n" + response);
    }
  }catch(e){
    console.error(e)
    cleanup()
  }
}

async function cleanup() {
  await mcp.close();
}


export {connectToServer, chatLoop, cleanup }
