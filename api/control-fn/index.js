'use strict';
// Isolated entry: no legacy server boot, service key or Production fallback in Preview.
module.exports = require('../control').createHandler();
