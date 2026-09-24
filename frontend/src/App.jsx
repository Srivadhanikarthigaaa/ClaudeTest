import { useState } from 'react';
import ApiTokenInput from './components/ApiTokenInput';
import OrderForm from './components/OrderForm';
import CustomerManagement from './components/CustomerManagement';
import InventoryManagement from './components/InventoryManagement';
import './App.css';

const TABS = [
  { id: 'orders', label: 'Order Processing', Component: OrderForm },
  { id: 'customers', label: 'Customer Management', Component: CustomerManagement },
  { id: 'inventory', label: 'Inventory Management', Component: InventoryManagement },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('orders');
  const ActiveScreen = TABS.find((tab) => tab.id === activeTab).Component;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Order Fulfilment Application</h1>
        <ApiTokenInput />
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`tab${tab.id === activeTab ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        <ActiveScreen />
      </main>
    </div>
  );
}
