## 📞 WebRTC Video Call App
A simple and scalable video calling application built using WebRTC, Socket.IO, Express, and Redis for real-time communication and session management.

https://github.com/user-attachments/assets/7d44de62-dcef-41e6-8eb8-1cadffa9703f


### 🚀 Features
- 🔗 Create and share call links
- 🔐 Join existing calls using a call ID
- 🧠 Multi-call support (handled via Redis)
- 🎙️ Mute/Unmute audio
- 📷 Start/Stop video
- 📴 Hang up to end call and clear session

### 🛠️ Tech Stack

- WebRTC – Real-time video/audio communication
- Socket.IO – Signaling and real-time messaging
- Express – Backend server
- Redis – Temporary session data storage for multiple call handling

### 🧰 Installation
- [git clone https://github.com/Geni-96/vidmeet.git](https://github.com/Geni-96/vidmeet.git)
- cd into the app
- npm install
- npm start

### 📷 Permissions

The app will request access to your camera and microphone. You can mute/unmute or stop/start these at any time during the call.

### ❌ Hanging Up

When a user ends the call:

- Media streams are stopped
- Redis session is cleaned up
- Camera and microphone access are released



