const express = require("express");
const app = express();
const socketio = require('socket.io');
const ioc = require("socket.io-client");
const http = require('http');

function waitFor(socket, event) {
    return new Promise((resolve) => {
        socket.once(event, resolve);
    });
}

describe("my awesome project", () => {
    let io, serverSocket, clientSocket, httpServer;
    const port = 8181; // Use a fixed port

    beforeAll((done) => {
        httpServer = http.createServer(app);
        io = socketio(httpServer);
        httpServer.listen(port, () => { // Listen on the fixed port
            clientSocket = ioc(`http://localhost:${port}`);
            io.on("connection", (socket) => {
                serverSocket = socket;
            });
            clientSocket.on("connect", done);
        });
    });

    afterAll(() => {
        io.close();
        clientSocket.disconnect();
        httpServer.close();
    });

    test("should work", (done) => {
        clientSocket.on("hello", (arg) => {
            expect(arg).toBe("world");
            done();
        });
        serverSocket.emit("hello", "world");
    });

    test("should work with an acknowledgement", (done) => {
        serverSocket.on("hi", (cb) => {
            cb("hola");
        });
        clientSocket.emit("hi", (arg) => {
            expect(arg).toBe("hola");
            done();
        });
    });

    test("should work with emitWithAck()", async () => {
        serverSocket.on("foo", (cb) => {
            cb("bar");
        });
        const result = await clientSocket.emitWithAck("foo");
        expect(result).toBe("bar");
    });

    test("should work with waitFor()", (done) => {
        clientSocket.emit("baz");

        waitFor(serverSocket, "baz").then(() => {
            done();
        });
    });
});

