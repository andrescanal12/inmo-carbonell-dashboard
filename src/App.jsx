import React, { useState, useEffect } from 'react';
import './App.css';
import InvoicesPage from './InvoicesPage.jsx';

const DEFAULT_APARTMENTS = [
  { ref: "1", address: "C/ SAN TELMO, 4 – 1º IZQUIERDA - INTERIOR 03002 ALICANTE", periodType: "1_31" },
  { ref: "2", address: "PASAJE SAN FRANCISCO JAVIER, 2 - 3º B", periodType: "1_31" },
  { ref: "3", address: "AVDA. CONDOMINA, 19 C.R. LAS TORRES C - 8 C-2", periodType: "1_31" },
  { ref: "4", address: "CAMINO DE RONDA, 15 - 3º DCHA. 1", periodType: "1_31" },
  { ref: "5", address: "AVDA. BRUSELAS, 21-1°C. INTUR BLOQUE H6-6°-371 1", periodType: "1_31" },
  { ref: "6", address: "C/ SAN VICENTE, 37 BAJO IZQ.", periodType: "1_31" },
  { ref: "8", address: "C/ GENERAL PRIMO DE RIVERA, 3 LOCAL 1 03002 ALICANTE", periodType: "15_14" },
  { ref: "9", address: "C/ TEATRO, 27 – 2º DCHA. 03001 ALICANTE", periodType: "1_31" },
  { ref: "10", address: "LA RAMBLA DE MENDEZ NUÑEZ, 36 - 1º C", periodType: "1_31" },
  { ref: "11", address: "GLORIETA REINO UNIDO,6 – BLOQUE 5 - 3º PUERTA 8 URB. ALICANTE HILLS 03008 ALICANTE", periodType: "1_31" },
  { ref: "14", address: "LA RAMBLA, 36 - 2º B", periodType: "1_31" },
  { ref: "15", address: "C/ PRIMITIVO PEREZ, 3 – 1º PTA. 2. 03010 ALICANTE", periodType: "1_31" },
  { ref: "19", address: "ARTILLEROS, 3 – 2º 03002 ALICANTE", periodType: "1_31" },
  { ref: "20", address: "POETA VILA Y BLANCO, 4 – 10º - 168 03003 ALICANTE", periodType: "1_31" },
  { ref: "23", address: "C/ SAN TELMO, 4 – 1º DERECHA - EXTERIOR", periodType: "1_31" },
  { ref: "31", address: "C/ SAN CARLOS, 130 - 2º IZQ", periodType: "06_05" },
  { ref: "32", address: "C/ DEPORTISTA RAMÓN MENDIZABAL, 10 - 3º IZQ.", periodType: "1_31" }
];

