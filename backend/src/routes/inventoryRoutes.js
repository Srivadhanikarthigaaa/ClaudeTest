const express = require('express');
const controller = require('../controllers/inventoryController');

const router = express.Router();

router.post('/inventory', controller.create);
router.get('/inventory', controller.list);
router.get('/inventory/:ProductId/:WarehouseId', controller.get);
router.put('/inventory/:ProductId/:WarehouseId', controller.update);

module.exports = router;
