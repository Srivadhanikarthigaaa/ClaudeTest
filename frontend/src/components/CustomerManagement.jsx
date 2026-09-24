import { useEffect, useState } from 'react';
import { listCustomers, createCustomer, updateCustomerEligibility } from '../api';
import { validateCustomerForm, ELIGIBILITY_STATUSES } from '../customerValidation';
import Field from './Field';

const EMPTY_FORM = { CustomerId: '', EligibilityStatus: 'Eligible' };

// FRD Section 9.1, FR-FE-01 — Customer Management screen: view all customers;
// create a customer; update a customer's EligibilityStatus.
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
      setLoadError(err.body?.Error || err.message);
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
      if (err.status === 400 && Array.isArray(err.body?.Errors)) {
        const fieldErrors = {};
        for (const { Field: field, Reason: reason } of err.body.Errors) fieldErrors[field] = reason;
        setErrors(fieldErrors);
      } else if (err.status === 409) {
        setErrors({ CustomerId: 'already exists' });
      } else {
        setLoadError(err.body?.Error || err.message);
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
      setRowErrors((prev) => ({ ...prev, [customerId]: err.body?.Error || err.message }));
    }
  }

  return (
    <section className="screen">
      <h2>Customer Management</h2>

      <form className="inline-form" onSubmit={handleCreate}>
        <Field label="Customer Id" htmlFor="new-customer-id" error={errors.CustomerId}>
          <input id="new-customer-id" value={form.CustomerId} onChange={handleChange('CustomerId')} />
        </Field>
        <Field label="Eligibility Status" htmlFor="new-customer-status" error={errors.EligibilityStatus}>
          <select id="new-customer-status" value={form.EligibilityStatus} onChange={handleChange('EligibilityStatus')}>
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
            <tr key={customer.CustomerId}>
              <td>{customer.CustomerId}</td>
              <td>
                <select
                  value={customer.EligibilityStatus}
                  onChange={(event) => handleEligibilityChange(customer.CustomerId, event.target.value)}
                >
                  {ELIGIBILITY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {rowErrors[customer.CustomerId] && (
                  <span className="field-error" role="alert">
                    {rowErrors[customer.CustomerId]}
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
