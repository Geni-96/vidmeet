const userName = Math.floor(Math.random() * 100000)
let isAudioMuted = false
let isVideoOn = true
console.log(userName,'username')
let mediaRecorderLocal;
let mediaRecorderRemote;
//if trying it on a phone, use this instead...
// const socket = io.connect('https://LOCAL-DEV-IP-HERE:8181/',{
const socket = io.connect('https://localhost:8181/',{
    auth: {
        userName
    }
})

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');
const clipboardEle = document.querySelector('#clipboard')

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;

let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

//when a client initiates a call
const call = async e=>{
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //create offer time!
    try{
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        if(offer){
            peerConnection.setLocalDescription(offer);
            didIOffer = true;
            socket.emit('newOffer',offer)

            document.querySelector('#call').classList.add('hidden')
            document.querySelector('#answer-button').classList.add('hidden')
            
            clipboardEle.classList.remove('hidden')
            clipboardEle.addEventListener('click',async()=>{
                try{
                    const defaultMessage = document.getElementById("default-message");
                    const successMessage = document.getElementById("success-message");
                    const windowObject = window.location.href
                    await navigator.clipboard.writeText(`${windowObject}?offererUserName=${userName}`);
                    // show the success message
                    defaultMessage.classList.add("hidden");
                    successMessage.classList.remove("hidden");

                    // Optionally, reset the success message after a few seconds (for example, 2 seconds)
                    setTimeout(function() {
                        defaultMessage.classList.remove("hidden");
                        successMessage.classList.add("hidden");
                    }, 2000);
                    
                }catch(err){
                    console.log('an error occured',err)
                    alert(`Failed to copy meeting link. You can still join using this ID:${userName}`)
                }
            });
        }
    }catch(err){
        console.error(err)
    }
}

const answerOffer = async(offerObj)=>{
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
    console.log(offerObj)
    console.log(answer)
    // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
    //add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer 
    offerObj.answererUserName = userName
    //emit the answer to the signaling server, so it can emit to CLIENT1
    //expect a response from the server with the already existing ICE candidates
    const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj)
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log(offerIceCandidates)
}

const addAnswer = async(offerObj)=>{
    //addAnswer is called in socketListeners when an answerResponse is emitted.
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote
    document.getElementById('remote-icon').classList.add("hidden");
    document.getElementById('videocam-icon').classList.remove("hidden")
    document.getElementById('microphone-icon').classList.remove("hidden")
    document.getElementById("hangup").classList.remove("hidden")
    clipboardEle.classList.add("hidden")
    await peerConnection.setRemoteDescription(offerObj.answer)
    // console.log(peerConnection.signalingState)
}

const fetchUserMedia = ()=>{
    return new Promise(async(resolve, reject)=>{
        try{
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googNoiseReduction: true,
                    volume: 1.0,
                    },
            });
            document.getElementById('local-icon').classList.add("hidden");
            localVideoEl.srcObject = stream;
            localStream = stream;  
              
            resolve();    
        }catch(err){
            console.log(err);
            reject()
        }
    })
}

const createPeerConnection = (offerObj)=>{
    return new Promise(async(resolve, reject)=>{
        //RTCPeerConnection is the thing that creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            //add localtracks so that they can be sent once the connection is established
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            // console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            // console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track,remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
            //this won't be set when called from call();
            //will be set when we call from answerOffer()
            console.log('setting remote description') //should be stable because no setDesc has been run yet
            document.getElementById('remote-icon').classList.add("hidden");
            document.getElementById("hangup").classList.remove("hidden")
            document.getElementById('videocam-icon').classList.remove("hidden")
            document.getElementById('microphone-icon').classList.remove("hidden")
            document.getElementById('answer-button').classList.add("hidden")
            document.getElementById("loading-overlay").classList.add("hidden")
            document.getElementById("main-content").classList.remove("blur-xl") 
            await peerConnection.setRemoteDescription(offerObj.offer)
            const audioOnlyStream = new MediaStream(localStream.getAudioTracks());
            mediaRecorderLocal = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm' });
            try{
                mediaRecorderLocal.start(5000); // Start recording with 5-second chunks
                console.log("recording audio")
                mediaRecorderLocal.ondataavailable = (event) => {
                    const audioChunk = event.data; // Blob object containing the audio data
                    // Process the audioChunk (e.g., send to server)
                    console.log('Received audio chunk:', audioChunk);
                    socket.emit("audioChunks",audioChunk)
                };
            }catch(err){
                console.error('failed to start audio recorder',err)
            }
            
            console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
        }
        resolve();
    })
}

const addNewIceCandidate = iceCandidate=>{
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
    
}


document.querySelector('#call').addEventListener('click',call)
//mute functionality
const micImage = document.getElementById("mic-image")
const vidImage = document.getElementById("vid-image")
document.getElementById('microphone-icon').addEventListener('click',async()=>{
    isAudioMuted = !isAudioMuted
    if (isAudioMuted) {
        localStream.getAudioTracks()[0].enabled = false;
        micImage.src = "./icons/mute-24.png"
        console.log("Audio muted.");
      }
    else {
        localStream.getAudioTracks()[0].enabled=true
        micImage.src = "./icons/mic-24.png"
        console.log("Audio unmuted.");
      }
})
document.getElementById('videocam-icon').addEventListener('click',async()=>{
    isVideoOn = !isVideoOn
    if (isVideoOn) {
        localStream.getVideoTracks()[0].enabled=true
        vidImage.src="./icons/video-24.png"
        console.log("Video on.");
      }
    else {
        localStream.getVideoTracks()[0].enabled=false
        vidImage.src="./icons/no-video-24.png"
        console.log("Video off.");
      }
})

document.getElementById('hangup').addEventListener('click',()=>{
    socket.emit('endCall',userName)
    cleanupCall()
})

socket.on('endCall', (userName) => {
    console.log(`${userName} ended the call.`);
    cleanupCall();
});

// Shared cleanup function
function cleanupCall() {
    // Stop local media
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Clear video elements
    localVideoEl.srcObject = null;
    remoteVideoEl.srcObject = null;

    document.getElementById("main-content").classList.add('hidden')
    document.getElementById("thankyou").classList.remove('hidden')
    // Optionally update UI (show "Call ended", buttons, etc.)
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        mediaRecorder.stop()
    }
    
}


modules.export = {call, userName}