import { useState } from 'react';
import { submitOrder } from '../api';
import { validateOrderForm } from '../orderValidation';
import Field from './Field';
import FulfilmentResultView from './FulfilmentResultView';

// CHANGE1 requirement 1: form state keys ARE the API's lowerCamelCase field
// names, so the form body needs no translation and a 400's `field` addresses
// the right input directly.
const EMPTY_FORM = {
  orderId: '',
  customerId: '',
  customerType: 'Standard',
  productId: '',
  quantity: '',
  promisedDeliveryDate: '',
};

// FRD Section 24 (FR-FE-03/04/05) — order submission form + result display.
export default function OrderForm() {
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(field) {
    return (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setApiError(null);
    setResult(null);

    // Client-side convenience only — mirrors Phase 3's rules, never a
    // substitute for the backend's own validation (FRD Section 59).
    const clientErrors = validateOrderForm(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const payload = { ...values, quantity: Number(values.quantity) };
      const response = await submitOrder(payload);
      setResult(response); // FR-FE-05: shown exactly as the backend returned it
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.body?.errors)) {
        const fieldErrors = {};
        for (const { field, reason } of err.body.errors) fieldErrors[field] = reason;
        setErrors(fieldErrors);
      } else {
        setApiError(err.body?.error || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <form className="stack-form" onSubmit={handleSubmit}>
        <Field label="Order Id" htmlFor="orderId" error={errors.orderId}>
          <input id="orderId" value={values.orderId} onChange={handleChange('orderId')} />
        </Field>

        <Field label="Customer Id" htmlFor="customerId" error={errors.customerId}>
          <input id="customerId" value={values.customerId} onChange={handleChange('customerId')} />
        </Field>

        <Field label="Customer Type" htmlFor="customerType" error={errors.customerType}>
          <select id="customerType" value={values.customerType} onChange={handleChange('customerType')}>
            <option value="Standard">Standard</option>
            <option value="Priority">Priority</option>
          </select>
        </Field>

        <Field label="Product Id" htmlFor="productId" error={errors.productId}>
          <input id="productId" value={values.productId} onChange={handleChange('productId')} />
        </Field>

        <Field label="Quantity" htmlFor="quantity" error={errors.quantity}>
          <input id="quantity" type="number" value={values.quantity} onChange={handleChange('quantity')} />
        </Field>

        <Field label="Promised Delivery Date" htmlFor="promisedDeliveryDate" error={errors.promisedDeliveryDate}>
          <input
            id="promisedDeliveryDate"
            type="text"
            placeholder="YYYY-MM-DD"
            value={values.promisedDeliveryDate}
            onChange={handleChange('promisedDeliveryDate')}
          />
        </Field>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Order'}
        </button>
      </form>

      {apiError && <p className="banner-error" role="alert">{apiError}</p>}
      {result && <FulfilmentResultView result={result} />}
    </div>
  );
}
