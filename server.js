const https = require('https')
const express = require('express');
const app = express();
const socketio = require('socket.io');
const redis = require('redis');
app.use(express.static(__dirname))
const fs = require('fs');
require('dotenv').config();
const meteorRandom = require('meteor-random');
// let sessionId = meteorRandom.id(); // Generate a unique session ID
let sessionId = 'Jjwjg6gouWLXhMGKW' //static session ID for testing
const axios = require('axios');
const FormData = require('form-data');


const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');
const client = redis.createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
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
const io = socketio(expressServer,{
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
    let index = 0;
    let isProcessing = false;
    const uniqueId = Math.random().toString(36).substring(2, 15)+Math.random().toString(36).substring(2, 15)
    socket.on("audioChunks", async(audioChunk)=>{
        console.log("Received audio chunk");
        // Only handle Buffer (socket.io will send as Buffer from Node.js client, or as {type: 'Buffer', data: ...} from some clients)
        let buf;
        if (Buffer.isBuffer(audioChunk)) {
            buf = audioChunk;
        } else if (audioChunk && audioChunk.type === 'Buffer' && Array.isArray(audioChunk.data)) {
            buf = Buffer.from(audioChunk.data);
        } else {
            console.log("Unknown audioChunk type, skipping.");
            return;
        }
        if (buf.length === 0) {
            console.log("Skipping empty audio chunk.");
            return;
        }
        if (isProcessing) {
            console.log("Still processing previous chunk, skipping this one.");
            return;
        }

        isProcessing = true;
        const formData = new FormData();
        formData.append('index', index );
        formData.append('type','audio/webm;codecs=opus')
        formData.append('sessionId', sessionId);
        formData.append('audioId', uniqueId)
        formData.append('data', buf, `chunk-${index}`);
        console.log(index, sessionId, uniqueId, buf, formData.getHeaders())
        try{
            console.log('sending audio chunk to Bluehive AI', formData)
            const response = await axios.post(
            'https://ai.bluehive.com/api/consume-audio',
            formData,
            {
            headers: {
                'x-bluehive-authorization': 'FBoYfOkX35nT1Uv3XAinrIPbYGBzZGYQPQc2BUjC8lY',
                'Origin': 'https://localhost:8181',
                ...formData.getHeaders()
                },
            })
            console.log(response.data);
            index++;
        }catch(err){
            console.error('Error sending audio chunks to ozwell', err)
        }
        finally{
            isProcessing = false;
        }
    })
})