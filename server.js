import https from 'https';
import express from 'express';
import { createClient } from 'redis';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';
import { Server } from 'socket.io';
import { connectToServer, chatLoop, cleanup } from './my_mcp_client.js';
import contacts from "./test-emails.js";
// Required for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let username; 

dotenv.config();
const app = express()
app.use(express.static(__dirname));
app.use(express.json());

// SSL certs
const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

let sessionId = "Jjwjg6gouWLXhMGKW";
const client = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    }
 });

 //handle voice commands

app.post('/api/startCall', (req,res)=>{
    io.emit("start_call")
    res.json({ success: true, message: 'emitting start call event' });
})

app.get('/api/link',()=>{
    return {link: `https://localhost:8181${username}`};
})
app.post('/api/handle-command', async (req, res) => {
  const { command } = req.body;
    console.log('received voice command from frontend')
  try {
    await connectToServer('./my_mcp_server.js'); // Connect MCP client
    console.log("connected to mcp server")
    const result = await chatLoop(command); // Pass command to LLM

    res.json({ success: true, message: result });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, message: "LLM call failed" });
  }
});

app.get('/api/emails/:name', (req, res) => {
  const nameParam = req.params.name.toLowerCase();
  const contact = contacts.find(c => c.name.toLowerCase() === nameParam);

  if (contact) {
    res.json({ name: contact.name, email: contact.email });
  } else {
    res.status(404).json({ error: `Contact with name "${req.params.name}" not found.` });
  }
});

 client.on('error', err => console.log('Redis Client Error', err));
 
 
 (async () => {
    await client.connect();
    console.log('Connected to Redis');
 })();
 
//we changed our express setup so we can use https
//pass the key and cert to createServer on https
const expressServer = https.createServer({key, cert},app);
//create our socket.io server... it will listen to our express port
const io = new Server(expressServer,{
    cors: {
        origin: [
            "https://localhost",
            // 'https://LOCAL-DEV-IP-HERE' //if using a phone or another computer
        ],
        methods: ["GET", "POST"]
    }
});
expressServer.listen(8181, () => {
    console.log('Server is running on port 8181');
});


//offers will contain {}
let offers = [
    // offererUserName
    // offer
    // offerIceCandidates
    // answererUserName
    // answer
    // answererIceCandidates
];

let offerer;

io.on('connection',async(socket)=>{
    console.log("Someone has connected", socket.id);
    const userName = socket.handshake.auth.userName;
    username = userName
    await client.set('username', userName)
    console.log('adding sockets data to redis')
    await client.hSet(`sockets:${userName}`, 'socketId', socket.id);

    //a new client has joined. If there are any offers available, emit them out
    socket.on('newOffer',async (newOffer)=>{
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        })
        console.log(newOffer.type)
        //send out to all connected sockets EXCEPT the caller
        const result = await client.json.set(`offer:${userName}`, '$', {
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        });
        console.log('Document stored:', result)
                
        socket.broadcast.emit('newOfferAwaiting',offers.slice(-1))
    })

    socket.on('newAnswerer', async(offererUserName, callback)=>{
        try{
            offerer = offererUserName
            callback('Received your message');
            const availableOffer = await client.json.get(`offer:${offererUserName}`)
            console.log('emiting avaialbe offers with timeout')
            socket.emit('availableOffer', availableOffer)
        }
        catch(err){
            console.error('Error emiting avialble offers',err)
        }
    })
    socket.on('newAnswer',async(offerObj,ackFunction)=>{
        // console.log(offerObj, 'offer obj on new answer');
        //emit this answer (offerObj) back to CLIENT1
        //in order to do that, we need CLIENT1's socketid
        
        const socketToAnswer = await client.HGET(`sockets:${offerObj.offererUserName}`,'socketId')
        if(!socketToAnswer){
            console.log("No matching socket")
            return;
        }
        
        
        //send back to the answerer all the iceCandidates we have already collected
        ackFunction(offerObj.offerIceCandidates);
        const res = await client.json.set(`offer:${offerObj.offererUserName}`, '$.answer', offerObj.answer);
        await client.json.set(`offer:${offerObj.offererUserName}`, '$.answererUserName', offerObj.answererUserName);
        console.log('adding answer, answerer username to redis', res)
        //socket has a .to() which allows emiting to a "room"
        //every socket has it's own room
        const offerToUpdate = await client.json.get(`offer:${offerObj.offererUserName}`)
        if(!offerToUpdate){
            console.log("No OfferToUpdate")
            return;
        }
        socket.to(socketToAnswer).emit('answerResponse',offerToUpdate)
    })

    socket.on('sendIceCandidateToSignalingServer',async(iceCandidateObj)=>{
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        if(didIOffer){
            const offer = await client.json.get(`offer:${userName}`)
            if(offer){
                await client.json.arrAppend(`offer:${userName}`, '$.offerIceCandidates', iceCandidate);
                if (offer.answererUserName){
                    const socketToSendTo = await client.hGet(`sockets:${offer.answererUserName}`, 'socketId');
                    if(socketToSendTo){
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
                    }
                }
            }
            
        }else{
            const socketToSendTo = await client.HGET(`sockets:${offerer}`, 'socketId');
            if(socketToSendTo){
                console.log('emiting ice candidates to offerer')
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
            }else{
                console.log("Ice candidate recieved but could not find offerer")
            }
        }
        // console.log(offers)
    })
    socket.on('endCall', async (userName) => {
        socket.broadcast.emit('endCall', userName);
        try {
            if (userName === offerer) {
                await client.json.del(`offer:${offerer}`);
                await client.del(`sockets:${offerer}`);
            } else {
                await client.del(`sockets:${userName}`);
            }
        } catch (error) {
            console.error('Error in endCall:', error);
        }
    });
    
    //processing audio chunks
    socket.on("audioChunks", async(audioChunk)=>{
        const formData = new FormData();
        // console.log('received audio chunk from frontend')
        formData.append('index', Date.now()); // Example timestamp
        formData.append('clientSecret', process.env.OZWELL_SECRET)
        formData.append('type','audio/webm;codecs=opus')
        formData.append('sessionId', sessionId);
        formData.append('data', audioChunk) //audio chunk received here is an array buffer.
        try{
            const response = await axios.post(
            'https://wreiske-ai.dev.bluehive.com/api/consume-audio',
            formData,
            {
            timeout: 60000,
            timeoutErrorMessage: '60 second timeout sending audio chunk to Bluehive AI, check your internet connection and try again.',
            headers: {
                'x-bluehive-authorization': 'FBoYfOkX35nT1Uv3XAinrIPbYGBzZGYQPQc2BUjC8lY',
                ...formData.getHeaders()
                },
            })
            console.log(response.data);
            sessionId = response.data.sessionId;
        }catch(err){
            console.error('Error sending audio chunks to ozwell', err)
        }
    })
})

