// FRD Section 16.1 (Customer). All queries parameterized via .input() — never
// string-concatenated (FR-BE-04, FRD Section 60).
const { sql, getRequest } = require('../database/pool');

async function create({ CustomerId, EligibilityStatus }, transaction) {
  const request = await getRequest(transaction);
  await request
    .input('CustomerId', sql.VarChar(50), CustomerId)
    .input('EligibilityStatus', sql.VarChar(20), EligibilityStatus)
    .query(
      'INSERT INTO dbo.Customer (CustomerId, EligibilityStatus) VALUES (@CustomerId, @EligibilityStatus)'
    );
  return { CustomerId, EligibilityStatus };
}

async function findById(customerId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('CustomerId', sql.VarChar(50), customerId)
    .query('SELECT CustomerId, EligibilityStatus FROM dbo.Customer WHERE CustomerId = @CustomerId');
  return result.recordset[0] || null;
}

async function update(customerId, { EligibilityStatus }, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('CustomerId', sql.VarChar(50), customerId)
    .input('EligibilityStatus', sql.VarChar(20), EligibilityStatus)
    .query('UPDATE dbo.Customer SET EligibilityStatus = @EligibilityStatus WHERE CustomerId = @CustomerId');
  return result.rowsAffected[0] > 0;
}

async function list(transaction) {
  const request = await getRequest(transaction);
  const result = await request.query('SELECT CustomerId, EligibilityStatus FROM dbo.Customer ORDER BY CustomerId');
  return result.recordset;
}

module.exports = { create, findById, update, list };
