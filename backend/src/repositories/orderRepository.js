// FRD Section 16.3 (Order). All queries parameterized via .input().
const { sql, getRequest } = require('../database/pool');

async function create({ OrderId, CustomerId, CustomerType, ProductId, Quantity, PromisedDeliveryDate }, transaction) {
  const request = await getRequest(transaction);
  await request
    .input('OrderId', sql.VarChar(50), OrderId)
    .input('CustomerId', sql.VarChar(50), CustomerId)
    .input('CustomerType', sql.VarChar(20), CustomerType)
    .input('ProductId', sql.VarChar(50), ProductId)
    .input('Quantity', sql.Int, Quantity)
    .input('PromisedDeliveryDate', sql.Date, PromisedDeliveryDate)
    .query(
      `INSERT INTO dbo.[Order] (OrderId, CustomerId, CustomerType, ProductId, Quantity, PromisedDeliveryDate)
       VALUES (@OrderId, @CustomerId, @CustomerType, @ProductId, @Quantity, @PromisedDeliveryDate)`
    );
  return { OrderId, CustomerId, CustomerType, ProductId, Quantity, PromisedDeliveryDate };
}

async function findById(orderId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), orderId)
    .query(
      `SELECT OrderId, CustomerId, CustomerType, ProductId, Quantity, PromisedDeliveryDate
       FROM dbo.[Order] WHERE OrderId = @OrderId`
    );
  return result.recordset[0] || null;
}

module.exports = { create, findById };
