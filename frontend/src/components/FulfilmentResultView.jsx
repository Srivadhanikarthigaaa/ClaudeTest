// FRD Section 26/53, FR-UX-03/FR-FE-04: Released shows warehouse + allocated
// quantity; Blocked shows only the reason — allocation fields are never
// rendered for a Blocked order. Displays exactly what the backend returned,
// never recomputed (FR-FE-05).
//
// CHANGE1: fields are lowerCamelCase, and a "Partially Released" result shows
// its allocations (which may span several warehouses, for a Priority order)
// alongside the quantity that went on backorder.
const BLOCKED = 'Blocked';
const PARTIALLY_RELEASED = 'Partially Released';

export default function FulfilmentResultView({ result }) {
  const isBlocked = result.status === BLOCKED;
  const isPartial = result.status === PARTIALLY_RELEASED;

  return (
    <div className={`result result-${isBlocked ? 'blocked' : 'released'}`}>
      <p className="result-order-id">Order Id: {result.orderId}</p>
      <p className="result-status">
        Status: <span className="status-badge">{result.status}</span>
      </p>

      {isBlocked && <p>Reason: {result.reason}</p>}

      {!isBlocked && <p>Released Quantity: {result.releasedQuantity}</p>}
      {isPartial && <p>Backordered Quantity: {result.backorderedQuantity}</p>}

      {!isBlocked &&
        result.allocations.map((allocation) => (
          <div className="allocation" key={allocation.warehouseId}>
            <p>Warehouse: {allocation.warehouseId}</p>
            <p>Allocated Quantity: {allocation.allocatedQuantity}</p>
          </div>
        ))}
    </div>
  );
}
