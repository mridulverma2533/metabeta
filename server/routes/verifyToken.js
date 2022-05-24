const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {

    const token = req.header('blackjack-token');

    if(!token) return res.status(401).send('Access Dennied');

    try {
        const verified = jwt.verify(token, 'TOKEN_SECRET-key$$')
        req.player = verified;
        next();
    }
    catch (err){
        res.status(400).send('Invalid Play')
    }
}

