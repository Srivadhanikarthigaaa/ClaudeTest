import { useEffect, useState } from 'react';
import { listInventory, createInventory, updateInventory } from '../api';
import { validateInventoryForm, WAREHOUSE_IDS } from '../inventoryValidation';
import Field from './Field';

const EMPTY_FORM = { ProductId: '', WarehouseId: 'WH-A', AvailableQuantity: '', EarliestDispatchDate: '' };

function rowKey(row) {
  return `${row.ProductId}|${row.WarehouseId}`;
}

// FRD Section 9.2, FR-FE-02 — Inventory Management screen: view inventory
// (filterable by warehouse/product); create/update inventory.
export default function InventoryManagement() {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [filters, setFilters] = useState({ warehouseId: '', productId: '' });
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [edits, setEdits] = useState({});
  const [rowErrors, setRowErrors] = useState({});

  async function reload(currentFilters = filters) {
    try {
      const data = await listInventory(currentFilters);
      setRows(data);
      setLoadError(null);
      const nextEdits = {};
      for (const row of data) {
        nextEdits[rowKey(row)] = { AvailableQuantity: String(row.AvailableQuantity), EarliestDispatchDate: row.EarliestDispatchDate };
      }
      setEdits(nextEdits);
    } catch (err) {
      setLoadError(err.body?.Error || err.message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleFilterChange(field) {
    return (event) => {
      const next = { ...filters, [field]: event.target.value };
      setFilters(next);
      reload(next);
    };
  }

  function handleFormChange(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const clientErrors = validateInventoryForm(form, { isCreate: true });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await createInventory({ ...form, AvailableQuantity: Number(form.AvailableQuantity) });
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.body?.Errors)) {
        const fieldErrors = {};
        for (const { Field: field, Reason: reason } of err.body.Errors) fieldErrors[field] = reason;
        setErrors(fieldErrors);
      } else if (err.status === 409) {
        setErrors({ ProductId: 'that (ProductId, WarehouseId) combination already exists' });
      } else {
        setLoadError(err.body?.Error || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditChange(key, field) {
    return (event) => setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: event.target.value } }));
  }

  async function handleSaveRow(row) {
    const key = rowKey(row);
    const edited = edits[key];
    const clientErrors = validateInventoryForm(edited, { isCreate: false });
    if (Object.keys(clientErrors).length > 0) {
      setRowErrors((prev) => ({ ...prev, [key]: Object.values(clientErrors)[0] }));
      return;
    }
    try {
      await updateInventory(row.ProductId, row.WarehouseId, {
        availableQuantity: Number(edited.AvailableQuantity),
        earliestDispatchDate: edited.EarliestDispatchDate,
      });
      setRowErrors((prev) => ({ ...prev, [key]: null }));
      await reload();
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [key]: err.body?.Error || err.message }));
    }
  }

  return (
    <section className="screen">
      <h2>Inventory Management</h2>

      <div className="filter-bar">
        <label htmlFor="filter-warehouse">Filter by Warehouse</label>
        <select id="filter-warehouse" value={filters.warehouseId} onChange={handleFilterChange('warehouseId')}>
          <option value="">All</option>
          {WAREHOUSE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <label htmlFor="filter-product">Filter by Product Id</label>
        <input id="filter-product" value={filters.productId} onChange={handleFilterChange('productId')} />
      </div>

      <form className="inline-form" onSubmit={handleCreate}>
        <Field label="Product Id" htmlFor="new-inv-product" error={errors.ProductId}>
          <input id="new-inv-product" value={form.ProductId} onChange={handleFormChange('ProductId')} />
        </Field>
        <Field label="Warehouse Id" htmlFor="new-inv-warehouse" error={errors.WarehouseId}>
          <select id="new-inv-warehouse" value={form.WarehouseId} onChange={handleFormChange('WarehouseId')}>
            {WAREHOUSE_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Available Quantity" htmlFor="new-inv-qty" error={errors.AvailableQuantity}>
          <input id="new-inv-qty" type="number" value={form.AvailableQuantity} onChange={handleFormChange('AvailableQuantity')} />
        </Field>
        <Field label="Earliest Dispatch Date" htmlFor="new-inv-date" error={errors.EarliestDispatchDate}>
          <input
            id="new-inv-date"
            placeholder="YYYY-MM-DD"
            value={form.EarliestDispatchDate}
            onChange={handleFormChange('EarliestDispatchDate')}
          />
        </Field>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Inventory Row'}
        </button>
      </form>

      {loadError && <p className="banner-error" role="alert">{loadError}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Product Id</th>
            <th>Warehouse Id</th>
            <th>Available Quantity</th>
            <th>Earliest Dispatch Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const edited = edits[key] || { AvailableQuantity: '', EarliestDispatchDate: '' };
            return (
              <tr key={key}>
                <td>{row.ProductId}</td>
                <td>{row.WarehouseId}</td>
                <td>
                  <input
                    type="number"
                    value={edited.AvailableQuantity}
                    onChange={handleEditChange(key, 'AvailableQuantity')}
                  />
                </td>
                <td>
                  <input
                    value={edited.EarliestDispatchDate}
                    onChange={handleEditChange(key, 'EarliestDispatchDate')}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => handleSaveRow(row)}>
                    Save
                  </button>
                  {rowErrors[key] && (
                    <span className="field-error" role="alert">
                      {rowErrors[key]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
