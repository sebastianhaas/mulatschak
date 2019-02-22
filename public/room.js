//#region globals
var socket = io('/room'); // io in namespace room
var params = {};

var svgNamespace = 'http://www.w3.org/2000/svg';
var svgXlink = 'http://www.w3.org/1999/xlink';

var roomId;
var cards, playedCards, trumpGroup;
var trickCallButtons = new Map();
var actualPlayer;
var playedCardsX = 35;

//#endregion globals

//#region window
$(window).ready(function () {
    cards = document.getElementById('cards');
    playedCards = document.getElementById('played-cards');
    trumpGroup = document.getElementById('trump-group');

    // register some click listeners
    registerClickListeners();

    //readyBtn.onclick = setReadyBtn;
    if (location.search) {
        var parts = location.search.substring(1).split('&');

        for (var i = 0; i < parts.length; i++) {
            var nv = parts[i].split('=');
            if (!nv[0]) continue;
            params[nv[0]] = decodeURIComponent(nv[1]) || true;
        }
    }

    roomId = params.id;

    // client sends room and username in which he wants to join
    socket.emit('join-room', JSON.stringify({
        roomId: params.id,
        username: params.username
    }));

    socket.on('update-player-list', function (data) {
        updatePlayerList(data);
    });

    socket.on('update-points', function (room) {
        updatePoints(room);
    });

    socket.on('room-data', function (data) {
        updateRoomData(data);
    });

    socket.on('start-round', function (player) {
        actualPlayer = player;
        startRound();
    });

    socket.on('show-trick-modal', function (player) {
        actualPlayer = player;
        showTrickCallModal();
    });

    socket.on('choose-trump', function (player) {
        actualPlayer = player;
        showChooseTrumpModal();
    });

    socket.on('disable-trick-button', function (value) {
        // disable all buttons till value (except 0 - NONE and 1 - NOT AVAILABLE)
        for (let key = 2; key < value; key++) {
            let buttonToDisable = trickCallButtons.get(key.toString());
            document.getElementById(buttonToDisable).disabled = true;
        }

        // disable button of last call, or 0 - NONE button, if player is last caller and nobody has called a trick 
        let buttonToDisable = trickCallButtons.get(value.toString());
        document.getElementById(buttonToDisable).disabled = true;
    });

    socket.on('enable-trick-button', () => {
        for (var value of trickCallButtons.values()) {
            document.getElementById(value).disabled = false;
        }
    });

    socket.on('update-cards', function (player) {
        actualPlayer = player;
        handoutCards();
    });

    socket.on('update-played-cards', function (card) {
        updatePlayedCards(card);
    });

    socket.on('display-trump', function (trump) {
        displayTrump(trump);
    });

    socket.on('player-trick-calls', function (players) {
        updatePlayerTrickCalls(players);
    });

    socket.on('game-over', () => {
        $('#end-view').fadeIn();
    });

});

$(window).on('beforeunload', function () {
    return confirm('Do you really want to close?');
});

$(window).on('unload', function () {
    // disconnect with roomId 
    if (actualPlayer) {
        socket.emit('force-disconnect', params.id);
    }

});
//#endregion window

//#region room functions
function updatePlayerList(room) {
    var players = room.players;
    var actualTurnNo = room.turnNo;

    var html = '';
    var thClass = '';

    // player names are table headers
    players.forEach(player => {
        if (player.ready) {
            if (player.order === (actualTurnNo) && player.order !== 0) {
                thClass = 'class="bg-danger"';
            } else {
                thClass = '';
            }
            html += '<th ' + thClass + '>' + player.name + '</th>';
        }
    });
    $('#player-names').html(html);
}

function updatePoints(room) {

    var playerPoints = $('#player-points');

    // players points are table data
    var html = playerPoints.html();
    html += '<tr>';
    room.players.forEach(player => {
        html += '<td>' + player.points + '</td>';
    });
    html += '</tr>';
    playerPoints.html(html);

}

function updateRoomData(room) {

    document.title = room.id + ': ' + room.name; 
    $('#room-h1').html(room.name);

}

