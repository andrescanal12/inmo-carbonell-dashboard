import React, { useState, useEffect } from 'react';

// ─── Iconos SVG simples ────────────────────────────────────
const FolderIcon = ({ open }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {open
            ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            : <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />}
    </svg>
);

const FileIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </svg>
);

const ChevronIcon = ({ open }) => (
    <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

// ─── Nodo recursivo del árbol ──────────────────────────────
function TreeNode({ node, depth = 0 }) {
    const [open, setOpen] = useState(false); // Todas las carpetas cerradas por defecto

    if (node.type === 'file') {
        return (
            <a
                href={node.link}
                target="_blank"
                rel="noopener noreferrer"
                className="tree-file"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                <span className="tree-icon file-icon"><FileIcon /></span>
                <span className="tree-label file-label">{node.name.replace('.pdf', '')}</span>
                <span className="tree-badge">PDF</span>
            </a>
        );
    }

    return (
        <div className="tree-folder-wrapper">
            <button
                className={`tree-folder ${open ? 'open' : ''}`}
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
                onClick={() => setOpen(!open)}
            >
                <span className="tree-chevron"><ChevronIcon open={open} /></span>
                <span className="tree-icon"><FolderIcon open={open} /></span>
                <span className="tree-label">{node.name}</span>
                {node.children && (
                    <span className="tree-count">{node.children.filter(c => c.type === 'file').length > 0
                        ? `${node.children.filter(c => c.type === 'file').length} factura${node.children.filter(c => c.type === 'file').length !== 1 ? 's' : ''}`
                        : `${node.children.length} carpeta${node.children.length !== 1 ? 's' : ''}`}
                    </span>
                )}
            </button>
            {open && node.children && (
                <div className="tree-children">
                    {node.children.map(child => (
                        <TreeNode key={child.id} node={child} depth={depth + 1} />
                    ))}
                    {node.children.length === 0 && (
                        <p className="tree-empty" style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}>
                            Carpeta vacía
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Estadísticas del árbol ────────────────────────────────
function countFiles(nodes) {
    let count = 0;
    for (const node of nodes) {
        if (node.type === 'file') count++;
        else if (node.children) count += countFiles(node.children);
    }
    return count;
}

// ─── Componente principal ──────────────────────────────────
export default function InvoicesPage() {
    const [tree, setTree] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchTree = async () => {
        setLoading(true);
        setError(null);
        try {
            const url = window.location.hostname === 'localhost'
                ? 'http://localhost:3001/api/drive-files'
                : '/api/drive-files';

            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al cargar las facturas');
            }
            const data = await res.json();
            setTree(data.tree || []);
            setLastUpdated(new Date().toLocaleTimeString('es-ES'));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [processing, setProcessing] = useState(false);
    const [processMsg, setProcessMsg] = useState('');

    const runProcess = async () => {
        setProcessing(true);
        setProcessMsg('');
        try {
            const url = window.location.hostname === 'localhost'
                ? 'http://localhost:3001/api/process'
                : '/api/process';

            const res = await fetch(url, { method: 'POST' });
            const data = await res.json();

            if (data.processed > 0) {
                setProcessMsg(`✅ Se han procesado ${data.processed} facturas.`);
                fetchTree(); // Recargar árbol
            } else if (data.remaining > 0) {
                setProcessMsg(`⚙️ Batch completado. Quedan ${data.remaining} pendientes.`);
            } else {
                setProcessMsg('📭 No había facturas pendientes.');
            }
        } catch (err) {
            setProcessMsg('❌ Error al procesar: ' + err.message);
        } finally {
            setProcessing(false);
            setTimeout(() => setProcessMsg(''), 5000);
        }
    };

    useEffect(() => {
        fetchTree();
    }, []);

    const totalFacturas = countFiles(tree);

    return (
        <div className="invoices-page">
            {/* Header */}
            <div className="invoices-header">
                <div className="invoices-header-left">
                    <h2 className="invoices-title">
                        <span className="invoices-title-icon">📂</span>
                        Facturas Generadas
                    </h2>
                    {lastUpdated && !processMsg && (
                        <p className="invoices-subtitle">Actualizado a las {lastUpdated}</p>
                    )}
                    {processMsg && (
                        <p className="invoices-subtitle" style={{ color: processMsg.startsWith('❌') ? '#f87171' : '#34d399', fontWeight: 'bold' }}>
                            {processMsg}
                        </p>
                    )}
                </div>
                <div className="invoices-header-right">
                    <button
                        className="btn-refresh"
                        onClick={runProcess}
                        disabled={processing || loading}
                        style={{ background: 'var(--accent-color)', color: 'white', border: 'none' }}
                    >
                        {processing ? '⚙️ Procesando...' : '🚀 Procesar Pendientes'}
                    </button>
                    <button className="btn-refresh" onClick={fetchTree} disabled={loading}>
                        <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span>
                        {loading ? ' Cargando...' : ' Actualizar'}
                    </button>
                </div>
            </div>

            {/* Contenido */}
            {loading && (
                <div className="invoices-loading">
                    <div className="loading-spinner" />
                    <p>Conectando con Google Drive...</p>
                </div>
            )}

            {error && (
                <div className="invoices-error">
                    <span>⚠️</span>
                    <div>
                        <strong>Error al cargar</strong>
                        <p>{error}</p>
                    </div>
                    <button onClick={fetchTree} className="btn-retry">Reintentar</button>
                </div>
            )}

            {!loading && !error && tree.length === 0 && (
                <div className="invoices-empty">
                    <span className="empty-icon">📭</span>
                    <h3>No hay facturas todavía</h3>
                    <p>Sube una factura a Google Drive y se organizará automáticamente aquí.</p>
                </div>
            )}

            {!loading && !error && tree.length > 0 && (
                <div className="tree-container">
                    {tree.map(node => (
                        <TreeNode key={node.id} node={node} depth={0} />
                    ))}
                </div>
            )}
        </div>
    );
}
