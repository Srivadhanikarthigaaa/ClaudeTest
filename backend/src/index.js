require('dotenv').config();
const express = require('express');
const cors = require('cors');
const requireAuth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// FR-AUTH-01: every Customer/Inventory/Order route requires a valid JWT.
app.use(requireAuth, orderRoutes, customerRoutes, inventoryRoutes);

// Must be registered last (Express error middleware convention).
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
}

module.exports = app;
