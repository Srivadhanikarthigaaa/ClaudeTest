import { useEffect, useState } from 'react';
import { listCustomers, createCustomer, updateCustomerEligibility } from '../api';
import { validateCustomerForm, ELIGIBILITY_STATUSES } from '../customerValidation';
import Field from './Field';

// CHANGE1 requirement 1: lowerCamelCase field names throughout, matching the API.
const EMPTY_FORM = { customerId: '', eligibilityStatus: 'Eligible' };

// FRD Section 9.1, FR-FE-01 — Customer Management screen: view all customers;
// create a customer; update a customer's eligibilityStatus.
export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState({});

  async function reload() {
    try {
      const data = await listCustomers();
      setCustomers(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.body?.error || err.message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleChange(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const clientErrors = validateCustomerForm(form);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await createCustomer(form);
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.body?.errors)) {
        const fieldErrors = {};
        for (const { field, reason } of err.body.errors) fieldErrors[field] = reason;
        setErrors(fieldErrors);
      } else if (err.status === 409) {
        setErrors({ customerId: 'already exists' });
      } else {
        setLoadError(err.body?.error || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEligibilityChange(customerId, eligibilityStatus) {
    try {
      await updateCustomerEligibility(customerId, eligibilityStatus);
      setRowErrors((prev) => ({ ...prev, [customerId]: null }));
      await reload();
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [customerId]: err.body?.error || err.message }));
    }
  }

  return (
    <section className="screen">
      <h2>Customer Management</h2>

      <form className="inline-form" onSubmit={handleCreate}>
        <Field label="Customer Id" htmlFor="new-customer-id" error={errors.customerId}>
          <input id="new-customer-id" value={form.customerId} onChange={handleChange('customerId')} />
        </Field>
        <Field label="Eligibility Status" htmlFor="new-customer-status" error={errors.eligibilityStatus}>
          <select id="new-customer-status" value={form.eligibilityStatus} onChange={handleChange('eligibilityStatus')}>
            {ELIGIBILITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Customer'}
        </button>
      </form>

      {loadError && <p className="banner-error" role="alert">{loadError}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Customer Id</th>
            <th>Eligibility Status</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.customerId}>
              <td>{customer.customerId}</td>
              <td>
                <select
                  value={customer.eligibilityStatus}
                  onChange={(event) => handleEligibilityChange(customer.customerId, event.target.value)}
                >
                  {ELIGIBILITY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {rowErrors[customer.customerId] && (
                  <span className="field-error" role="alert">
                    {rowErrors[customer.customerId]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
