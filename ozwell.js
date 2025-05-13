const FormData = require('form-data');
const formData = new FormData();
const fs = require('node:fs/promises');

        // Add the necessary form fields based on your observation
        formData.append('index', Date.now()); // Example timestamp
        formData.append('sessionId', 'Jjwjg6gouWLXhMGKW'); // Replace with your actual session ID
        // formData.append('audioId', 'UNIQUE_AUDIO_ID'); // Generate a unique ID for the audio stream
        // formData.append('type', 'audio/webm;codecs=opus');

        // Append the audio chunk as a file. You might need to create a temporary file or use a buffer directly.
        // Using buffer directly with form-data:
        formData.append('data', audioChunk, {
            filename: `chunk-${Date.now()}`,
            contentType: 'audio/webm;codecs=opus'
        });

        const response = await axios.post(
            'https://ai.bluehive.com/api/consume-audio',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OZWELL_SECRET}`,
                    ...formData.getHeaders() // Important: Get the correct headers from FormData
                }
            }
        );

        console.log(response.data);
axios.post(
        'https://ai.bluehive.com/api/completion',
        {
            "prompt": "Hello, world!",
            "systemMessage": "You are a helpful chatbot named Will."
        },
        {
        headers: {
            'Authorization': `Bearer ${process.env.OZWELL_SECRET}`,
            'Content-Type': 'application/json',
        },
        // transformRequest: [(data) => data]
        }
    )
    .then(response => {
        console.log(response.data);
    })
    .catch(error => {
        console.error(error);
    });
console.log("adding 2nd request")
    axios.post(
        'https://ai.bluehive.com/api/consume-audio',
        {
            "prompt": "Hello, world!",
            "systemMessage": "You are a helpful chatbot named Will."
        },
        {
        headers: {
            'Authorization': `Bearer ${process.env.OZWELL_SECRET}`,
            'Content-Type': 'application/json',
        },
        // transformRequest: [(data) => data]
        }
    )
    .then(response => {
        console.log(response.data);
    })
    .catch(error => {
        console.error(error);
    });
console.log("adding 3rd request")
