//#region initial setup
const port = process.env.PORT || 3000

var express = require('express');
var app = express();

// create a express app
app.use(express.static('public'));
var server = require('http').createServer(app).listen(port, function () {
    console.log('listening on port ' + 3000);
});

var io = require('socket.io').listen(server);

// two different namespaces, io var gets identified with underscore
var _lobby = io.of('/lobby');
var _room = io.of('/room');

//#endregion initial setup

//#region variables

let rooms = [];
let room = require('./Room');
let game = require('./Deck');

rooms.push(new room.Room(rooms.length, 'FIFA Beste Leben')); // demo data

//#endregion variables

//#region lobby socket
_lobby.on('connection', function (socket) {

    // send rooms to connected client
    unicastRoomList(socket, rooms);

    // add new room
    socket.on('add-room', function (data) {
        rooms.push(new room.Room(rooms.length, data));
        // broadcast room to all clients
        broadcastRoomList(rooms);
    });

});
//#endregion lobby socket

//#region room socket
_room.on('connection', function (socket) {

    // player joins specific room
    socket.on('join-room', function (playerData) {
        var roomId = JSON.parse(playerData).roomId;
        var username = JSON.parse(playerData).username;

        socketJoinsRoom(socket, roomId, username);

    });

    socket.on('disconnect', function () {
        // get room id of disconnected socked
        let roomId;
        rooms.forEach(room => {
            room.players.forEach(player => {
                if (player.socketId === socket.id) {
                    roomId = player.roomId;
                }
            });
        });
        // remove player
        if (roomId) {
            rooms[roomId].removePlayer(socket.id);

            broadcastRoomList(rooms);
            updateRoomPlayersList(rooms[roomId]);
        }
    });

    socket.on('force-disconnect', function (roomId) {

        rooms[roomId].removePlayer(socket.id);

        broadcastRoomList(rooms);
        updateRoomPlayersList(rooms[roomId]);

    });

    socket.on('set-ready', function (roomId) {
        // check if everyone is ready
        var everyoneReady = false;
        everyoneReady = rooms[roomId].setPlayerReady(socket.id);

        // updates player list in room
        updateRoomPlayersList(rooms[roomId]);

        if (everyoneReady) {
            // if everyone is ready, start round (shuffle deck, handout cards, ...);
            startRound(roomId);
        }
    });

    socket.on('set-trick-call', function (player) {
        let actualRoom = rooms[player.roomId];
        actualRoom.setTrickCall(player.socketId, Number(player.trickCall)); // otherwise trickCall would be string

        // if players trick call is not NONE - 0, disabled trick for all other players
        if (player.trickCall > 0) {
            _room.in(player.roomId).emit('disable-trick-button', player.trickCall);
            //socket.broadcast.emit('disable-trick-button', player.trickCall);
        }

        let nextPlayer = actualRoom.getNextPlayer(player.order);
        // give everyone the chance to set trick calls
        if (nextPlayer) {
            let nextSocket = _room.connected[nextPlayer.socketId];

            // if player is last player in order, check if anyone has called a trick, if not,
            // last player has to call a trick so disable 0 - NONE button
            if (nextPlayer.order === 4 && actualRoom.players.filter(x => x.trickCall > 0).length === 0) {
                nextSocket.emit('disable-trick-button', 0);
            }

            nextSocket.emit('show-trick-modal', nextPlayer);
        } else {
            // everyone sets their trick calls

            // now let player with highest trick call choose the trump
            let nextSocketId = actualRoom.getSocketIdWithHighestTrickCall();

            // broadcast trick calls
            broadcastTrickCalls(actualRoom);

            let nextSocket = _room.connected[nextSocketId];
            nextPlayer = actualRoom.getPlayer(nextSocketId);
            if (nextSocket) {
                actualRoom.turnNo = nextPlayer.order;
                nextSocket.emit('choose-trump', nextPlayer);
            }
        }
    });

    socket.on('set-trump', function (message) {
        // message contains roomId and trump
        var data = JSON.parse(message);
        let actualRoom = rooms[data.roomId];
        actualRoom.trump = data.trump;

        // weli gets trump as color
        actualRoom.setWeliAsTrump(data.trump);

        // increases trump cards rank with 10
        actualRoom.increaseTrumpRank(data.trump);

        // shows trump on table
        displayTrump(actualRoom);

    });

    socket.on('play-card', function (message) {
        var player = JSON.parse(message).actualPlayer;
        var cardId = JSON.parse(message).playedCard;
        var actualRoom = rooms[player.roomId];

        registerPlayedCard(socket, actualRoom, player, cardId);

    });

});

//#endregion room socket

//#region lobby helper functions

function unicastRoomList(socket, rooms) {
    if (rooms.length > 0) {
        socket.emit('update-room-list', rooms);
    }
}

function broadcastRoomList(rooms) {
    _lobby.emit('update-room-list', rooms);
}

//#endregion lobby helper functions


//#region room helper functions

function updateRoomPlayersList(room) {
    _room.in(room.id).emit('update-player-list', room);
}

