const express = require('express');
const router = express.Router();
const deck = require('../controllers/deck.controller');
const verify = require ('./verifyToken');

router.get('/', verify, deck.GetDeck);

module.exports = router;