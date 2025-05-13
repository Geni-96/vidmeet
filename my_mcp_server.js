
(async () => {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { contacts } = require("test-emails")
  const { authorize, listLabels, createDraft, sendDraft } = require("gmail_auth")
  const { call, userName } = require("scripts")


    let username = "me"
    // Create server instance
    const server = new McpServer({
    name: "contacts",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
    });

    async function getMeetingLink(){
        await call()
        const link = `${window.location.href}?offererUserName=${userName}`
        return link
    }

    //helper function to send automatic email invites
    //can be replaced by an api request to get contact information
    async function sendInvite(user){
        let found =  false
        let myEmail;
        let recipientEmail;
        let sender;
        try{
            for(let userObject in contacts){
                if (userObject.name===user){
                    found = true
                    recipientEmail=userObject.email
                }else if(userObject.name==="me"){
                    myEmail = userObject.email
                    sender = userObject.name
                }
            }
            if(!found){
                console.error("User's contact not found")
            }else{
                //send email to this user with the meeting link
                try{
                    //authenticate
                    await authorize().then(listLabels).catch(console.error);
                    //send invite
                    const subject = `${sender} is inviting you to join a meeting`
                    const draft = await createDraft(recipientEmail, subject, link)
                    const sendMail = await sendDraft(draft.id)
                    console.log(sendMail)
                    return true
                }catch(err){
                    console.error('Error sending email', err)
                }
            }
        }catch(err){
            console.error("error inviting the user:", err)
            return false
        }
    }

    server.tool("start_call", async()=>{
        const res = await getMeetingLink()
        if (!res) {
        return {
            content: [
            {
                type: "text",
                text: `There's an errro starting your meeting`,
            },
            ],
        };
        }
        else{
            return {
            content: [
                {
                    type: "text",
                    text: `Successfully started a meeting to join the meeting with ${user}`,
                },
                ],
            };
        }
    })


    server.tool("invite", async(user)=>{
        const res = await sendInvite(user)
        if (!res) {
        return {
            content: [
            {
                type: "text",
                text: `Failed to find the user.`,
            },
            ],
        };
        }
        else{
            return {
            content: [
                {
                    type: "text",
                    text: `Successfully invited ${user} to join the meeting`,
                },
                ],
            };
        }
    })

    async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Custom MCP Server running on stdio");
    }

    main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
    });
    
})();

