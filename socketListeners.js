//Answerer side
const createCallBtn = document.querySelector('#call')
const answerSection = document.querySelector('#answerSection')
const answerBtn = document.querySelector('#answer-button')
const cancelBtn = document.querySelector('#cancelBtn')
const submitBtn = document.querySelector('#submitBtn')
answerBtn.addEventListener('click',()=>{
    createCallBtn.classList.add('hidden');
    answerBtn.classList.add('hidden');
    answerSection.classList.remove('hidden');
})

cancelBtn.addEventListener('click', () => {
    // Hide the input field and cancel button, and show Join Call and Answer buttons again
    answerSection.classList.add('hidden');
    createCallBtn.classList.remove('hidden');
    answerBtn.classList.remove('hidden');
    });

document.getElementById('submitBtn').addEventListener('click', async() => {
    // console.log('submit button clicked')
const offererUsername = document.getElementById('offererUsername').value;
// console.log(offererUsername,'offerer username')
if (offererUsername) {
    socket.emit('newAnswerer', offererUsername)
} else {
    alert('Please enter the offerer\'s username.');
}
});

socket.on('availableOffer', (offerObj)=> {
    answerOffer(offerObj)
    console.log('calling answeroffer with the offer object',offerObj)
})

//someone just made a new offer and we're already here - call createOfferEls
socket.on('newOfferAwaiting',offer=>{
    // createOfferEls(offers)
    console.log('inside new offer awaiting')
    answerOffer(offer)
})

socket.on('answerResponse',offerObj=>{
    console.log(offerObj)
    addAnswer(offerObj)
})

socket.on('receivedIceCandidateFromServer',iceCandidate=>{
    addNewIceCandidate(iceCandidate)
    console.log(iceCandidate)
})

// function createOfferEls(offers){
//     //make green answer button for this new offer
//     const answerEl = document.querySelector('#answer');
//     offers.forEach(o=>{
//         console.log(o);
//         const newOfferEl = document.createElement('div');
//         newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`
//         newOfferEl.addEventListener('click',()=>answerOffer(o))
//         answerEl.appendChild(newOfferEl);
//     })
// }