const express = require('express');
const { submitOrder, getOrder } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', submitOrder);
router.get('/orders/:OrderId', getOrder);

module.exports = router;