function App() {
  const [activeTab, setActiveTab] = useState('create');

  // Pisos
  const [customApartments, setCustomApartments] = useState([]);
  const [allApartments, setAllApartments] = useState(DEFAULT_APARTMENTS);
  const [selectedApartment, setSelectedApartment] = useState(DEFAULT_APARTMENTS[0]);

  // Nuevo piso
  const [newAptAddress, setNewAptAddress] = useState('');
  const [newAptPeriod, setNewAptPeriod] = useState('1_31');

  // Factura
  const [invNumber, setInvNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [transferDate, setTransferDate] = useState('');

  // UI
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [isLightMode]);

  useEffect(() => {
    const saved = localStorage.getItem('customApartments');
    if (saved) {
      const parsed = JSON.parse(saved);
      setCustomApartments(parsed);
      setAllApartments([...DEFAULT_APARTMENTS, ...parsed]);
    }
  }, []);

  const handleAddApartment = (e) => {
    e.preventDefault();
    if (!newAptAddress.trim()) return;

    const newApt = {
      ref: `C-${Date.now()}`,
      address: newAptAddress.trim().toUpperCase(),
      periodType: newAptPeriod
    };

    const updatedCustom = [...customApartments, newApt];
    setCustomApartments(updatedCustom);
    setAllApartments([...DEFAULT_APARTMENTS, ...updatedCustom]);
    localStorage.setItem('customApartments', JSON.stringify(updatedCustom));

    setNewAptAddress('');
    setMessage('✅ Piso añadido correctamente.');
    setStatus('success');
    setTimeout(() => { setMessage(''); setStatus('idle'); }, 3000);
  };

  const removeCustomApartment = (refToRemove) => {
    const updatedCustom = customApartments.filter(a => a.ref !== refToRemove);
    setCustomApartments(updatedCustom);
    setAllApartments([...DEFAULT_APARTMENTS, ...updatedCustom]);
    localStorage.setItem('customApartments', JSON.stringify(updatedCustom));
    if (selectedApartment.ref === refToRemove) {
      setSelectedApartment(DEFAULT_APARTMENTS[0]);
    }
  };

  const triggerWebhook = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    const webhookUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/create-invoice'
      : '/api/create-invoice';

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apartment: selectedApartment.address,
          refNumber: selectedApartment.ref,
          invNumber,
          period,
          transferDate
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage(data.message || '¡Factura generada con éxito! Revisa Telegram.');
      } else {
        throw new Error(data.message || 'Error en la respuesta del servidor');
      }
    } catch (error) {
      console.error('Error triggering webhook:', error);
      setStatus('error');
      setMessage(error.message || 'Hubo un error al generar la factura. Inténtalo de nuevo.');
    }
  };

  const currentPeriodType = selectedApartment.periodType ||
    (selectedApartment.ref === "8" ? "15_14" :
      (selectedApartment.ref === "31" ? "06_05" : "1_31"));

  return (
    <div className="container">
      <div className="bg-animation">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      <div className="dashboard-card">
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setIsLightMode(!isLightMode)}
        >
          {isLightMode ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
        </button>

        <header>
          <img src="/logo.png" alt="Inmobiliaria Carbonell" className="logo-container" />
          <h1>Inmobiliaria Carbonell</h1>
          <p className="subtitle">Gestión de Facturación Automatizada</p>
        </header>

        {/* Navegación de pestañas */}
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            ✏️ Facturar
          </button>
          <button
            className={`tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoices')}
          >
            📂 Facturas Generadas
          </button>
          <button
            className={`tab-btn ${activeTab === 'addApt' ? 'active' : ''}`}
            onClick={() => setActiveTab('addApt')}
          >
            ➕ Añadir Piso
          </button>
        </nav>

        {/* Vista de Facturas Generadas */}
        {activeTab === 'invoices' && <InvoicesPage />}

        {/* Vista de Añadir Piso */}
        {activeTab === 'addApt' && (
          <form onSubmit={handleAddApartment}>
            <div className="form-group">
              <label htmlFor="newAptAddress">Dirección Completa del Piso</label>
              <input
                id="newAptAddress"
                type="text"
                placeholder="Ej. C/ MAYOR, 15 - 2º B"
                value={newAptAddress}
                onChange={(e) => setNewAptAddress(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newAptPeriod">Regla de Periodo de Alquiler</label>
              <select
                id="newAptPeriod"
                value={newAptPeriod}
                onChange={(e) => setNewAptPeriod(e.target.value)}
                required
              >
                <option value="1_31">Mes natural (Del 1 al 31)</option>
                <option value="15_14">A mitad de mes (Del 15 al 14 del mes sig.)</option>
                <option value="06_05">A principio de mes (Del 6 al 5 del mes sig.)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary" style={{ background: '#10b981', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
              Guardar Nuevo Piso
            </button>

            {customApartments.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <label>Pisos Añadidos Manualmente</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {customApartments.map(apt => (
                    <div key={apt.ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{apt.address}</span>
                      <button type="button" onClick={() => removeCustomApartment(apt.ref)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

        {/* Vista de Crear Factura */}
        {activeTab === 'create' && <form onSubmit={triggerWebhook}>
          <div className="form-group">
            <label>Seleccionar Piso</label>
            <div className="apartment-grid">
              {allApartments.map((apt) => (
                <button
                  key={apt.ref}
                  type="button"
                  className={`apartment-card ${selectedApartment.ref === apt.ref ? 'active' : ''}`}
                  onClick={() => setSelectedApartment(apt)}
                >
                  <span className="apt-ref">#{apt.ref}</span>
                  <span className="apt-address">{apt.address}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="invNumber">Nº Factura</label>
            <input
              id="invNumber"
              type="text"
              placeholder="Ej. 21"
              value={invNumber}
              onChange={(e) => setInvNumber(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="period">Periodo</label>
            <select
              id="period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
            >
              <option value="">Seleccionar periodo...</option>

              {currentPeriodType === "15_14" ? (
                <>
                  <option value="Del 15 de Enero al 14 de Febrero de 2026">Del 15 de Enero al 14 de Febrero de 2026</option>
                  <option value="Del 15 de Febrero al 14 de Marzo de 2026">Del 15 de Febrero al 14 de Marzo de 2026</option>
                  <option value="Del 15 de Marzo al 14 de Abril de 2026">Del 15 de Marzo al 14 de Abril de 2026</option>
                  <option value="Del 15 de Abril al 14 de Mayo de 2026">Del 15 de Abril al 14 de Mayo de 2026</option>
                  <option value="Del 15 de Mayo al 14 de Junio de 2026">Del 15 de Mayo al 14 de Junio de 2026</option>
                  <option value="Del 15 de Junio al 14 de Julio de 2026">Del 15 de Junio al 14 de Julio de 2026</option>
                  <option value="Del 15 de Julio al 14 de Agosto de 2026">Del 15 de Julio al 14 de Agosto de 2026</option>
                  <option value="Del 15 de Agosto al 14 de Septiembre de 2026">Del 15 de Agosto al 14 de Septiembre de 2026</option>
                  <option value="Del 15 de Septiembre al 14 de Octubre de 2026">Del 15 de Septiembre al 14 de Octubre de 2026</option>
                  <option value="Del 15 de Octubre al 14 de Noviembre de 2026">Del 15 de Octubre al 14 de Noviembre de 2026</option>
                  <option value="Del 15 de Noviembre al 14 de Diciembre de 2026">Del 15 de Noviembre al 14 de Diciembre de 2026</option>
                  <option value="Del 15 de Diciembre de 2026 al 14 de Enero de 2027">Del 15 de Diciembre de 2026 al 14 de Enero de 2027</option>
                </>
              ) : currentPeriodType === "06_05" ? (
                <>
                  <option value="Del 06 de Diciembre de 2025 al 05 de Enero de 2026">Del 06 de Diciembre de 2025 al 05 de Enero de 2026</option>
                  <option value="Del 06 de Enero al 05 de Febrero de 2026">Del 06 de Enero al 05 de Febrero de 2026</option>
                  <option value="Del 06 de Febrero al 05 de Marzo de 2026">Del 06 de Febrero al 05 de Marzo de 2026</option>
                  <option value="Del 06 de Marzo al 05 de Abril de 2026">Del 06 de Marzo al 05 de Abril de 2026</option>
                  <option value="Del 06 de Abril al 05 de Mayo de 2026">Del 06 de Abril al 05 de Mayo de 2026</option>
                  <option value="Del 06 de Mayo al 05 de Junio de 2026">Del 06 de Mayo al 05 de Junio de 2026</option>
                  <option value="Del 06 de Junio al 05 de Julio de 2026">Del 06 de Junio al 05 de Julio de 2026</option>
                  <option value="Del 06 de Julio al 05 de Agosto de 2026">Del 06 de Julio al 05 de Agosto de 2026</option>
                  <option value="Del 06 de Agosto al 05 de Septiembre de 2026">Del 06 de Agosto al 05 de Septiembre de 2026</option>
                  <option value="Del 06 de Septiembre al 05 de Octubre de 2026">Del 06 de Septiembre al 05 de Octubre de 2026</option>
                  <option value="Del 06 de Octubre al 05 de Noviembre de 2026">Del 06 de Octubre al 05 de Noviembre de 2026</option>
                  <option value="Del 06 de Noviembre al 05 de Diciembre de 2026">Del 06 de Noviembre al 05 de Diciembre de 2026</option>
                  <option value="Del 06 de Diciembre de 2026 al 05 de Enero de 2027">Del 06 de Diciembre de 2026 al 05 de Enero de 2027</option>
                </>
              ) : (
                <>
                  <option value="Del 01 al 31 de Enero de 2026">Del 01 al 31 de Enero de 2026</option>
                  <option value="Del 01 al 28 de Febrero de 2026">Del 01 al 28 de Febrero de 2026</option>
                  <option value="Del 01 al 31 de Marzo de 2026">Del 01 al 31 de Marzo de 2026</option>
                  <option value="Del 01 al 30 de Abril de 2026">Del 01 al 30 de Abril de 2026</option>
                  <option value="Del 01 al 31 de Mayo de 2026">Del 01 al 31 de Mayo de 2026</option>
                  <option value="Del 01 al 30 de Junio de 2026">Del 01 al 30 de Junio de 2026</option>
                  <option value="Del 01 al 31 de Julio de 2026">Del 01 al 31 de Julio de 2026</option>
                  <option value="Del 01 al 31 de Agosto de 2026">Del 01 al 31 de Agosto de 2026</option>
                  <option value="Del 01 al 30 de Septiembre de 2026">Del 01 al 30 de Septiembre de 2026</option>
                  <option value="Del 01 al 31 de Octubre de 2026">Del 01 al 31 de Octubre de 2026</option>
                  <option value="Del 01 al 30 de Noviembre de 2026">Del 01 al 30 de Noviembre de 2026</option>
                  <option value="Del 01 al 31 de Diciembre de 2026">Del 01 al 31 de Diciembre de 2026</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="transferDate">Transferencia Recibida</label>
            <input
              id="transferDate"
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className={`btn-primary ${status === 'loading' ? 'loading' : ''}`}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Generando...' : 'Crear Factura'}
          </button>
        </form>}

        {activeTab === 'create' && message && (
          <div className={`status-banner ${status}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
