const { io } = require('../bjApp');
const uuidv4 = require('uuid/v4');

const Game = require('../classes/game');
const deck = require('../controllers/deck.controller');

var games = [];

io.on('connection', (socket) => {

    console.log('Player connected', socket.id);
    socket.isReady = false;
    socket.emit('player:connected', { 'message': 'Welcome 1.2 Local' });

    EraseEmptyRooms();
    console.log('LIST!');
    io.emit('room:list', { "rooms": GetPublicRooms() });

    socket.on('disconnect', function() {
        console.log(socket.username ? socket.username : socket.id, 'is disconnected');
        let room = socket.myRoom;
        let i = socket.gameIndex;
        if (i < 0 || typeof i === 'undefined') {
            console.log(socket.username ? socket.username : socket.id, 'Was not part of a room');
            return;
        }
        console.log('my room was', room, games.length);
        let message = '<i> left the chat..</i>';
        let username = socket.username;
        io.in(room).emit('chat_message', { username, message });

        try {
            var index = games[i].players.indexOf(socket);

            if (index > -1) {
                games[i].players.splice(index, 1);
            }
        } catch (err) {
            console.log('Does not belong to any room', games.length);
        }
        EraseEmptyRooms();

        io.emit('room:list', { "rooms": GetPublicRooms() });
        let seat = socket.seat;
        io.in(room).emit('player:leave', { seat });
    });

    socket.on('player:leave', function() {
        console.log('ALV', socket.username ? socket.username : socket.id, 'exit the room');
        let room = socket.myRoom;
        console.log('leaved the room', room);
        let i = socket.gameIndex;
        try {
            var index = games[i].players.indexOf(socket);

            if (index > -1) {
                games[i].players.splice(index, 1);
            }
        } catch (err) {
            console.log(err);
        }
        EraseEmptyRooms();
        io.emit('room:list', { "rooms": GetPublicRooms() });
        let seat = socket.seat;
        io.in(socket.myRoom).emit('player:leave', { seat });
    });

    socket.on('room:join', function(data) {
        const room = io.nsps['/'].adapter.rooms[data.room];

        if (room) { //If room exist
            if (room.length < 3) { // Join room if is not full

                SetSocketPropierties(socket, data);
                socket.join(data.room);
                socket.gameIndex = GetGameIndex(data.room);

                if (games[socket.gameIndex].players.indexOf(socket) >= 0)
                    return;
                const i = socket.gameIndex;
                games[i].players.push(socket);
                const roomDeck = games[i].cards;
                const time = games[i].turnTime;
                const onPlay = games[i].isOnPlay;
                socket.emit('room:joined', { 'deck': roomDeck, 'turnTime': time, onPlay });

                console.log(data.username, 'Is joining the room...', data.room);

                io.in(data.room).emit('room:sync', { 'players': GetPlayersInfoFromRoom(i) });
            } else {
                console.log(data.username, 'found room full...');
                socket.emit('err:room', { 'message': 'The room you try to access is full. Choose another.', 'flag': 2 });
                return;
            }
            socket.myRoom = data.room;
            io.emit('room:list', { 'rooms': GetPublicRooms() });
        } else {
            console.log("Room does not exist.");
            socket.emit('err:room', { 'message': 'The room you try to access does not exist. Choose another or create one.', 'flag': 1 });
        }
    });

    socket.on('room:create', function(data) {
        const exist = io.nsps['/'].adapter.rooms[data.room];

        if (exist) {
            socket.emit('err:room', { 'message': 'You are trying to create a room that already exist. Choose another name.', 'flag': 0 });
            return;
        }
        const room = (data.room) ? data.room : uuidv4();

        SetSocketPropierties(socket, data);

        console.log(data.username, 'Is creating the room:', room, data.isPrivate, data.totalDecks);
        socket.join(room);

        const roomDeck = deck.CreateDeck(room, deck.CreateSeed(), data.totalDecks);
        //const roomDeck = deck.CreateDebugDeck(room, deck.CreateSeed(), data.totalDecks);

        const time = data.turnTime;
        socket.emit('room:joined', { 'deck': roomDeck, 'turnTime': time });

        games.push(new Game(room, roomDeck, data.totalDecks, data.isPrivate, data.turnTime));

        socket.myRoom = room;
        socket.gameIndex = games.length - 1;
        games[games.length - 1].players.push(socket);

        io.emit('room:list', { 'rooms': GetPublicRooms() });
    });

    socket.on('player:sit', (data) => {
        console.log(data)
        socket.seat = data.seat;
        socket.level = data.level;
        const seat = data.seat;
        const username = socket.username;
        const balance = socket.balance;
        const avatar = socket.avatar;
        const level = socket.level;
        io.in(socket.myRoom).emit('player:sit', { username, seat, balance, avatar, level });
        io.in(socket.myRoom).emit('room:sync', { 'players': GetPlayersInfoFromRoom(socket.gameIndex) });
    });

    socket.on('player:reset', (data) => {
        socket.balance = data.balance;
        socket.currentBet = 0;
        socket.hand = []
        socket.isReady = false;
        socket.isSplitGame = false;
        socket.isEnded = false;
        socket.hasBlackjack = false;
        socket.isBust = false;
        io.in(socket.myRoom).emit('room:sync', { 'players': GetPlayersInfoFromRoom(socket.gameIndex) });
    });

    socket.on('room:sync', () => {
        io.in(socket.myRoom).emit('room:sync', { 'players': GetPlayersInfoFromRoom(socket.gameIndex) });
    });

    socket.on('player:deal', () => {
        DealPlayer(socket);
    });

    socket.on('player:stand', (data) => {
        socket.isBust = data.valid;
        console.log(data, socket.isReady);
        StandPlayer(socket);
    });

    socket.on('player:split', (data) => {

        console.log('Split hand', data, socket.hand.length);
        if (socket.hand.length != 2)
            return;

        const username = socket.username;
        const seat = socket.seat;
        socket.isSplitGame = true;

        const i = socket.gameIndex;
        if (games[i].isDealing) {
            games[i].restartTimer();
            io.in(socket.myRoom).emit('player:restarttimer', { seat });
        }
        const card = DrawCard(i);
        console.log('Split card Is! !! !!! ', card);
        io.in(socket.myRoom).emit('player:split', { username, card, seat });

        if (data.valid) { //If Ace Split is valid
            StandPlayer(socket);
            StandPlayer(socket);
        }
    });

    socket.on('player:double', () => {
        const card = DrawCard(socket.gameIndex);
        if (!socket.isSplitGame)
            socket.hand.push(card);
        const username = socket.username;
        const seat = socket.seat;
        io.in(socket.myRoom).emit('player:double', { username, card, seat });
        io.in(socket.myRoom).emit('player:stand', { username, seat });
    });

    socket.on('chat_message', (data) => {
        io.in(socket.myRoom).emit("chat_message", data);
    });

    socket.on('player:addbet', function(data) {
        console.log(socket.username, "added:", data.bet);
        socket.currentBet += data.bet;
        const username = socket.username;
        const message = 'added ' + data.bet;
        io.in(socket.myRoom).emit('chat_message', { username, message });
        socket.emit('player:addbet', { username, message });
    });

    socket.on('player:level', function(data) {
        socket.level = data.level;
        socket.to(socket.myRoom).emit('player:level', { 'seat': socket.seat, 'level': socket.level });
    });

    socket.on('player:ready', function() {
        console.log(socket.username, 'is ready and has', socket.currentBet);
        const seat = socket.seat;
        const bet = socket.currentBet;
        socket.isReady = true;
        io.in(socket.myRoom).emit('player:ready', { seat, bet });
    });

    socket.on('player:clear', function() {
        const turn = socket.seat;
        io.in(socket.myRoom).emit('player:clear', { turn });
        console.log(socket.username, 'have retribed they bets', socket.currentBet);
        socket.currentBet = 0;
        socket.isReady = false;
    });

    socket.on('game:start', function() {
        const i = socket.gameIndex;
        console.log('Starting...');
        if (games[i].isOnPlay) {
            return;
        }
        games[i].isOnPlay = true;
        games[i].reset();
        StartRound(i);
    });
});


