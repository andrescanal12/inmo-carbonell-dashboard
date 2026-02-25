/**
 * Mapeo de nombres de meses en español a números.
 */
const MESES = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
};

/**
 * Nombres de meses para usarlos en las carpetas (con formato bonito).
 */
const MESES_NOMBRES = {
    '01': '01 - Enero', '02': '02 - Febrero', '03': '03 - Marzo',
    '04': '04 - Abril', '05': '05 - Mayo', '06': '06 - Junio',
    '07': '07 - Julio', '08': '08 - Agosto', '09': '09 - Septiembre',
    '10': '10 - Octubre', '11': '11 - Noviembre', '12': '12 - Diciembre',
};

/**
 * Extrae el año y el mes del campo PERIODO_DE_ARRENDAMIENTO.
 * 
 * Acepta formatos como:
 * - "Febrero 2026"
 * - "febrero de 2026"
 * - "02/2026"
 * - "2026-02"
 * 
 * @param {string} periodo - El periodo de arrendamiento
 * @returns {{ año: string, mesNumero: string, mesNombre: string }}
 */
export function parsePeriodo(periodo) {
    if (!periodo || periodo.trim() === '') {
        throw new Error('PERIODO_DE_ARRENDAMIENTO está vacío, no se puede determinar año y mes');
    }

    const periodoLower = periodo.toLowerCase().trim();

    // Formato: "Mes Año" o "Mes de Año" (ej: "Febrero 2026", "febrero de 2026")
    for (const [mesNombre, mesNum] of Object.entries(MESES)) {
        if (periodoLower.includes(mesNombre)) {
            const añoMatch = periodoLower.match(/\d{4}/);
            if (añoMatch) {
                return {
                    año: añoMatch[0],
                    mesNumero: mesNum,
                    mesNombre: MESES_NOMBRES[mesNum],
                };
            }
        }
    }

    // Formato: "MM/YYYY" (ej: "02/2026")
    const slashMatch = periodoLower.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
        const mesNum = slashMatch[1].padStart(2, '0');
        return {
            año: slashMatch[2],
            mesNumero: mesNum,
            mesNombre: MESES_NOMBRES[mesNum] || mesNum,
        };
    }

    // Formato: "YYYY-MM" (ej: "2026-02")
    const isoMatch = periodoLower.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (isoMatch) {
        const mesNum = isoMatch[2].padStart(2, '0');
        return {
            año: isoMatch[1],
            mesNumero: mesNum,
            mesNombre: MESES_NOMBRES[mesNum] || mesNum,
        };
    }

    throw new Error(
        `No se pudo parsed el periodo "${periodo}".\n` +
        `   Formatos aceptados: "Febrero 2026", "02/2026", "2026-02"`
    );
}

/**
 * Genera el nuevo nombre del archivo PDF.
 * Formato: [direccion] - Factura [factura_numero] - [PERIODO_DE_ARRENDAMIENTO].pdf
 */
export function buildFileName(direccion, facturaNumero, periodo) {
    const parts = [];

    if (direccion && direccion.trim()) {
        parts.push(sanitizeFileName(direccion.trim()));
    } else {
        parts.push('Sin Dirección');
    }

    if (facturaNumero && facturaNumero.trim()) {
        parts.push(`Factura ${sanitizeFileName(facturaNumero.trim())}`);
    } else {
        parts.push('Factura Sin Número');
    }

    if (periodo && periodo.trim()) {
        parts.push(sanitizeFileName(periodo.trim()));
    } else {
        parts.push('Sin Periodo');
    }

    return `${parts.join(' - ')}.pdf`;
}

/**
 * Elimina caracteres no válidos para nombres de archivo.
 */
export function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '') // Caracteres no válidos en Windows
        .replace(/\s+/g, ' ')          // Espacios múltiples → uno solo
        .trim();
}

/**
 * Formatea la hora actual para logs.
 */
export function timestamp() {
    return new Date().toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}
