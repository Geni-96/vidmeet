const https = require('https')
const express = require('express');
const app = express();
const socketio = require('socket.io');
const redis = require('redis');
app.use(express.static(__dirname))
const fs = require('fs');

const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');
const client = redis.createClient({
    username: 'default',
    password: 'h67EQ4nSQDV6pXiLWuITXK93jtRCQgza',
    socket: {
        host: 'redis-14254.c275.us-east-1-4.ec2.redns.redis-cloud.com',
        port: 14254
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
const offers = [
    // offererUserName
    // offer
    // offerIceCandidates
    // answererUserName
    // answer
    // answererIceCandidates
];
const connectedSockets = [
    //username, socketId
]

io.on('connection',async(socket)=>{
    console.log("Someone has connected");
    const userName = socket.handshake.auth.userName;

    connectedSockets.push({
        socketId: socket.id,
        userName
    })
    await client.set('username', userName)
    console.log('adding sockets data to redis')
    await client.hSet(`sockets:${userName}`, 'socketId', socket.id);
    // const sock = await client.hGetAll("connectedSockets")
    // console.log(sock)
    //a new client has joined. If there are any offers available,
    //emit them out
    if(offers.length){
        socket.emit('availableOffers',offers);
    }
    
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
        const result = await client.json.set(`${userName}`, '$', {
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        });
        console.log('Document stored:', result);
                
        socket.broadcast.emit('newOfferAwaiting',offers.slice(-1))
    })

    socket.on('newAnswer',(offerObj,ackFunction)=>{
        console.log(offerObj);
        //emit this answer (offerObj) back to CLIENT1
        //in order to do that, we need CLIENT1's socketid
        const socketToAnswer = connectedSockets.find(s=>s.userName === offerObj.offererUserName)
        if(!socketToAnswer){
            console.log("No matching socket")
            return;
        }
        //we found the matching socket, so we can emit to it!
        const socketIdToAnswer = socketToAnswer.socketId;
        //we find the offer to update so we can emit it
        const offerToUpdate = offers.find(o=>o.offererUserName === offerObj.offererUserName)
        if(!offerToUpdate){
            console.log("No OfferToUpdate")
            return;
        }
        //send back to the answerer all the iceCandidates we have already collected
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer
        offerToUpdate.answererUserName = userName
        //socket has a .to() which allows emiting to a "room"
        //every socket has it's own room
        socket.to(socketIdToAnswer).emit('answerResponse',offerToUpdate)
    })

    socket.on('sendIceCandidateToSignalingServer',async(iceCandidateObj)=>{
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        // console.log(iceCandidate);
        
        if(didIOffer){
            //this ice is coming from the offerer. Send to the answerer
            await client.json.arrAppend(`${userName}`, '$.offerIceCandidates', iceCandidate);
            console.log('ICE Candidate added to redis:', iceCandidate);
            const offerInOffers = offers.find(o=>o.offererUserName === iceUserName);
            if(offerInOffers){
                offerInOffers.offerIceCandidates.push(iceCandidate)
                // 1. When the answerer answers, all existing ice candidates are sent
                // 2. Any candidates that come in after the offer has been answered, will be passed through
                if(offerInOffers.answererUserName){
                    //pass it through to the other socket
                    const socketToSendTo = connectedSockets.find(s=>s.userName === offerInOffers.answererUserName);
                    if(socketToSendTo){
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
                    }else{
                        console.log("Ice candidate recieved but could not find answere")
                    }
                }
            }
        }else{
            //this ice is coming from the answerer. Send to the offerer
            //pass it through to the other socket
            const offerInOffers = offers.find(o=>o.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(s=>s.userName === offerInOffers.offererUserName);
            if(socketToSendTo){
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
            }else{
                console.log("Ice candidate recieved but could not find offerer")
            }
        }
        // console.log(offers)
    })

})