/*
General functions
*/
function FirstDeal(index) {
    console.log('On Inital Deal');
    InitialDeal(index);
    let timeOut = setTimeout(() => {
        clearTimeout(timeOut);
        CheckInsurance(index);

    }, 3500);
}

function CheckInsurance(index) {
    if (games[index].dealerMayHave21()) {
        console.log('On Insurance');
        io.in(games[index].room).emit('game:insurance', { 'message': 'Start Insurance' });
        let timeOut = setTimeout(() => {
            clearTimeout(timeOut);
            console.log('GAME STARTED');
            games[index].isDealing = true;
            games[index].next_turn()

        }, 3500);
    } else {
        console.log('GAME STARTED');
        games[index].isDealing = true;
        games[index].next_turn()
    }
}

function StartRound(index) {
    console.log('On Main Timer');

    let timeOut = setTimeout(() => {
        clearTimeout(timeOut);
        FirstDeal(index);

    }, 8000);
}

function GetPublicRooms() {

    var publicRooms = [];
    for (let i = 0; i < games.length; i++) {

        if (games[i].isPrivate) {
            console.log('Game is private, so lets continue');
            continue;
        }

        let name = games[i].room;
        let poblation = games[i].players.length;
        publicRooms.push({ name, poblation });
    }
    console.log(publicRooms);
    return publicRooms;
}

