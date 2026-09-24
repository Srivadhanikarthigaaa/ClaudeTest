import { useState } from 'react';
import { submitOrder } from '../api';
import { validateOrderForm } from '../orderValidation';
import Field from './Field';
import FulfilmentResultView from './FulfilmentResultView';

const EMPTY_FORM = {
  OrderId: '',
  CustomerId: '',
  CustomerType: 'Standard',
  ProductId: '',
  Quantity: '',
  PromisedDeliveryDate: '',
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
      const payload = { ...values, Quantity: Number(values.Quantity) };
      const response = await submitOrder(payload);
      setResult(response); // FR-FE-05: shown exactly as the backend returned it
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.body?.Errors)) {
        const fieldErrors = {};
        for (const { Field: field, Reason: reason } of err.body.Errors) fieldErrors[field] = reason;
        setErrors(fieldErrors);
      } else {
        setApiError(err.body?.Error || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <form className="stack-form" onSubmit={handleSubmit}>
        <Field label="Order Id" htmlFor="OrderId" error={errors.OrderId}>
          <input id="OrderId" value={values.OrderId} onChange={handleChange('OrderId')} />
        </Field>

        <Field label="Customer Id" htmlFor="CustomerId" error={errors.CustomerId}>
          <input id="CustomerId" value={values.CustomerId} onChange={handleChange('CustomerId')} />
        </Field>

        <Field label="Customer Type" htmlFor="CustomerType" error={errors.CustomerType}>
          <select id="CustomerType" value={values.CustomerType} onChange={handleChange('CustomerType')}>
            <option value="Standard">Standard</option>
            <option value="Priority">Priority</option>
          </select>
        </Field>

        <Field label="Product Id" htmlFor="ProductId" error={errors.ProductId}>
          <input id="ProductId" value={values.ProductId} onChange={handleChange('ProductId')} />
        </Field>

        <Field label="Quantity" htmlFor="Quantity" error={errors.Quantity}>
          <input id="Quantity" type="number" value={values.Quantity} onChange={handleChange('Quantity')} />
        </Field>

        <Field label="Promised Delivery Date" htmlFor="PromisedDeliveryDate" error={errors.PromisedDeliveryDate}>
          <input
            id="PromisedDeliveryDate"
            type="text"
            placeholder="YYYY-MM-DD"
            value={values.PromisedDeliveryDate}
            onChange={handleChange('PromisedDeliveryDate')}
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