function registerClickListeners() {

    // trick calls
    let trickCallBtn2 = document.getElementById('trick-call-btn2');
    trickCallButtons.set(trickCallBtn2.value, trickCallBtn2.id);
    trickCallBtn2.onclick = setTrickCall;

    let trickCallBtn3 = document.getElementById('trick-call-btn3');
    trickCallButtons.set(trickCallBtn3.value, trickCallBtn3.id);
    trickCallBtn3.onclick = setTrickCall;

    let trickCallBtn4 = document.getElementById('trick-call-btn4');
    trickCallButtons.set(trickCallBtn4.value, trickCallBtn4.id);
    trickCallBtn4.onclick = setTrickCall;

    let trickCallBtn5 = document.getElementById('trick-call-btn5');
    trickCallButtons.set(trickCallBtn5.value, trickCallBtn5.id);
    trickCallBtn5.onclick = setTrickCall;

    let trickCallBtnMulatschak = document.getElementById('trick-call-btnMulatschak');
    trickCallButtons.set(trickCallBtnMulatschak.value, trickCallBtnMulatschak.id);
    trickCallBtnMulatschak.onclick = setTrickCall;

    let trickCallBtnNone = document.getElementById('trick-call-btnNone');
    trickCallButtons.set(trickCallBtnNone.value, trickCallBtnNone.id);
    trickCallBtnNone.onclick = setTrickCall;

    // trump choosing
    document.getElementById('choose-trump-color_herz').onclick = setTrump;
    document.getElementById('choose-trump-color_eichel').onclick = setTrump;
    document.getElementById('choose-trump-color_pik').onclick = setTrump;
    document.getElementById('choose-trump-color_schelle').onclick = setTrump;

    $('#start-view').click(function () {
        socket.emit('set-ready', params.id);
        $(this).fadeOut();
    });

    $('#end-view').click(function () {
        socket.emit('set-ready', params.id);
        $(this).fadeOut();
    });

}

function updatePlayerTrickCalls(players) {
    var playerTrickCalls = $('#player-trick-calls');

    // players trick call in round
    var html = '';
    if (players) {

        players.forEach(player => {
            if (player.trickCall != 0) {
                html += '<td>' + player.trickCalls + '/' + player.trickCall + '</td>';
            } else {
                html += '<td>' + player.trickCalls + '</td>';
            }
        });
    }
    playerTrickCalls.html(html);
}

//#endregion room functions

//#region player functions

function startRound() {
    handoutCards();

    if (actualPlayer.order === 1) {
        showTrickCallModal();
    }
}

function handoutCards() {

    // clean cards before handout
    while (cards.firstChild) {
        cards.removeChild(cards.firstChild);
    }

    var hand = actualPlayer.hand;
    var x = 22;
    hand.forEach(playersCard => {
        var card = document.createElementNS(svgNamespace, 'use');
        card.setAttribute('class', 'card');
        card.setAttribute('id', playersCard.id);
        card.setAttribute('x', '' + x + '%');
        card.setAttribute('y', '70%');
        card.setAttributeNS(svgXlink, 'href', '#' + playersCard.id);
        card.addEventListener('click', playCard);
        cards.appendChild(card);
        x += 11.5;
    });
}

function updatePlayedCards(playedCard) {

    if (playedCard) {
        var card = document.createElementNS(svgNamespace, 'use');
        card.setAttribute('id', playedCard.id);
        card.setAttribute('x', '' + playedCardsX + '%');
        card.setAttribute('y', '30%');
        card.setAttributeNS(svgXlink, 'href', '#' + playedCard.id);
        playedCards.appendChild(card);
        playedCardsX += 5;
    } else {
        // remove played cards, new round has started
        while (playedCards.firstChild) {
            playedCards.removeChild(playedCards.firstChild);
        }
        playedCardsX = 40;
        return;
    }
}

function displayTrump(trumpId) {

    while (trumpGroup.firstChild) {
        trumpGroup.removeChild(trumpGroup.firstChild);
    }
    if (trumpId) {
        var trump = document.createElementNS(svgNamespace, 'use');
        trump.setAttribute('id', trumpId);
        trump.setAttribute('x', '10%');
        trump.setAttribute('y', '80%');
        trump.setAttributeNS(svgXlink, 'href', '#color_' + trumpId);
        trumpGroup.appendChild(trump);
    }
}

function showTrickCallModal() {
    $('#trick-calls').modal('show');
}

function showChooseTrumpModal() {
    $('#choose-trump').modal('show');
}

var setTrickCall = function () {
    if (actualPlayer) {
        actualPlayer.trickCall = this.value;
        socket.emit('set-trick-call', actualPlayer);
        $('#trick-calls').modal('hide');
    }
};

var setTrump = function () {
    var trump = this.alt;
    var data = JSON.stringify({
        roomId: roomId,
        trump: trump
    });

    socket.emit('set-trump', data);
    $('#choose-trump').modal('hide');
};

var playCard = function () {
    socket.emit('play-card', JSON.stringify({
        actualPlayer: actualPlayer,
        playedCard: this.id
    }));
};

//#endregion player functions