function GetGameIndex(room) {
    for (let i = 0; i < games.length; i++)
        if (games[i].room == room)
            return i;
    return -1;
}

function EraseEmptyRooms() {
    for (let i = 0; i < games.length; i++) {

        console.log('erasing', games[i].players.length);
        if (games[i].players.length < 1)
            games.splice(i, 1);
    }
}

function GetPlayersInfoFromRoom(i) {
    let players = []
    for (let j = 0; j < games[i].players.length; j++) {
        let username = games[i].players[j].username;
        let balance = games[i].players[j].balance;
        let seat = games[i].players[j].seat;
        let avatar = games[i].players[j].avatar;
        let level = games[i].players[j].level;
        players.push({ username, balance, seat, avatar, level });
    }
    return players;
}

function CheckEmptyDeck(i) {
    if (games[i].cards.length == 0) {
        console.log('New deck');
        var roomDeck = deck.CreateDeck(games[i].room, deck.CreateSeed(), games[i].totalDecks);
        games[i].cards = roomDeck;
    }
}

function InitialDeal(index) {
    games[index].isDealing = true;
    let cards = []
    for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 4; i++) {
            player = games[index].getPlayer(i);
            if ((player == 0 || player.isReady == false) && i < 3)
                continue;

            const card = DrawCard(index);
            games[index].addCardToPlayer(i, card);

            if (i < 3)
                io.in(games[index].room).emit('player:deal', { 'username': '', card, 'seat': i });
            else {
                const rank = card.rank;
                const suit = card.suit
                games[index].calculateDealerScore(rank + 1);
                cards.push({ rank, suit });
                io.in(games[index].room).emit('dealer:deal', { 'username': 'Dealer', cards, 'seat': -1 });
                cards = [];
            }
        }
    }

    games[index].checkBlackjacks();
}

function DrawCard(i) {
    let card = games[i].cards.shift();
    CheckEmptyDeck(i);

    let rank = GetCardRank(card[0]);
    let suit = card[1];
    console.log('Card to deal', card);
    return { rank, suit };
}

function DealPlayer(socket) {
    let i = socket.gameIndex;
    let seat = socket.seat;
    if (games[i].isDealing) {
        games[i].restartTimer();
        io.in(socket.myRoom).emit('player:restarttimer', { seat });
    }

    const card = DrawCard(i);

    socket.hand.push(card);
    let username = socket.username;

    io.in(socket.myRoom).emit('player:deal', { username, card, seat });
}

function StandPlayer(socket) {
    let i = socket.gameIndex;
    let username = socket.username;

    let seat = socket.seat;

    if (socket.isSplitGame) {
        socket.isSplitGame = false;
        socket.isEnded = false;
        games[i].restartTimer();

        const card = DrawCard(i);
        io.in(socket.myRoom).emit('player:stand', { username, seat });
        socket.hand.push(card);
        io.in(socket.myRoom).emit('player:deal', { username, card, seat });
        return;
    }
    socket.isEnded = true;
    games[i].next_turn();
    io.in(socket.myRoom).emit('player:stand', { username, seat });
}

function GetCardRank(cardR) {
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

function SetSocketPropierties(socket, data) {
    socket.username = data.username;
    socket.balance = data.balance;
    socket.hand = [];
    socket.currentBet = 0;
    socket.seat = -1;
    socket.isReady = false;
    socket.isSplitGame = false;
    socket.isEnded = false;
    socket.hasBlackjack = false;
    socket.isBust = false;
    socket.avatar = data.avatar;
}