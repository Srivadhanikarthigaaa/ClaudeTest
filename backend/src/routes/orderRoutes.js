const express = require('express');
const { submitOrder, getOrder } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', submitOrder);
// CHANGE1 requirement 1: path parameter names are lowerCamelCase too. The
// URL shape is unchanged (the segment is positional) — only req.params' key.
router.get('/orders/:orderId', getOrder);

module.exports = router;
