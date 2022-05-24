const express = require('express');
const colors = require('colors/safe');
const cors = require('cors');
const path = require('path');
// const path = require('path')

const app = express();

// Settings
app.set('port', process.env.PORT || 8080);
//app.set('views', path.join(__dirname, '/views'));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ useNewUrlParser: true }));

// Public Path
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// Enable Cors
app.use(cors());


// Start server
const server = app.listen(app.get('port'), () => {
    console.log('[Playmex] ' + colors.blue('♠ ') + colors.red('♥') + ' Blackjack server ' + colors.green('♣') +
        colors.yellow(' ♦') + ' port', app.get('port'));

    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
});

// Web Sockets
module.exports.io = require('socket.io')(server);
require('./sockets/socket');