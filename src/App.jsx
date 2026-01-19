import React, { useState } from 'react';
import './App.css';

const APARTMENTS = [
  { ref: "1", address: "C/ SAN TELMO, 4 – 1º IZQUIERDA - INTERIOR 03002 ALICANTE" },
  { ref: "3", address: "AVDA. CONDOMINA, 19 C.R. LAS TORRES C - 8 C-2" },
  { ref: "4", address: "CAMINO DE RONDA, 15 - 3º DCHA. 1" },
  { ref: "5", address: "AVDA. BRUSELAS, 21-1°C. INTUR BLOQUE H6-6°-371 1" },
  { ref: "6", address: "C/ SAN VICENTE, 37 BAJO IZQ." },
  { ref: "8", address: "C/ GENERAL PRIMO DE RIVERA, 3 LOCAL 1 03002 ALICANTE" },
  { ref: "9", address: "C/ TEATRO, 27 – 2º DCHA. 03001 ALICANTE" },
  { ref: "10", address: "LA RAMBLA DE MENDEZ NUÑEZ, 36 - 1º C" },
  { ref: "11", address: "GLORIETA REINO UNIDO,6 – BLOQUE 5 - 3º PUERTA 8 URB. ALICANTE HILLS 03008 ALICANTE" },
  { ref: "14", address: "LA RAMBLA, 36 - 2º B" },
  { ref: "15", address: "C/ PRIMITIVO PEREZ, 3 – 1º PTA. 2. 03010 ALICANTE" },
  { ref: "19", address: "ARTILLEROS, 3 – 2º 03002 ALICANTE" },
  { ref: "20", address: "POETA VILA Y BLANCO, 4 – 10º - 168 03003 ALICANTE" },
  { ref: "23", address: "C/ SAN TELMO, 4 – 1º DERECHA - EXTERIOR" }
];

function App() {
  const [selectedApartment, setSelectedApartment] = useState(APARTMENTS[0]);
  const [invNumber, setInvNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const triggerWebhook = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    // Use localhost in development, relative path in production
    const webhookUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/create-invoice'
      : '/api/create-invoice';

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  return (
    <div className="container">
      <div className="dashboard-card">
        <header>
          <h1>Inmo Carbonell</h1>
          <p className="subtitle">Gestión de Facturación Automatizada</p>
        </header>

        <form onSubmit={triggerWebhook}>
          <div className="form-group">
            <label>Seleccionar Piso</label>
            <div className="apartment-grid">
              {APARTMENTS.map((apt) => (
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
        </form>

        {message && (
          <div className={`status-banner ${status}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