function updatePlayersPointsList(room) {
    _room.in(room.id).emit('update-points', room);
}

function updateRoomHeaderData(room) {
    // send information about current room to client
    _room.in(room.id).emit('room-data', room);
}

function socketJoinsRoom(socket, roomId, username) {

    // join socket room
    socket.join(roomId);

    // add player and update room
    rooms[roomId].addPlayer(socket.id, roomId, username);

    updateRoomHeaderData(rooms[roomId]);

    // broadcast room (with updated players) to all clients in lobby
    broadcastRoomList(rooms);
}

function startRound(roomId) {
    let actualRoom = rooms[roomId];
    actualRoom.round++;
    actualRoom.deck = game.createDeck(); // creates and shuffles deck

    // everyone gets a random order number in first round
    if (actualRoom.round === 1) {
        actualRoom.setRandomOrder();
        actualRoom.players.sort(compareByOrder);
    }

    // activate trick call btn again
    enableTrickCallButtons(rooms[roomId]);

    updatePlayersPointsList(actualRoom);

    // hand out 5 cards to every player
    actualRoom.players.forEach(player => {
        let socket = _room.connected[player.socketId];
        player.hand = game.draw(actualRoom.deck, 5, player.hand); // player.hand
        if (socket) {
            // sending cards to every client in room
            socket.emit('start-round', player);
        }
    });

}

function registerPlayedCard(socket, actualRoom, actPlayer, cardId) {
    // return false if it is not players turn
    if (actualRoom.turnNo !== actPlayer.order) {
        return false;
    }

    let player = actualRoom.players.filter(player => player.socketId === actPlayer.socketId)[0];
    let validTurn = false;
    // extracts played cards from map in room
    let playedCardsInRound = Array.from(actualRoom.playedCards.values());
    let actualCard = player.hand.filter(card => card.id === cardId)[0];

    // first played card in round has to follow no rules
    if (playedCardsInRound.length >= 1) {
        // check if player played the right card
        // there are some rules about "follow the suite" and "follow the value" 
        validTurn = game.checkPlayedCardFromPlayer(playedCardsInRound, actualCard, player.hand, actualRoom.trump);
    }

    // register turn in player object
    if (validTurn || playedCardsInRound.length === 0) {
        actualRoom.playedCards.set(player, actualCard); // mapping between player and card
        actualRoom.setTurnNo(); // next players turn

        actualRoom.players.find(p => p.socketId === player.socketId).removeCardFromHand(cardId);

        // updates player list in room
        updateRoomPlayersList(rooms[player.roomId]);

        socket.emit('update-cards', actualRoom.players.find(p => p.socketId === player.socketId));
        updatePlayedCards(actualRoom.id, actualCard);
    }

    // when everybody played a card do the following
    // - register trick of player with highest card
    // - set turnNo to player with highest card
    if (actualRoom.playedCards.size === 4) {
        // increase trick calls of player
        let tmpPlayer = game.getPlayerIdxWithHighestCard(actualRoom.playedCards, actualRoom.trump);
        let player = actualRoom.players.find(p => p.socketId === tmpPlayer.socketId);
        if (player) {
            player.trickCalls++;

            // set order no
            actualRoom.turnNo = player.order;
            updateRoomPlayersList(actualRoom);

            // if hand is empty, register points and startNewRound
            if (player.hand.length === 0) {
                for (let i = 0; i < actualRoom.players.length; i++) {
                    actualRoom.players[i].registerPoints(actualRoom.trump);
                }

                broadcastTrickCalls(actualRoom);
                // delete playedCards map
                actualRoom.playedCards.clear();

                // clear played cards after 2 seconds
                setTimeout(() => {
                    updatePlayedCards(actualRoom.id, undefined);
                }, 1500);

                // someone reaches 0 or 100 points)
                if (actualRoom.isGameOver()) {
                    actualRoom.resetGameData();

                    // clear trump
                    displayTrump(actualRoom);
                    // clear trick calls
                    broadcastTrickCalls(actualRoom);

                    updatePlayersPointsList(actualRoom);

                    _room.in(actualRoom.id).emit('game-over');

                } else {
                    // start next round
                    startRound(actualRoom.id);
                }
            } else {
                // delete playedCards map
                actualRoom.playedCards.clear();
                broadcastTrickCalls(actualRoom);

                // clear played cards
                setTimeout(() => {
                    updatePlayedCards(actualRoom.id, undefined);
                }, 1500);
            }

        }
    }
}

function updatePlayedCards(roomId, actualCard) {
    _room.in(roomId).emit('update-played-cards', actualCard);
}

function enableTrickCallButtons(room) {
    _room.in(room.id).emit('enable-trick-button'); 
}

function displayTrump(room) {
    _room.in(room.id).emit('display-trump', room.trump);
}

function broadcastTrickCalls(room) {
    _room.in(room.id).emit('player-trick-calls', room.players);
}

function compareByOrder(player1, player2) {
    return player1.order - player2.order;
}

//#endregion room helper functions
