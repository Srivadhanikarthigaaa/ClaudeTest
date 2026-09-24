const express = require('express');
const controller = require('../controllers/inventoryController');

const router = express.Router();

router.post('/inventory', controller.create);
router.get('/inventory', controller.list);
router.get('/inventory/:productId/:warehouseId', controller.get);
router.put('/inventory/:productId/:warehouseId', controller.update);

module.exports = router;
