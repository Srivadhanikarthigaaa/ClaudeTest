const express = require('express');
const controller = require('../controllers/customerController');

const router = express.Router();

router.post('/customers', controller.create);
router.get('/customers', controller.list);
router.get('/customers/:customerId', controller.get);
router.put('/customers/:customerId', controller.update);

module.exports = router;
