// player class
class Player {

    constructor(id, roomId, name) {
        this.socketId = id;
        this.roomId = roomId;
        this.name = name;
        this.ready = false; // ready state before game
        this.hand = [];
        this.points = 20;
        this.order = 0;
        this.trickCall = 0; // predicted calls
        this.trickCalls = 0; // actual calls
    }

    removeCardFromHand(cardId) {
        this.hand = this.hand.filter(card => card.id !== cardId);
    }

    registerPoints(trump) {
        var actualTricks = this.trickCalls;
        var predictedTrick = this.trickCall;
        var multiplicator = 1;

        // if herz was trump, multiply everything by 2
        if (trump === 'herz') {
            multiplicator = 2;
        }

        // if predicted calls > actual calls -> + 10 points
        if (predictedTrick > actualTricks) {
            this.points += 10 * multiplicator;
        } else if (actualTricks === 0 && predictedTrick === 0) {
            this.points += 5 * multiplicator;
        } else {
            this.points -= actualTricks * multiplicator;
        }

        this.trickCall = 0;
        this.trickCalls = 0;
    }

    resetPlayer() {
        this.ready = false; // ready state before game
        this.hand = [];
        this.points = 20;
        this.order = 0;
        this.trickCall = 0; 
        this.trickCalls = 0;
    }
}

exports.Player = Player;