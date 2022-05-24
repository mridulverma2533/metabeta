const deck = require('../controllers/deck.controller');
const { io } = require('../bjApp');

class Game {
    constructor(roomName, cards, totalDecks, isPrivate, turnTime) {
        this.room = roomName;
        this.cards = cards;
        this.players = [];
        this.dealer = [];
        this.timeOut;
        this._turn = 0;
        this.current_turn = 0;
        this.totalDecks = totalDecks;
        this.turnTime = turnTime;
        this.isPrivate = isPrivate;
        this.isOnPlay = false;
        this.isDealing = false;
        this.dealerScore = 0;
        this.dealerAceCount = 0;
    }

    reset() {
        this.resetTimeOut();
        this._turn = 0;
        this.current_turn = 0;
        this.dealer = [];
        this.dealerScore = 0;
        this.dealerAceCount = 0;
        this.isDealing = false;

        for (let i = 0; i < this.players.length; i++) {
            this.players[i].hand = [];
        }
    }

    next_turn() {
        this.resetTimeOut();
        let player = 0;
        for (let i = 0; i <= 3; i++) {
            this._turn = this.current_turn++ % 4;
            player = this.getPlayer(this._turn);

            if (this._turn >= 3)
                i = 4;
            if (player == 0 || !player.isReady || player.isEnded || player.hasBlackjack)
                continue;
            else
                i = 4;
        }

        let turn = this._turn;
        io.in(this.room).emit('game:turn', { turn });
        console.log('On', turn);

        if (this._turn >= 3) {
            console.log('No more turns, now is time of the Dealer', this.dealerScore);

            if (this.allPlayerBusted()) {
                const dealerScore = this.dealerScore;
                const dealerCards = this.dealer;

                io.in(this.room).emit('game:ended', { dealerScore, dealerCards });
                this.isOnPlay = false;
                return true;
            }

            let cards = [];
            while (this.dealerScore < 17) {
                console.log('Looping to deal');
                this.checkEmptyDeck();
                const card = this.cards.shift();
                const rank = this.getCardRank(card[0]);
                const suit = card[1];
                this.calculateDealerScore(rank + 1);
                cards.push({ rank, suit });
            }

            io.in(this.room).emit('dealer:deal', { 'username': 'Dealer', cards, 'seat': 3 });
            const dealerScore = this.dealerScore;
            const dealerCards = this.dealer;

            io.in(this.room).emit('game:ended', { dealerScore, dealerCards });
            this.isOnPlay = false;
            return true;
        }
        this.triggerTimeout();
        return false;
    }

    checkEmptyDeck() {
        if (this.cards.length == 0) {
            console.log('New deck');
            var roomDeck = deck.CreateDeck(this.room, deck.CreateSeed(), this.totalDecks);
            this.cards = roomDeck;
        }
    }

    allPlayerBusted() {
        let bust = true;
        for (let i = 0; i < 3; i++) {
            const player = this.getPlayer(i);
            if (!player.isReady || player === 0)
                continue;

            bust = bust & player.isBust;
        }
        return bust;
    }

    triggerTimeout() {
        this.timeOut = setTimeout(() => {
            console.log("Time out");
            this.resetTimeOut();
            let player = this.getPlayer(this._turn);
            if (player != 0 && player.isSplitGame) {
                this.standPlayer(player);
                return;
            }
            this.next_turn();
        }, this.turnTime * 1000);
    }

    restartTimer() {
        if (typeof this.timeOut === 'object') {
            clearTimeout(this.timeOut);
        }
        this.current_turn--;
        this.next_turn();
    }

    resetTimeOut() {
        if (typeof this.timeOut === 'object') {
            clearTimeout(this.timeOut);
        }
    }

    getPlayer(seat) {
        for (let i = 0; i < this.players.length; i++)
            if (this.players[i].seat === seat)
                return this.players[i];

        return 0;
    }

    addCardToPlayer(seat, card) {
        for (let i = 0; i < this.players.length; i++)
            if (this.players[i].seat == seat) {
                this.players[i].hand.push(card);
                console.log('Player hand', this.players[i].hand);
            }
    }

    checkBlackjacks() {
        try {

            for (let i = 0; i < this.players.length; i++)
                if (this.players[i].hand[0].rank === 0 && this.players[i].hand[1].rank >= 9 ||
                    this.players[i].hand[0].rank >= 9 && this.players[i].hand[1].rank === 0) { this.players[i].hasBlackjack = true; }
        } catch (err) {
            console.log('Undefined card');
        }
    }

    getCardRank(cardR) {
        let rank = 0;
        value = parseInt(cardR, 10);
        if (value < 10 && value > 1) {
            rank = value - 1;
        } else {
            if (cardR == 'A')
                rank = 0;
            else if (cardR == 'T')
                rank = 9;
            else if (cardR == 'J')
                rank = 10;
            else if (cardR == 'Q')
                rank = 11;
            else if (cardR == 'K')
                rank = 12;
        }
        return rank;
    }

    calculateDealerScore(rank) {
        if (rank > 10)
            rank = 10;
        this.dealer.push(rank);

        this.dealerScore = this.dealer.reduce((acc, curr) => {
            if (curr - 1 != 0)
                acc += curr;
            else
                this.dealerAceCount++;

            for (let i = 0; i < this.dealerAceCount; i++) {
                if (acc + 11 < 22)
                    acc += 11;
                else
                    acc++;
            }
            return acc;
        });
        console.log('Dealer Score:', this.dealerScore);
    }
    dealerMayHave21() {
        return this.dealer[0] === 1;
    }

    standPlayer(socket) {
        let username = socket.username;

        let seat = socket.seat;

        if (socket.isSplitGame) {
            socket.isSplitGame = false;
            socket.isEnded = false;
            this.restartTimer();

            const card = this.drawCard();
            io.in(socket.myRoom).emit('player:stand', { username, seat });
            socket.hand.push(card);
            io.in(socket.myRoom).emit('player:deal', { username, card, seat });
            return;
        }
        socket.isEnded = true;
        this.next_turn();
        io.in(socket.myRoom).emit('player:stand', { username, seat });
    }

    drawCard() {
        const card = this.cards.shift();
        this.checkEmptyDeck();

        const rank = this.getCardRank(card[0]);
        const suit = card[1];
        console.log('Card to deal', card);
        return { rank, suit };
    }

    getCardRank(cardR) {
        let rank = 0;
        value = parseInt(cardR, 10);
        if (value < 10 && value > 1) {
            rank = value - 1;
        } else {
            if (cardR === 'A')
                rank = 0;
            else if (cardR === 'T')
                rank = 9;
            else if (cardR === 'J')
                rank = 10;
            else if (cardR === 'Q')
                rank = 11;
            else if (cardR === 'K')
                rank = 12;
        }
        return rank;
    }
};

module.exports = Game