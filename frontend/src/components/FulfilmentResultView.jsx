// FRD Section 26/53, FR-UX-03/FR-FE-04: Released shows warehouse + allocated
// quantity; Blocked shows only the reason — allocation fields are never
// rendered for a Blocked order. Displays exactly what the backend returned,
// never recomputed (FR-FE-05).
export default function FulfilmentResultView({ result }) {
  const isBlocked = result.Status === 'Blocked';

  return (
    <div className={`result result-${isBlocked ? 'blocked' : 'released'}`}>
      <p className="result-order-id">Order Id: {result.OrderId}</p>
      <p className="result-status">
        Status: <span className="status-badge">{result.Status}</span>
      </p>

      {isBlocked && <p>Reason: {result.Reason}</p>}

      {!isBlocked &&
        result.Allocations.map((allocation) => (
          <div className="allocation" key={allocation.WarehouseId}>
            <p>Warehouse: {allocation.WarehouseId}</p>
            <p>Allocated Quantity: {allocation.AllocatedQuantity}</p>
          </div>
        ))}
    </div>
  );
}
