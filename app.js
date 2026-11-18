(function () {
  'use strict';

  const SENSOR_UNITS = {
    'Nivel de agua': 'm',
    'Pluviómetro': 'mm/h',
    'Caudal': 'm³/s'
  };

  const VALID_NIVELES = ['Bajo', 'Medio', 'Alto'];
  const VALID_ESTADOS_SENSOR = ['Activo', 'Inactivo', 'En mantenimiento', 'Desconectado', 'Baja'];
  const VALID_ESTADOS_ALERTA = ['Activa', 'En análisis', 'Atendida', 'Cerrada', 'Descartada'];

  const STORAGE_KEY = 'sigri_local_state_v1';
  const MSG_CTX_KEY = 'sigri_msg_context';
  const DRAFT_KEY = 'sigri_form_draft';

  // ---------------- FORMATTERS & PARSERS ----------------
  function parseNumero(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
    const s = String(val).trim();
    if (!s) return null;
    let normalized = s;
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function formatDecimals(valor, decimals) {
    return Number(valor).toFixed(decimals).replace('.', ',');
  }

  function formatValorUnidad(valor, unidad) {
    const decimals = unidad === 'm' ? 2 : 1;
    return `${formatDecimals(valor, decimals)} ${unidad}`;
  }

  function formatMeters(meters) {
    const n = Math.round(Number(meters) || 0);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatCoords(lat, lon) {
    return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
  }

  function formatShortDateTime(fechaHora) {
    // '15/11/2026 16:55:00' -> '15/11 16:55'
    const parts = String(fechaHora || '').split(' ');
    if (parts.length < 2) return fechaHora;
    const dmy = parts[0].split('/');
    const hm = parts[1].slice(0, 5);
    return `${dmy[0]}/${dmy[1]} ${hm}`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getQueryParams() {
    return new URLSearchParams(window.location.search);
  }

  function setMsgContext(ctx) {
    sessionStorage.setItem(MSG_CTX_KEY, JSON.stringify(ctx));
  }

  function getMsgContext() {
    try {
      const raw = sessionStorage.getItem(MSG_CTX_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearMsgContext() {
    sessionStorage.removeItem(MSG_CTX_KEY);
  }

  function saveDraft(key, data) {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ key, data }));
  }

  function loadDraft(key) {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.key === key ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
  }

  // ---------------- BADGE BUILDERS ----------------
  function badgeNivelHtml(nivel) {
    const styles = {
      Alto: 'background:#F8DCDC;color:#7A1414;border:1.5px solid transparent',
      Medio: 'background:#FDEBC8;color:#7A3E00;border:1.5px solid transparent',
      Bajo: 'background:#D3F1F8;color:#0B4F63;border:1.5px solid transparent'
    };
    const st = styles[nivel] || styles.Bajo;
    return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;${st};font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(nivel)}</span>`;
  }

  function badgeEstadoSensorHtml(estado) {
    const styles = {
      Activo: 'background:#DCF2E3;color:#14532D;border:1.5px solid transparent',
      'En mantenimiento': 'background:#FDEBC8;color:#7A3E00;border:1.5px solid transparent',
      Desconectado: 'background:#F8DCDC;color:#7A1414;border:1.5px solid transparent',
      Inactivo: 'background:#EAE3D6;color:#524337;border:1.5px solid transparent',
      Baja: 'background:#FFFFFF;color:#524337;border:1.5px solid #8A909C'
    };
    const st = styles[estado] || styles.Inactivo;
    return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;${st};font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(estado)}</span>`;
  }

  function badgeEstadoAlertaHtml(estado) {
    const styles = {
      Activa: 'background:#F8DCDC;color:#7A1414;border:1.5px solid transparent',
      'En análisis': 'background:#FDEBC8;color:#7A3E00;border:1.5px solid transparent',
      Atendida: 'background:#E0F2FE;color:#0369A1;border:1.5px solid transparent',
      Cerrada: 'background:#EAE3D6;color:#524337;border:1.5px solid transparent',
      Descartada: 'background:#FFFFFF;color:#524337;border:1.5px solid #8A909C'
    };
    const st = styles[estado] || styles.Activa;
    return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;${st};font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(estado)}</span>`;
  }

  function badgeOrigenHtml(origen) {
    const st = origen === 'Automática'
      ? 'background:#E0F2FE;color:#0369A1;border:1.5px solid transparent'
      : 'background:#FFFFFF;color:#524337;border:1.5px solid #8A909C';
    return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;${st};font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(origen)}</span>`;
  }

  function badgeEvaluacionHtml(m) {
    if (m.evaluacionTipo === 'alerta') {
      const href = m.alertaCodigo ? `Alertas.html?codigo=${encodeURIComponent(m.alertaCodigo)}` : 'Alertas.html';
      return `<a href="${href}" style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1.5px solid transparent;background:#F8DCDC;color:#7A1414;font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(m.evaluacionTexto)}</a>`;
    }
    if (m.evaluacionTipo === 'ok') {
      return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1.5px solid transparent;background:#DCF2E3;color:#14532D;font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(m.evaluacionTexto)}</span>`;
    }
    return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1.5px solid transparent;background:#EAE3D6;color:#524337;font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(m.evaluacionTexto)}</span>`;
  }

  // ---------------- SVG ICONS ----------------
  const ICONS = {
    link: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    edit: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
    sensor: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 20v-8"/><circle cx="12" cy="9" r="2"/><path d="M7.5 13.5a6.5 6.5 0 0 1 0-9"/><path d="M16.5 4.5a6.5 6.5 0 0 1 0 9"/></svg>',
    refugio: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    alerta: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v5"/><path d="M12 17.6v.1"/></svg>',
    warnLg: '<svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v5"/><path d="M12 17.6v.1"/></svg>'
  };

  // ---------------- LOCAL FALLBACK ENGINE (para file:// sin servidor) ----------------
  function createFallbackSeed() {
    return {
      nextZonaNum: 5,
      nextUmbralNum: 8,
      nextMedicionNum: 9,
      nextAlertNum: 43,
      nextRefugioNum: 4,
      simulacion: {
        activa: true,
        intervaloMinutos: 5,
        fechaISO: '2026-11-15',
        minutosActuales: 17 * 60,
        ultimaEjecucionMinutos: 16 * 60 + 55,
        ultimaEjecucionFechaISO: '2026-11-15'
      },
      zonas: [
        { id: 'Z-001', nombre: 'Arroyo del Gato – Tolosa', descripcion: 'Cuenca baja del arroyo, anegamientos frecuentes', nivelRiesgo: 'Alto', lat: -34.8985, lon: -57.9772, diametro: 2400, radio: 1200 },
        { id: 'Z-002', nombre: 'Arroyo Maldonado – Villa Elvira', descripcion: 'Márgenes del arroyo y calles linderas', nivelRiesgo: 'Medio', lat: -34.9412, lon: -57.9105, diametro: 1800, radio: 900 },
        { id: 'Z-003', nombre: 'Arroyo Pérez – Los Hornos', descripcion: 'Tramo a cielo abierto del arroyo', nivelRiesgo: 'Medio', lat: -34.9430, lon: -57.9838, diametro: 1500, radio: 750 },
        { id: 'Z-004', nombre: 'Casco urbano – Parque Castelli', descripcion: 'Zona baja del casco con desagües exigidos', nivelRiesgo: 'Bajo', lat: -34.9279, lon: -57.9698, diametro: 1000, radio: 500 }
      ],
      sensores: [
        { codigo: 'SN-001', tipo: 'Nivel de agua', unidad: 'm', lat: -34.8971, lon: -57.9790, estado: 'Activo', zonasIds: ['Z-001'], ultimaMedicion: { valor: 2.84, fechaHora: '15/11/2026 16:55:00' } },
        { codigo: 'SN-002', tipo: 'Pluviómetro', unidad: 'mm/h', lat: -34.9040, lon: -57.9700, estado: 'Activo', zonasIds: ['Z-001'], ultimaMedicion: { valor: 38.5, fechaHora: '15/11/2026 16:55:00' } },
        { codigo: 'SN-003', tipo: 'Caudal', unidad: 'm³/s', lat: -34.8930, lon: -57.9850, estado: 'En mantenimiento', zonasIds: ['Z-001'], ultimaMedicion: { valor: 19.4, fechaHora: '14/11/2026 08:15:00' } },
        { codigo: 'SN-004', tipo: 'Nivel de agua', unidad: 'm', lat: -34.9420, lon: -57.9092, estado: 'Activo', zonasIds: ['Z-002'], ultimaMedicion: { valor: 1.62, fechaHora: '15/11/2026 16:55:00' } },
        { codigo: 'SN-005', tipo: 'Pluviómetro', unidad: 'mm/h', lat: -34.9370, lon: -57.9160, estado: 'Desconectado', zonasIds: ['Z-002'], ultimaMedicion: { valor: 21.0, fechaHora: '15/11/2026 11:40:00' } },
        { codigo: 'SN-006', tipo: 'Nivel de agua', unidad: 'm', lat: -34.9440, lon: -57.9851, estado: 'Activo', zonasIds: ['Z-003'], ultimaMedicion: { valor: 1.95, fechaHora: '15/11/2026 16:55:00' } },
        { codigo: 'SN-007', tipo: 'Pluviómetro', unidad: 'mm/h', lat: -34.9275, lon: -57.9702, estado: 'Inactivo', zonasIds: ['Z-004'], ultimaMedicion: null },
        { codigo: 'SN-008', tipo: 'Caudal', unidad: 'm³/s', lat: -34.9150, lon: -57.9480, estado: 'Activo', zonasIds: [], ultimaMedicion: { valor: 9.4, fechaHora: '15/11/2026 16:55:00' } },
        { codigo: 'SN-009', tipo: 'Nivel de agua', unidad: 'm', lat: -34.9210, lon: -57.9300, estado: 'Baja', zonasIds: [], ultimaMedicion: null }
      ],
      umbrales: [
        { id: 'U-001', zonaId: 'Z-001', tipo: 'Nivel de agua', minimo: null, maximo: 2.50, nivelAlerta: 'Alto' },
        { id: 'U-002', zonaId: 'Z-001', tipo: 'Pluviómetro', minimo: null, maximo: 30.0, nivelAlerta: 'Medio' },
        { id: 'U-003', zonaId: 'Z-001', tipo: 'Caudal', minimo: 2.0, maximo: 18.0, nivelAlerta: 'Alto' },
        { id: 'U-004', zonaId: 'Z-002', tipo: 'Nivel de agua', minimo: null, maximo: 2.20, nivelAlerta: 'Alto' },
        { id: 'U-005', zonaId: 'Z-002', tipo: 'Pluviómetro', minimo: null, maximo: 35.0, nivelAlerta: 'Medio' },
        { id: 'U-006', zonaId: 'Z-003', tipo: 'Nivel de agua', minimo: null, maximo: 1.80, nivelAlerta: 'Medio' },
        { id: 'U-007', zonaId: 'Z-004', tipo: 'Pluviómetro', minimo: null, maximo: 40.0, nivelAlerta: 'Bajo' }
      ],
      mediciones: [
        { id: 'M-008', fechaHora: '15/11/2026 16:55:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-001', tipo: 'Nivel de agua', zonaNombre: 'Arroyo del Gato – Tolosa', valor: 2.84, unidad: 'm', origen: 'Automática', evaluacionTipo: 'alerta', alertaCodigo: 'A-0042', evaluacionTexto: 'Generó alerta A-0042' },
        { id: 'M-007', fechaHora: '15/11/2026 16:55:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-002', tipo: 'Pluviómetro', zonaNombre: 'Arroyo del Gato – Tolosa', valor: 38.5, unidad: 'mm/h', origen: 'Automática', evaluacionTipo: 'alerta', alertaCodigo: 'A-0041', evaluacionTexto: 'Generó alerta A-0041' },
        { id: 'M-006', fechaHora: '15/11/2026 16:55:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-004', tipo: 'Nivel de agua', zonaNombre: 'Arroyo Maldonado – Villa Elvira', valor: 1.62, unidad: 'm', origen: 'Automática', evaluacionTipo: 'ok', alertaCodigo: null, evaluacionTexto: 'Dentro de umbral' },
        { id: 'M-005', fechaHora: '15/11/2026 16:55:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-006', tipo: 'Nivel de agua', zonaNombre: 'Arroyo Pérez – Los Hornos', valor: 1.95, unidad: 'm', origen: 'Automática', evaluacionTipo: 'alerta', alertaCodigo: 'A-0040', evaluacionTexto: 'Generó alerta A-0040' },
        { id: 'M-004', fechaHora: '15/11/2026 16:55:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-008', tipo: 'Caudal', zonaNombre: 'Sin zona asociada', valor: 9.4, unidad: 'm³/s', origen: 'Automática', evaluacionTipo: 'sin_umbral', alertaCodigo: null, evaluacionTexto: 'Sin umbral definido' },
        { id: 'M-003', fechaHora: '15/11/2026 16:50:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-001', tipo: 'Nivel de agua', zonaNombre: 'Arroyo del Gato – Tolosa', valor: 2.41, unidad: 'm', origen: 'Automática', evaluacionTipo: 'ok', alertaCodigo: null, evaluacionTexto: 'Dentro de umbral' },
        { id: 'M-002', fechaHora: '15/11/2026 16:50:00', fechaISO: '2026-11-15', sensorCodigo: 'SN-002', tipo: 'Pluviómetro', zonaNombre: 'Arroyo del Gato – Tolosa', valor: 27.9, unidad: 'mm/h', origen: 'Automática', evaluacionTipo: 'ok', alertaCodigo: null, evaluacionTexto: 'Dentro de umbral' },
        { id: 'M-001', fechaHora: '15/11/2026 16:42:30', fechaISO: '2026-11-15', sensorCodigo: 'SN-004', tipo: 'Nivel de agua', zonaNombre: 'Arroyo Maldonado – Villa Elvira', valor: 1.70, unidad: 'm', origen: 'Manual', evaluacionTipo: 'ok', alertaCodigo: null, evaluacionTexto: 'Dentro de umbral' }
      ],
      alertas: [
        { codigo: 'A-0042', fechaHora: '15/11/2026 16:55', fechaISO: '2026-11-15', nivel: 'Alto', zonaId: 'Z-001', zonaNombre: 'Arroyo del Gato – Tolosa', condicion: 'Nivel de agua supera el máximo de 2,50 m', detalleCorto: 'nivel de agua 2,84 m, supera el máximo de 2,50 m', sensorCodigo: 'SN-001', valor: 2.84, unidad: 'm', estado: 'Activa' },
        { codigo: 'A-0041', fechaHora: '15/11/2026 16:55', fechaISO: '2026-11-15', nivel: 'Medio', zonaId: 'Z-001', zonaNombre: 'Arroyo del Gato – Tolosa', condicion: 'Lluvia supera el máximo de 30,0 mm/h', detalleCorto: 'lluvia 38,5 mm/h, supera el máximo de 30,0 mm/h', sensorCodigo: 'SN-002', valor: 38.5, unidad: 'mm/h', estado: 'Activa' },
        { codigo: 'A-0040', fechaHora: '15/11/2026 16:55', fechaISO: '2026-11-15', nivel: 'Medio', zonaId: 'Z-003', zonaNombre: 'Arroyo Pérez – Los Hornos', condicion: 'Nivel de agua supera el máximo de 1,80 m', detalleCorto: 'nivel de agua 1,95 m, supera el máximo de 1,80 m', sensorCodigo: 'SN-006', valor: 1.95, unidad: 'm', estado: 'Activa' },
        { codigo: 'A-0039', fechaHora: '14/11/2026 22:10', fechaISO: '2026-11-14', nivel: 'Alto', zonaId: 'Z-002', zonaNombre: 'Arroyo Maldonado – Villa Elvira', condicion: 'Nivel de agua supera el máximo de 2,20 m', detalleCorto: 'nivel de agua 2,31 m, supera el máximo de 2,20 m', sensorCodigo: 'SN-004', valor: 2.31, unidad: 'm', estado: 'Atendida' },
        { codigo: 'A-0038', fechaHora: '14/11/2026 08:15', fechaISO: '2026-11-14', nivel: 'Alto', zonaId: 'Z-001', zonaNombre: 'Arroyo del Gato – Tolosa', condicion: 'Caudal supera el máximo de 18,0 m³/s', detalleCorto: 'caudal 19,4 m³/s, supera el máximo de 18,0 m³/s', sensorCodigo: 'SN-003', valor: 19.4, unidad: 'm³/s', estado: 'Cerrada' },
        { codigo: 'A-0037', fechaHora: '13/11/2026 17:40', fechaISO: '2026-11-13', nivel: 'Medio', zonaId: 'Z-001', zonaNombre: 'Arroyo del Gato – Tolosa', condicion: 'Lluvia supera el máximo de 30,0 mm/h', detalleCorto: 'lluvia 31,2 mm/h, supera el máximo de 30,0 mm/h', sensorCodigo: 'SN-002', valor: 31.2, unidad: 'mm/h', estado: 'Descartada' },
        { codigo: 'A-0036', fechaHora: '13/11/2026 09:05', fechaISO: '2026-11-13', nivel: 'Medio', zonaId: 'Z-003', zonaNombre: 'Arroyo Pérez – Los Hornos', condicion: 'Nivel de agua supera el máximo de 1,80 m', detalleCorto: 'nivel de agua 1,88 m, supera el máximo de 1,80 m', sensorCodigo: 'SN-006', valor: 1.88, unidad: 'm', estado: 'En análisis' }
      ],
      refugios: [
        { id: 'R-001', nombre: 'Polideportivo Tolosa', descripcion: 'Gimnasio cubierto con sanitarios y cocina', lat: -34.9085, lon: -57.9540 },
        { id: 'R-002', nombre: 'Club Social Villa Elvira', descripcion: 'Salón principal en planta alta', lat: -34.9335, lon: -57.9263 },
        { id: 'R-003', nombre: 'Centro Comunitario Los Hornos', descripcion: 'Dos salones con acceso sin escalones', lat: -34.9395, lon: -57.9640 }
      ]
    };
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const seed = createFallbackSeed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  function saveLocalState(st) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 10) * 10;
  }

  function localFormatDateISO(fechaISO) {
    const [y, m, d] = fechaISO.split('-');
    return `${d}/${m}/${y}`;
  }

  function localFormatHHMM(mins) {
    const m = ((mins % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  function localGetSimView(st) {
    const s = st.simulacion;
    let proxMin = s.ultimaEjecucionMinutos + s.intervaloMinutos;
    if (proxMin <= s.minutosActuales && s.fechaISO === s.ultimaEjecucionFechaISO) {
      proxMin = s.minutosActuales + s.intervaloMinutos;
    }
    return {
      activa: s.activa,
      intervaloMinutos: s.intervaloMinutos,
      fechaISO: s.fechaISO,
      relojSistema: `${localFormatDateISO(s.fechaISO)} · ${localFormatHHMM(s.minutosActuales)}`,
      ultimaEjecucion: `${localFormatDateISO(s.ultimaEjecucionFechaISO)} ${localFormatHHMM(s.ultimaEjecucionMinutos)}`,
      proximaEjecucion: localFormatHHMM(proxMin)
    };
  }

  function localBuildEnriched(st) {
    const zonaMap = new Map(st.zonas.map((z) => [z.id, z]));
    return {
      simulacion: localGetSimView(st),
      resumen: {
        zonasTotal: st.zonas.length,
        sensoresTotal: st.sensores.length,
        sensoresActivos: st.sensores.filter((s) => s.estado === 'Activo').length,
        alertasActivas: st.alertas.filter((a) => a.estado === 'Activa').length,
        refugiosTotal: st.refugios.length
      },
      zonas: st.zonas.map((z) => ({
        ...z,
        sensoresCount: st.sensores.filter((s) => s.zonasIds.includes(z.id)).length,
        umbralesCount: st.umbrales.filter((u) => u.zonaId === z.id).length,
        alertasActivasCount: st.alertas.filter((a) => a.zonaId === z.id && a.estado === 'Activa').length
      })),
      sensores: st.sensores.map((s) => ({
        ...s,
        zonasNombres: s.zonasIds.map((id) => zonaMap.get(id)?.nombre).filter(Boolean)
      })),
      umbrales: st.umbrales.map((u) => ({
        ...u,
        zonaNombre: zonaMap.get(u.zonaId)?.nombre || 'Zona eliminada',
        unidad: SENSOR_UNITS[u.tipo] || ''
      })),
      mediciones: st.mediciones,
      alertas: st.alertas,
      refugios: st.refugios
    };
  }

  function localEvalMedicion(st, sensor, valorNum, origen, fechaISO, hhmm) {
    const fechaStr = localFormatDateISO(fechaISO);
    const fechaHoraCompleta = `${fechaStr} ${hhmm}:00`;
    const fechaHoraCorta = `${fechaStr} ${hhmm}`;
    sensor.ultimaMedicion = { valor: valorNum, fechaHora: fechaHoraCompleta };
    const zonasAsociadas = st.zonas.filter((z) => sensor.zonasIds.includes(z.id));
    const zonaNombre = zonasAsociadas.length ? zonasAsociadas.map((z) => z.nombre).join(', ') : 'Sin zona asociada';
    const labels = sensor.tipo === 'Pluviómetro'
      ? { cap: 'Lluvia', lower: 'lluvia' }
      : sensor.tipo === 'Caudal'
        ? { cap: 'Caudal', lower: 'caudal' }
        : { cap: 'Nivel de agua', lower: 'nivel de agua' };

    let huboUmbral = false;
    const alertasGeneradas = [];

    for (const zona of zonasAsociadas) {
      const umbs = st.umbrales.filter((u) => u.zonaId === zona.id && u.tipo === sensor.tipo);
      if (umbs.length) huboUmbral = true;
      for (const u of umbs) {
        let excedido = false;
        let condicion = '';
        let detalleCorto = '';
        if (u.maximo !== null && valorNum > u.maximo) {
          excedido = true;
          condicion = `${labels.cap} supera el máximo de ${formatValorUnidad(u.maximo, sensor.unidad)}`;
          detalleCorto = `${labels.lower} ${formatValorUnidad(valorNum, sensor.unidad)}, supera el máximo de ${formatValorUnidad(u.maximo, sensor.unidad)}`;
        } else if (u.minimo !== null && valorNum < u.minimo) {
          excedido = true;
          condicion = `${labels.cap} por debajo del mínimo de ${formatValorUnidad(u.minimo, sensor.unidad)}`;
          detalleCorto = `${labels.lower} ${formatValorUnidad(valorNum, sensor.unidad)}, inferior al mínimo de ${formatValorUnidad(u.minimo, sensor.unidad)}`;
        }
        if (excedido) {
          const codigoAlerta = `A-${String(st.nextAlertNum++).padStart(4, '0')}`;
          const nueva = {
            codigo: codigoAlerta, fechaHora: fechaHoraCorta, fechaISO, nivel: u.nivelAlerta,
            zonaId: zona.id, zonaNombre: zona.nombre, condicion, detalleCorto,
            sensorCodigo: sensor.codigo, valor: valorNum, unidad: sensor.unidad,
            estado: 'Activa', umbralMaximo: u.maximo, umbralMinimo: u.minimo
          };
          st.alertas.unshift(nueva);
          alertasGeneradas.push(nueva);
        }
      }
    }

    let evaluacionTipo = 'sin_umbral';
    let alertaCodigo = null;
    let evaluacionTexto = 'Sin umbral definido';
    if (alertasGeneradas.length) {
      evaluacionTipo = 'alerta';
      alertaCodigo = alertasGeneradas[0].codigo;
      evaluacionTexto = alertasGeneradas.length === 1
        ? `Generó alerta ${alertaCodigo}`
        : `Generó ${alertasGeneradas.length} alertas (${alertasGeneradas.map((a) => a.codigo).join(', ')})`;
    } else if (huboUmbral) {
      evaluacionTipo = 'ok';
      evaluacionTexto = 'Dentro de umbral';
    }

    const medicion = {
      id: `M-${String(st.nextMedicionNum++).padStart(3, '0')}`,
      fechaHora: fechaHoraCompleta, fechaISO, sensorCodigo: sensor.codigo, tipo: sensor.tipo,
      zonaNombre, valor: valorNum, unidad: sensor.unidad, origen, evaluacionTipo, alertaCodigo, evaluacionTexto
    };
    st.mediciones.unshift(medicion);
    return { medicion, alertasGeneradas };
  }

  function localAdvanceClock(st, delta) {
    let total = st.simulacion.minutosActuales + delta;
    const days = Math.floor(total / 1440);
    if (days > 0) {
      const [y, m, d] = st.simulacion.fechaISO.split('-').map(Number);
      st.simulacion.fechaISO = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
      total = total % 1440;
    }
    st.simulacion.minutosActuales = total;
  }

  function localApiHandle(method, apiPath, body) {
    const st = loadLocalState();
    const fail = (status, data) => {
      const err = new Error(data.detail || data.error || 'Error');
      err.status = status;
      err.payload = data;
      throw err;
    };

    if (method === 'GET' && apiPath === '/api/estado') return localBuildEnriched(st);
    if (method === 'POST' && apiPath === '/api/reset') {
      const fresh = createFallbackSeed();
      saveLocalState(fresh);
      return { ok: true, estado: localBuildEnriched(fresh) };
    }
    if (method === 'GET' && apiPath === '/api/zonas') return localBuildEnriched(st).zonas;

    let m;
    if ((m = apiPath.match(/^\/api\/zonas\/([^/]+)\/sensores$/))) {
      const zona = st.zonas.find((z) => z.id === decodeURIComponent(m[1]));
      if (!zona) fail(404, { error: 'Zona no encontrada' });
      if (method === 'GET') {
        const sensores = st.sensores.filter((s) => s.estado !== 'Baja').map((s) => {
          const dist = haversineMeters(zona.lat, zona.lon, s.lat, s.lon);
          return { ...s, distanciaMetros: dist, dentroDeZona: dist <= zona.radio, asociado: s.zonasIds.includes(zona.id) };
        }).sort((a, b) => a.distanciaMetros - b.distanciaMetros);
        return { zona, sensores };
      }
      if (method === 'PUT') {
        const setC = new Set(body.sensoresCodigos || []);
        for (const s of st.sensores) {
          if (setC.has(s.codigo)) { if (!s.zonasIds.includes(zona.id)) s.zonasIds.push(zona.id); }
          else { s.zonasIds = s.zonasIds.filter((id) => id !== zona.id); }
        }
        saveLocalState(st);
        return { ok: true };
      }
    }

    if ((m = apiPath.match(/^\/api\/zonas\/([^/]+)$/))) {
      const zId = decodeURIComponent(m[1]);
      const idx = st.zonas.findIndex((z) => z.id === zId);
      if (idx === -1) fail(404, { error: 'Zona no encontrada' });
      if (method === 'GET') return localBuildEnriched(st).zonas.find((z) => z.id === zId);
      if (method === 'DELETE') {
        const del = st.zonas.splice(idx, 1)[0];
        st.sensores.forEach((s) => { s.zonasIds = s.zonasIds.filter((id) => id !== zId); });
        st.umbrales = st.umbrales.filter((u) => u.zonaId !== zId);
        saveLocalState(st);
        return { ok: true, deleted: del };
      }
      if (method === 'PUT') {
        const nombre = String(body.nombre || '').trim();
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);
        const diam = parseNumero(body.diametro);
        if (!nombre) fail(400, { title: 'Nombre requerido', detail: 'Ingresá un nombre para la zona de riesgo.' });
        if (diam === null || Number.isNaN(diam) || diam <= 0) fail(400, { title: 'Diámetro no válido', detail: 'El diámetro de la zona tiene que ser mayor a 0 metros. Revisalo e ingresalo de nuevo.' });
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Coordenadas no válidas', detail: 'Ingresá valores numéricos válidos para latitud y longitud.' });
        st.zonas[idx] = { ...st.zonas[idx], nombre, descripcion: String(body.descripcion || '').trim(), nivelRiesgo: VALID_NIVELES.includes(body.nivelRiesgo) ? body.nivelRiesgo : st.zonas[idx].nivelRiesgo, lat, lon, diametro: Math.round(diam), radio: Math.round(diam / 2) };
        st.alertas.forEach((a) => { if (a.zonaId === zId) a.zonaNombre = nombre; });
        saveLocalState(st);
        return st.zonas[idx];
      }
    }

    if (method === 'POST' && apiPath === '/api/zonas') {
      const nombre = String(body.nombre || '').trim();
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);
      const diam = parseNumero(body.diametro);
      if (!nombre) fail(400, { title: 'Nombre requerido', detail: 'Ingresá un nombre para la zona de riesgo.' });
      if (diam === null || Number.isNaN(diam) || diam <= 0) fail(400, { title: 'Diámetro no válido', detail: 'El diámetro de la zona tiene que ser mayor a 0 metros. Revisalo e ingresalo de nuevo.' });
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Coordenadas no válidas', detail: 'Ingresá valores numéricos válidos para latitud y longitud.' });
      const nz = { id: `Z-${String(st.nextZonaNum++).padStart(3, '0')}`, nombre, descripcion: String(body.descripcion || '').trim(), nivelRiesgo: VALID_NIVELES.includes(body.nivelRiesgo) ? body.nivelRiesgo : 'Medio', lat, lon, diametro: Math.round(diam), radio: Math.round(diam / 2) };
      st.zonas.push(nz);
      saveLocalState(st);
      return nz;
    }

    if (method === 'GET' && apiPath === '/api/sensores') return localBuildEnriched(st).sensores;
    if (method === 'POST' && apiPath === '/api/sensores') {
      const codigo = String(body.codigo || '').trim().toUpperCase();
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);
      if (!codigo) fail(400, { title: 'Código no válido', detail: 'Ingresá un código identificador para el sensor.' });
      if (st.sensores.some((s) => s.codigo.toUpperCase() === codigo)) fail(409, { title: 'No se pudo registrar el sensor', codigo, detail: `Ya existe un sensor con el código ${codigo}. Ingresá un código distinto para continuar.` });
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Ubicación no válida', detail: 'Ingresá coordenadas numéricas válidas.' });
      const ns = { codigo, tipo: SENSOR_UNITS[body.tipo] ? body.tipo : 'Nivel de agua', unidad: SENSOR_UNITS[body.tipo] || 'm', lat, lon, estado: VALID_ESTADOS_SENSOR.includes(body.estado) ? body.estado : 'Activo', zonasIds: [], ultimaMedicion: null };
      st.sensores.push(ns);
      saveLocalState(st);
      return ns;
    }
    if ((m = apiPath.match(/^\/api\/sensores\/([^/]+)$/))) {
      const cod = decodeURIComponent(m[1]).toUpperCase();
      const idx = st.sensores.findIndex((s) => s.codigo.toUpperCase() === cod);
      if (idx === -1) fail(404, { error: 'Sensor no encontrado' });
      if (method === 'GET') return localBuildEnriched(st).sensores.find((s) => s.codigo.toUpperCase() === cod);
      if (method === 'DELETE') { const del = st.sensores.splice(idx, 1)[0]; saveLocalState(st); return { ok: true, deleted: del }; }
      if (method === 'PUT') {
        const nuevoCodigo = String(body.codigo || cod).trim().toUpperCase();
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);
        if (!nuevoCodigo) fail(400, { title: 'Código no válido', detail: 'Ingresá un código identificador.' });
        if (nuevoCodigo !== cod && st.sensores.some((s) => s.codigo.toUpperCase() === nuevoCodigo)) fail(409, { title: 'No se pudo actualizar el sensor', codigo: nuevoCodigo, detail: `Ya existe un sensor con el código ${nuevoCodigo}. Ingresá un código distinto para continuar.` });
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Ubicación no válida', detail: 'Ingresá coordenadas numéricas válidas.' });
        const tipo = SENSOR_UNITS[body.tipo] ? body.tipo : st.sensores[idx].tipo;
        st.sensores[idx] = { ...st.sensores[idx], codigo: nuevoCodigo, tipo, unidad: SENSOR_UNITS[tipo], lat, lon, estado: VALID_ESTADOS_SENSOR.includes(body.estado) ? body.estado : st.sensores[idx].estado };
        saveLocalState(st);
        return st.sensores[idx];
      }
    }

    if (method === 'GET' && apiPath === '/api/umbrales') return localBuildEnriched(st).umbrales;
    if (method === 'POST' && apiPath === '/api/umbrales') {
      const min = parseNumero(body.minimo);
      const max = parseNumero(body.maximo);
      if (Number.isNaN(min) || Number.isNaN(max) || (min === null && max === null)) fail(400, { title: 'Valores de umbral requeridos', detail: 'Tenés que definir un valor mínimo, un valor máximo o ambos.' });
      if ((min !== null && min < 0) || (max !== null && max <= 0)) fail(400, { title: 'Valores de umbral no válidos', detail: 'Los límites no pueden ser negativos y el máximo debe ser mayor a 0.' });
      if (min !== null && max !== null && min >= max) fail(400, { title: 'Rango de umbral no válido', detail: 'El valor mínimo tiene que ser menor al valor máximo configurado.' });
      const nu = { id: `U-${String(st.nextUmbralNum++).padStart(3, '0')}`, zonaId: body.zonaId, tipo: body.tipo, minimo: min, maximo: max, nivelAlerta: VALID_NIVELES.includes(body.nivelAlerta) ? body.nivelAlerta : 'Medio' };
      st.umbrales.push(nu);
      saveLocalState(st);
      return nu;
    }
    if ((m = apiPath.match(/^\/api\/umbrales\/([^/]+)$/))) {
      const uid = decodeURIComponent(m[1]);
      const idx = st.umbrales.findIndex((u) => u.id === uid);
      if (idx === -1) fail(404, { error: 'Umbral no encontrado' });
      if (method === 'GET') return localBuildEnriched(st).umbrales.find((u) => u.id === uid);
      if (method === 'DELETE') { const del = st.umbrales.splice(idx, 1)[0]; saveLocalState(st); return { ok: true, deleted: del }; }
      if (method === 'PUT') {
        const min = parseNumero(body.minimo);
        const max = parseNumero(body.maximo);
        if (Number.isNaN(min) || Number.isNaN(max) || (min === null && max === null)) fail(400, { title: 'Valores de umbral requeridos', detail: 'Tenés que definir un valor mínimo, un valor máximo o ambos.' });
        if ((min !== null && min < 0) || (max !== null && max <= 0)) fail(400, { title: 'Valores de umbral no válidos', detail: 'Los límites no pueden ser negativos y el máximo debe ser mayor a 0.' });
        if (min !== null && max !== null && min >= max) fail(400, { title: 'Rango de umbral no válido', detail: 'El valor mínimo tiene que ser menor al valor máximo configurado.' });
        st.umbrales[idx] = { ...st.umbrales[idx], zonaId: body.zonaId, tipo: body.tipo, minimo: min, maximo: max, nivelAlerta: VALID_NIVELES.includes(body.nivelAlerta) ? body.nivelAlerta : st.umbrales[idx].nivelAlerta };
        saveLocalState(st);
        return st.umbrales[idx];
      }
    }

    if (method === 'GET' && apiPath === '/api/mediciones') return { simulacion: localGetSimView(st), mediciones: st.mediciones };
    if (method === 'POST' && apiPath === '/api/mediciones') {
      const sensor = st.sensores.find((s) => s.codigo.toUpperCase() === String(body.sensorCodigo || '').toUpperCase());
      const valor = parseNumero(body.valor);
      if (!sensor) fail(404, { title: 'Sensor no encontrado', detail: 'Seleccioná un sensor válido.' });
      if (valor === null || Number.isNaN(valor) || valor < 0) fail(400, { title: 'Valor medido no válido', detail: 'El valor de la medición debe ser un número mayor o igual a 0.' });
      const valRed = sensor.unidad === 'm' ? Number(valor.toFixed(2)) : Number(valor.toFixed(1));
      const res = localEvalMedicion(st, sensor, valRed, 'Manual', st.simulacion.fechaISO, localFormatHHMM(st.simulacion.minutosActuales));
      localAdvanceClock(st, 1);
      saveLocalState(st);
      return { medicion: res.medicion, alertasGeneradas: res.alertasGeneradas, simulacion: localGetSimView(st) };
    }
    if (method === 'POST' && apiPath === '/api/mediciones/simular') {
      const activos = st.sensores.filter((s) => s.estado === 'Activo');
      const hhmm = localFormatHHMM(st.simulacion.minutosActuales);
      const medGen = [];
      const altGen = [];
      for (const s of activos) {
        const base = s.ultimaMedicion ? s.ultimaMedicion.valor : (s.tipo === 'Nivel de agua' ? 1.5 : s.tipo === 'Pluviómetro' ? 22 : 10);
        const val = s.tipo === 'Nivel de agua'
          ? Number(Math.max(0.25, base + (Math.random() - 0.45) * 0.45).toFixed(2))
          : s.tipo === 'Pluviómetro'
            ? Number(Math.max(0, base + (Math.random() - 0.45) * 8).toFixed(1))
            : Number(Math.max(0.5, base + (Math.random() - 0.45) * 3.5).toFixed(1));
        const r = localEvalMedicion(st, s, val, 'Automática', st.simulacion.fechaISO, hhmm);
        medGen.push(r.medicion);
        altGen.push(...r.alertasGeneradas);
      }
      st.simulacion.ultimaEjecucionMinutos = st.simulacion.minutosActuales;
      st.simulacion.ultimaEjecucionFechaISO = st.simulacion.fechaISO;
      localAdvanceClock(st, st.simulacion.intervaloMinutos);
      saveLocalState(st);
      return { sensoresSimulados: activos.length, medicionesGeneradas: medGen, alertasGeneradas: altGen, simulacion: localGetSimView(st) };
    }
    if (method === 'PATCH' && apiPath === '/api/simulacion') {
      if (typeof body.activa === 'boolean') st.simulacion.activa = body.activa;
      saveLocalState(st);
      return localGetSimView(st);
    }

    if (method === 'GET' && apiPath === '/api/alertas') return st.alertas;
    if ((m = apiPath.match(/^\/api\/alertas\/([^/]+)$/))) {
      const cod = decodeURIComponent(m[1]).toUpperCase();
      const alerta = st.alertas.find((a) => a.codigo.toUpperCase() === cod);
      if (!alerta) fail(404, { error: 'Alerta no encontrada' });
      if (method === 'GET') return alerta;
      if (method === 'PATCH') {
        if (!VALID_ESTADOS_ALERTA.includes(body.estado)) fail(400, { title: 'Estado no válido', detail: 'Seleccioná un estado válido.' });
        alerta.estado = body.estado;
        saveLocalState(st);
        return alerta;
      }
    }

    if (method === 'GET' && apiPath === '/api/refugios') return st.refugios;
    if (method === 'POST' && apiPath === '/api/refugios') {
      const nombre = String(body.nombre || '').trim();
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);
      if (!nombre) fail(400, { title: 'Nombre requerido', detail: 'Ingresá un nombre para el refugio.' });
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Ubicación no válida', detail: 'Ingresá coordenadas numéricas válidas.' });
      const nr = { id: `R-${String(st.nextRefugioNum++).padStart(3, '0')}`, nombre, descripcion: String(body.descripcion || '').trim(), lat, lon };
      st.refugios.push(nr);
      saveLocalState(st);
      return nr;
    }
    if ((m = apiPath.match(/^\/api\/refugios\/([^/]+)$/))) {
      const rid = decodeURIComponent(m[1]);
      const idx = st.refugios.findIndex((r) => r.id === rid);
      if (idx === -1) fail(404, { error: 'Refugio no encontrado' });
      if (method === 'GET') return st.refugios[idx];
      if (method === 'DELETE') { const del = st.refugios.splice(idx, 1)[0]; saveLocalState(st); return { ok: true, deleted: del }; }
      if (method === 'PUT') {
        const nombre = String(body.nombre || '').trim();
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);
        if (!nombre) fail(400, { title: 'Nombre requerido', detail: 'Ingresá un nombre para el refugio.' });
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) fail(400, { title: 'Ubicación no válida', detail: 'Ingresá coordenadas numéricas válidas.' });
        st.refugios[idx] = { ...st.refugios[idx], nombre, descripcion: String(body.descripcion || '').trim(), lat, lon };
        saveLocalState(st);
        return st.refugios[idx];
      }
    }

    fail(404, { error: 'Endpoint no encontrado' });
  }

  async function apiRequest(method, path, body) {
    if (window.location.protocol === 'file:') {
      return localApiHandle(method, path, body || {});
    }
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== undefined && method !== 'GET') {
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(path, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.detail || data.error || 'Error en la solicitud');
        err.status = res.status;
        err.payload = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err && typeof err.status === 'number') throw err;
      // Fallback local si no hay servidor escuchando
      return localApiHandle(method, path, body || {});
    }
  }

  // ---------------- SHARED UI HELPERS ----------------
  function updateHeaderClock(simulacion) {
    if (!simulacion) return;
    const header = document.querySelector('main header');
    if (!header) return;
    const spans = header.querySelectorAll('span');
    for (let i = 0; i < spans.length - 1; i++) {
      if (spans[i].textContent.trim() === 'Fecha y hora') {
        spans[i + 1].textContent = simulacion.relojSistema;
        break;
      }
    }
  }

  function showConfirmModal({ titulo, pregunta, detalle, textoConfirmar, onConfirm }) {
    const existing = document.getElementById('sigri-dynamic-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sigri-dynamic-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;padding:24px;box-sizing:border-box;background:rgba(42,27,18,0.72);display:flex;align-items:center;justify-content:center;font-family:"Manrope",system-ui,sans-serif;color:#2B1D14;font-size:15px;line-height:1.4';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" style="width:640px;max-width:100%;box-sizing:border-box;background:#FFFFFF;border-radius:28px;border-top:8px solid #0284C7;padding:32px 36px 36px;display:flex;flex-direction:column;gap:18px;box-shadow:0 24px 60px rgba(45,29,19,0.35)">
        <div style="display:flex;flex-direction:column;gap:2px"><h2 style="margin:0;font-size:26px;font-weight:800;letter-spacing:-0.01em">${escapeHtml(titulo)}</h2></div>
        <div style="display:flex;gap:20px;align-items:center">
          <div style="flex:0 0 84px;height:84px;border-radius:50%;background:#B45309;color:#FFFFFF;display:flex;align-items:center;justify-content:center">${ICONS.warnLg}</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <span style="font-size:20px;font-weight:800">${escapeHtml(pregunta)}</span>
            <span style="color:#524337;font-size:16px">${escapeHtml(detalle)}</span>
          </div>
        </div>
        <div style="display:flex;gap:14px;margin-top:6px">
          <button type="button" data-action="cancel" style="flex:1 1 0;height:60px;border:none;border-radius:16px;font-family:'Manrope',system-ui,sans-serif;font-size:17px;font-weight:800;background:#EAE3D6;color:#2B1D14;cursor:pointer">No, volver</button>
          <button type="button" data-action="confirm" style="flex:1 1 0;height:60px;border:none;border-radius:16px;font-family:'Manrope',system-ui,sans-serif;font-size:17px;font-weight:800;background:#8B1A1A;color:#FFFFFF;cursor:pointer">${escapeHtml(textoConfirmar)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', async () => {
      await onConfirm();
      close();
    });
  }

  function showWarningModal({ titulo, mensaje }) {
    const existing = document.getElementById('sigri-dynamic-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'sigri-dynamic-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;padding:24px;box-sizing:border-box;background:rgba(42,27,18,0.72);display:flex;align-items:center;justify-content:center;font-family:"Manrope",system-ui,sans-serif;color:#2B1D14;font-size:15px;line-height:1.4';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" style="width:560px;max-width:100%;box-sizing:border-box;background:#FFFFFF;border-radius:28px;border-top:8px solid #B45309;padding:32px 36px 36px;display:flex;flex-direction:column;gap:18px;box-shadow:0 24px 60px rgba(45,29,19,0.35)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
          <div style="width:84px;height:84px;border-radius:50%;background:#B45309;color:#FFFFFF;display:flex;align-items:center;justify-content:center">${ICONS.warnLg}</div>
          <span style="display:inline-flex;align-items:center;height:28px;padding:0 14px;border-radius:999px;background:#FDEBC8;color:#7A3E00;font-size:13px;font-weight:800;letter-spacing:0.1em">ADVERTENCIA</span>
          <h2 style="margin:0;font-size:24px;font-weight:800">${escapeHtml(titulo)}</h2>
          <p style="margin:0;color:#524337;font-size:16px">${escapeHtml(mensaje)}</p>
        </div>
        <button type="button" data-action="ok" style="height:56px;border:none;border-radius:16px;font-family:'Manrope',system-ui,sans-serif;font-size:17px;font-weight:800;background:#0284C7;color:#FFFFFF;cursor:pointer">Aceptar</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => overlay.remove());
  }

  function findLabelInput(labelText) {
    const labels = Array.from(document.querySelectorAll('label'));
    const match = labels.find((l) => l.textContent.trim().toLowerCase().startsWith(labelText.toLowerCase()));
    return match ? match.querySelector('input, select') : null;
  }

  function findButtonGroupByTitle(titleText) {
    const divs = Array.from(document.querySelectorAll('div'));
    for (const d of divs) {
      const firstSpan = d.firstElementChild;
      if (firstSpan && firstSpan.tagName === 'SPAN' && firstSpan.textContent.trim() === titleText) {
        return Array.from(d.querySelectorAll('button'));
      }
    }
    return [];
  }

  function setPressedButton(buttons, selectedText) {
    buttons.forEach((btn) => {
      const active = btn.textContent.trim() === selectedText;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) {
        btn.style.background = '#0284C7';
        btn.style.color = '#FFFFFF';
        btn.style.border = '2px solid #0284C7';
      } else {
        btn.style.background = '#FFFFFF';
        btn.style.color = '#2B1D14';
        btn.style.border = '1.5px solid #D4C9BA';
      }
    });
  }

  function getSelectedButtonText(buttons) {
    const active = buttons.find((b) => b.getAttribute('aria-pressed') === 'true');
    return active ? active.textContent.trim() : (buttons[0]?.textContent.trim() || '');
  }

  function getTableParts() {
    const scrollBox = document.querySelector('main div[style*="overflow-x:auto"]');
    if (!scrollBox) return null;
    const inner = scrollBox.firstElementChild;
    if (!inner) return null;
    const headerRow = inner.firstElementChild;
    return { inner, headerRow };
  }

  function clearTableRows(inner, headerRow) {
    while (inner.children.length > 1) {
      inner.removeChild(inner.lastElementChild);
    }
    if (!headerRow && inner.firstElementChild) {
      // noop
    }
  }

  function ensureMiniMapStyles() {
    if (document.getElementById('sigri-minimap-styles')) return;
    const style = document.createElement('style');
    style.id = 'sigri-minimap-styles';
    style.textContent = `
      @keyframes sigriPulse {
        0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.95; }
        75% { transform: translate(-50%, -50%) scale(1.75); opacity: 0; }
        100% { transform: translate(-50%, -50%) scale(1.75); opacity: 0; }
      }
      .sigri-pulse-ring {
        animation: sigriPulse 1.6s ease-out infinite;
        pointer-events: none;
      }
      [data-row-selectable] {
        cursor: pointer;
        transition: background-color 0.14s ease;
      }
      [data-row-selectable]:hover {
        background-color: #EFE9DF;
      }
    `;
    document.head.appendChild(style);
  }

  function setupSplitLayoutWithMiniMap(initialEstado, options) {
    ensureMiniMapStyles();
    const opts = options || {};
    const main = document.querySelector('main');
    const header = main ? main.querySelector('header') : null;
    if (!main || !header) return null;

    let splitWrap = main.querySelector('[data-split-container]');
    let middleCol = main.querySelector('[data-list-column]');
    let aside = main.querySelector('aside[data-mini-map]');

    if (!splitWrap) {
      splitWrap = document.createElement('div');
      splitWrap.dataset.splitContainer = 'true';
      splitWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start';

      middleCol = document.createElement('div');
      middleCol.dataset.listColumn = 'true';
      middleCol.style.cssText = 'flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:20px';

      const childrenToMove = Array.from(main.children).filter((el) => el !== header);
      childrenToMove.forEach((el) => middleCol.appendChild(el));

      aside = document.createElement('aside');
      aside.dataset.miniMap = 'true';
      aside.setAttribute('aria-label', 'Mapa de ubicación');
      aside.style.cssText = 'flex:1 0 360px;max-width:440px;min-width:310px;position:sticky;top:24px;display:flex;flex-direction:column;gap:14px';

      aside.innerHTML = `
        <section style="background:#FFFFFF;border:1px solid #E5DDD0;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;gap:2px">
              <h2 style="margin:0;font-size:16px;font-weight:800">Mapa de ubicación</h2>
              <span style="color:#6F5E51;font-size:12px">${escapeHtml(opts.subtitle || 'Seleccioná un elemento de la lista para ubicarlo')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" data-minimap-reset style="height:32px;padding:0 10px;border:none;border-radius:8px;background:#EAE3D6;color:#2B1D14;font-family:'Manrope',system-ui,sans-serif;font-size:12px;font-weight:700;cursor:pointer">Ver todo</button>
              <a href="index.html" title="Abrir mapa completo" style="display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 10px;border-radius:8px;background:#FFFFFF;color:#0284C7;box-shadow:inset 0 0 0 1.5px #0284C7;font-size:12px;font-weight:700;white-space:nowrap">Ampliar</a>
            </div>
          </div>
          <div data-minimap-box style="position:relative;height:360px;border-radius:12px;border:1px solid #D6CCBE;overflow:hidden;background:#F3EFE6">
            <div data-minimap-viewport style="position:absolute;inset:0;transform-origin:center center;transition:transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);cursor:grab">
              <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 820 640" preserveAspectRatio="none" style="position:absolute;inset:0;display:block">
                <defs>
                  <pattern id="sigri-mini-calles" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45 410 320)">
                    <rect width="26" height="26" fill="#F3EFE6"/>
                    <path d="M0 0h26M0 0v26" stroke="#FFFFFF" stroke-width="3"/>
                  </pattern>
                </defs>
                <rect width="820" height="640" fill="url(#sigri-mini-calles)"/>
                <path d="M560 0h260v150c-70-20-160-70-260-150z" fill="#BFD9EE"/>
                <path d="M300 430l60-60 60 60-60 60z" fill="#CFE3C4"/>
                <path d="M470 150l70-70 70 70-70 70z" fill="#CFE3C4"/>
                <path d="M0 320h820M410 0v640" stroke="#FFFFFF" stroke-width="7"/>
                <path d="M90 640 730 0M90 0l640 640" stroke="#FBF3D6" stroke-width="6"/>
                <path d="M0 40c60 10 110 30 160 60s90 40 150 30 120-60 180-80 100-40 130-50" fill="none" stroke="#8DBDE0" stroke-width="5"/>
                <path d="M820 400c-50 20-90 50-140 80s-90 60-120 160" fill="none" stroke="#8DBDE0" stroke-width="5"/>
                <path d="M0 560c50-30 90-50 130-55s90 20 130 60 50 60 60 75" fill="none" stroke="#8DBDE0" stroke-width="4"/>
              </svg>
              <div data-layer="zonas"></div>
              <div data-layer="refugios"></div>
              <div data-layer="sensores"></div>
              <div data-layer="seleccion" style="pointer-events:none"></div>
              <div data-layer="alertas"></div>
            </div>
            <div style="position:absolute;left:10px;top:10px;z-index:10;display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #D6CCBE;border-radius:10px;overflow:hidden;box-shadow:0 2px 6px rgba(45,29,19,0.15)">
              <button type="button" data-minimap-zoom-in aria-label="Acercar" style="width:34px;height:34px;border:none;background:#FFFFFF;color:#2B1D14;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-weight:800;font-size:16px">+</button>
              <button type="button" data-minimap-zoom-out aria-label="Alejar" style="width:34px;height:34px;border:none;border-top:1px solid #E5DDD0;background:#FFFFFF;color:#2B1D14;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-weight:800;font-size:16px">−</button>
            </div>
            <div style="position:absolute;left:10px;bottom:10px;z-index:10;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.94);border:1px solid #D6CCBE;border-radius:8px;padding:4px 8px">
              <span data-minimap-coords style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#2B1D14">Lat -34.915000 · Lon -57.948000</span>
            </div>
            <span data-minimap-scale style="position:absolute;right:10px;bottom:10px;z-index:10;background:rgba(255,255,255,0.92);border:1px solid #D6CCBE;border-radius:6px;padding:2px 7px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#2B1D14">1 km</span>
          </div>
          <div data-minimap-detail style="background:#FAF7F2;border:1px solid #E5DDD0;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px">
            <span style="color:#6F5E51;font-size:13px">Hacé clic en una fila de la lista para marcarla y acercar el mapa.</span>
          </div>
        </section>
      `;

      splitWrap.appendChild(middleCol);
      splitWrap.appendChild(aside);
      main.appendChild(splitWrap);
    }

    let currentState = initialEstado;
    let selectedTarget = null;
    let zoom = 1;
    let panX = 0;
    let panY = 0;

    const mapBox = aside.querySelector('[data-minimap-box]');
    const viewport = aside.querySelector('[data-minimap-viewport]');
    const layerZonas = viewport.querySelector('[data-layer="zonas"]');
    const layerRefugios = viewport.querySelector('[data-layer="refugios"]');
    const layerSensores = viewport.querySelector('[data-layer="sensores"]');
    const layerSeleccion = viewport.querySelector('[data-layer="seleccion"]');
    const layerAlertas = viewport.querySelector('[data-layer="alertas"]');
    const coordsEl = aside.querySelector('[data-minimap-coords]');
    const scaleEl = aside.querySelector('[data-minimap-scale]');
    const detailEl = aside.querySelector('[data-minimap-detail]');

    const project = (lat, lon) => ({
      leftPct: ((lon - (-58.000)) / 0.110) * 100,
      topPct: ((-34.888 - lat) / 0.070) * 100
    });

    const clampPan = (px, py, z) => {
      const W = mapBox.clientWidth || 380;
      const H = mapBox.clientHeight || 360;
      const maxX = Math.max(0, ((z - 1) * W) / 2);
      const maxY = Math.max(0, ((z - 1) * H) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, px)),
        y: Math.max(-maxY, Math.min(maxY, py))
      };
    };

    const applyTransform = (animate) => {
      viewport.style.transition = animate
        ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
      const clamped = clampPan(panX, panY, zoom);
      panX = clamped.x;
      panY = clamped.y;
      viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      if (scaleEl) {
        const km = 1 / zoom;
        scaleEl.textContent = km >= 1
          ? `${km.toFixed(km % 1 === 0 ? 0 : 1).replace('.', ',')} km`
          : `${Math.round(km * 1000)} m`;
      }
    };

    const focusCoords = (lat, lon, targetZoom) => {
      const p = project(lat, lon);
      const W = mapBox.clientWidth || 380;
      const H = mapBox.clientHeight || 360;
      zoom = targetZoom || 1.65;
      panX = zoom * (0.5 - p.leftPct / 100) * W;
      panY = zoom * (0.5 - p.topPct / 100) * H;
      applyTransform(true);
      if (coordsEl) {
        coordsEl.textContent = `Lat ${Number(lat).toFixed(6)} · Lon ${Number(lon).toFixed(6)}`;
      }
    };

    const resolveSelection = (target) => {
      if (!target) {
        return {
          focusLat: null,
          focusLon: null,
          focusZoom: 1,
          highlightZonaIds: new Set(),
          highlightSensores: new Set(),
          highlightRefugios: new Set(),
          pulseColor: '#0284C7',
          pulsePoints: [],
          detailHtml: '<span style="color:#6F5E51;font-size:13px">Vista general de La Plata. Hacé clic en una fila de la tabla para ubicarla en el mapa.</span>'
        };
      }

      const highlightZonaIds = new Set();
      const highlightSensores = new Set();
      const highlightRefugios = new Set();
      const pulsePoints = [];
      let pulseColor = '#0284C7';
      let focusLat = null;
      let focusLon = null;
      let focusZoom = 1.65;
      let detailHtml = '';

      if (target.type === 'zona') {
        const z = currentState.zonas.find((x) => x.id === target.id);
        if (z) {
          highlightZonaIds.add(z.id);
          currentState.sensores.filter((s) => s.zonasIds.includes(z.id)).forEach((s) => highlightSensores.add(s.codigo));
          focusLat = z.lat;
          focusLon = z.lon;
          focusZoom = z.diametro >= 2000 ? 1.45 : 1.65;
          pulseColor = z.nivelRiesgo === 'Alto' ? '#8B1A1A' : z.nivelRiesgo === 'Medio' ? '#B45309' : '#0E7490';
          pulsePoints.push({ lat: z.lat, lon: z.lon, size: Math.max(36, Math.round(z.diametro * 0.045) + 18) });
          detailHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-weight:800;font-size:14px">${escapeHtml(z.nombre)}</span>
              ${badgeNivelHtml(z.nivelRiesgo)}
            </div>
            <span style="color:#6F5E51;font-size:12px">${escapeHtml(z.descripcion || 'Sin descripción')}</span>
            <div style="display:flex;justify-content:space-between;gap:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#524337">
              <span>Radio ${escapeHtml(formatMeters(z.radio))} m</span>
              <span>${z.sensoresCount} ${z.sensoresCount === 1 ? 'sensor' : 'sensores'}</span>
            </div>
          `;
        }
      } else if (target.type === 'sensor') {
        const s = currentState.sensores.find((x) => x.codigo === target.codigo);
        if (s) {
          highlightSensores.add(s.codigo);
          s.zonasIds.forEach((zid) => highlightZonaIds.add(zid));
          focusLat = s.lat;
          focusLon = s.lon;
          focusZoom = 1.75;
          pulseColor = s.estado === 'Activo' ? '#0284C7' : s.estado === 'Desconectado' ? '#8B1A1A' : '#5B6170';
          pulsePoints.push({ lat: s.lat, lon: s.lon, size: 42 });
          const zonasTxt = s.zonasNombres.length ? s.zonasNombres.join(', ') : 'Sin zona asociada';
          const medTxt = s.ultimaMedicion
            ? `${formatValorUnidad(s.ultimaMedicion.valor, s.unidad)} (${formatShortDateTime(s.ultimaMedicion.fechaHora)})`
            : 'Sin mediciones';
          detailHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:800;font-size:14px">${escapeHtml(s.codigo)}</span>
                <span style="font-weight:700;font-size:13px">${escapeHtml(s.tipo)}</span>
              </div>
              ${badgeEstadoSensorHtml(s.estado)}
            </div>
            <span style="color:#6F5E51;font-size:12px">${escapeHtml(zonasTxt)}</span>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#524337">Última: ${escapeHtml(medTxt)}</span>
              <a href="DlgMedicion.html?sensor=${encodeURIComponent(s.codigo)}" style="font-size:12px;font-weight:700;color:#0284C7">Cargar medición →</a>
            </div>
          `;
        }
      } else if (target.type === 'medicion') {
        const m = currentState.mediciones.find((x) => x.id === target.id);
        if (m) {
          const s = currentState.sensores.find((x) => x.codigo === m.sensorCodigo);
          if (s) {
            highlightSensores.add(s.codigo);
            s.zonasIds.forEach((zid) => highlightZonaIds.add(zid));
            focusLat = s.lat;
            focusLon = s.lon;
            focusZoom = 1.75;
            pulseColor = m.evaluacionTipo === 'alerta' ? '#8B1A1A' : '#0284C7';
            pulsePoints.push({ lat: s.lat, lon: s.lon, size: 42 });
          }
          detailHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:800;font-size:14px">${escapeHtml(m.sensorCodigo)} · ${escapeHtml(formatValorUnidad(m.valor, m.unidad))}</span>
              ${badgeOrigenHtml(m.origen)}
            </div>
            <span style="color:#6F5E51;font-size:12px">${escapeHtml(m.tipo)} · ${escapeHtml(m.zonaNombre)}</span>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#524337">${escapeHtml(m.fechaHora)}</span>
              ${badgeEvaluacionHtml(m)}
            </div>
          `;
        }
      } else if (target.type === 'umbral') {
        const u = currentState.umbrales.find((x) => x.id === target.id);
        if (u) {
          const z = currentState.zonas.find((x) => x.id === u.zonaId);
          if (z) {
            highlightZonaIds.add(z.id);
            currentState.sensores
              .filter((s) => s.zonasIds.includes(z.id) && s.tipo === u.tipo)
              .forEach((s) => highlightSensores.add(s.codigo));
            focusLat = z.lat;
            focusLon = z.lon;
            focusZoom = z.diametro >= 2000 ? 1.45 : 1.65;
            pulseColor = u.nivelAlerta === 'Alto' ? '#8B1A1A' : u.nivelAlerta === 'Medio' ? '#B45309' : '#0E7490';
            pulsePoints.push({ lat: z.lat, lon: z.lon, size: Math.max(36, Math.round(z.diametro * 0.045) + 18) });
          }
          const minTxt = u.minimo !== null && u.minimo !== undefined ? formatValorUnidad(u.minimo, u.unidad) : 'Sin mínimo';
          const maxTxt = u.maximo !== null && u.maximo !== undefined ? formatValorUnidad(u.maximo, u.unidad) : 'Sin máximo';
          detailHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-weight:800;font-size:14px">${escapeHtml(u.zonaNombre)}</span>
              ${badgeNivelHtml(u.nivelAlerta)}
            </div>
            <span style="color:#6F5E51;font-size:12px">Tipo de sensor: <strong>${escapeHtml(u.tipo)}</strong></span>
            <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#524337">Mín: ${escapeHtml(minTxt)} · Máx: ${escapeHtml(maxTxt)}</span>
          `;
        }
      } else if (target.type === 'alerta') {
        const a = currentState.alertas.find((x) => x.codigo === target.codigo);
        if (a) {
          const s = currentState.sensores.find((x) => x.codigo === a.sensorCodigo);
          const z = currentState.zonas.find((x) => x.id === a.zonaId);
          if (z) highlightZonaIds.add(z.id);
          if (s) {
            highlightSensores.add(s.codigo);
            focusLat = s.lat;
            focusLon = s.lon;
            focusZoom = 1.75;
            pulseColor = '#8B1A1A';
            pulsePoints.push({ lat: s.lat, lon: s.lon, size: 44 });
          } else if (z) {
            focusLat = z.lat;
            focusLon = z.lon;
            focusZoom = 1.55;
            pulseColor = '#8B1A1A';
            pulsePoints.push({ lat: z.lat, lon: z.lon, size: 44 });
          }
          detailHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:800;font-size:14px">${escapeHtml(a.codigo)}</span>
                ${badgeNivelHtml(a.nivel)}
              </div>
              ${badgeEstadoAlertaHtml(a.estado)}
            </div>
            <span style="font-weight:700;font-size:13px">${escapeHtml(a.zonaNombre)}</span>
            <span style="color:#6F5E51;font-size:12px">${escapeHtml(a.sensorCodigo)} · ${escapeHtml(a.condicion)} (${escapeHtml(formatValorUnidad(a.valor, a.unidad))})</span>
          `;
        }
      } else if (target.type === 'refugio') {
        const r = currentState.refugios.find((x) => x.id === target.id);
        if (r) {
          highlightRefugios.add(r.id);
          focusLat = r.lat;
          focusLon = r.lon;
          focusZoom = 1.75;
          pulseColor = '#0F5F56';
          pulsePoints.push({ lat: r.lat, lon: r.lon, size: 42 });
          detailHtml = `
            <span style="font-weight:800;font-size:14px;color:#0F5F56">${escapeHtml(r.nombre)}</span>
            <span style="color:#524337;font-size:12px">${escapeHtml(r.descripcion || 'Sin descripción')}</span>
            <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#6F5E51">${escapeHtml(formatCoords(r.lat, r.lon))}</span>
          `;
        }
      }

      return {
        focusLat,
        focusLon,
        focusZoom,
        highlightZonaIds,
        highlightSensores,
        highlightRefugios,
        pulseColor,
        pulsePoints,
        detailHtml: detailHtml || '<span style="color:#6F5E51;font-size:13px">Elemento no encontrado en el mapa.</span>'
      };
    };

    const renderLayers = () => {
      const info = resolveSelection(selectedTarget);
      const hasSel = Boolean(
        selectedTarget &&
        (info.highlightZonaIds.size > 0 || info.highlightSensores.size > 0 || info.highlightRefugios.size > 0)
      );

      const zonaColors = {
        Alto: { border: '#8B1A1A', bg: 'rgba(139,26,26,0.20)', badgeBg: '#8B1A1A', label: 'ALTO' },
        Medio: { border: '#B45309', bg: 'rgba(217,119,6,0.22)', badgeBg: '#B45309', label: 'MEDIO' },
        Bajo: { border: '#0E7490', bg: 'rgba(14,116,144,0.20)', badgeBg: '#0E7490', label: 'BAJO' }
      };

      layerZonas.innerHTML = currentState.zonas.map((z) => {
        const p = project(z.lat, z.lon);
        const size = Math.max(24, Math.round(z.diametro * 0.045));
        const half = Math.round(size / 2);
        const c = zonaColors[z.nivelRiesgo] || zonaColors.Bajo;
        const isHi = info.highlightZonaIds.has(z.id);
        const opacity = hasSel ? (isHi ? '1' : '0.35') : '1';
        const borderW = isHi ? '3px' : '2px';
        const shadow = isHi ? `0 0 0 4px rgba(2,132,199,0.25)` : 'none';
        return `<div data-minimap-zona="${escapeHtml(z.id)}" title="${escapeHtml(z.nombre)}" style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;width:${size}px;height:${size}px;margin-left:-${half}px;margin-top:-${half}px;border-radius:50%;border:${borderW} solid ${c.border};background:${c.bg};box-sizing:border-box;opacity:${opacity};box-shadow:${shadow};cursor:pointer;transition:opacity 0.2s"><div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;display:flex;align-items:center;gap:4px;white-space:nowrap;background:#FFFFFF;border:1px solid ${isHi ? c.border : '#D4C9BA'};border-radius:6px;padding:1px 4px 1px 6px;font-size:10px;font-weight:700">${escapeHtml(z.nombre.split('–')[0].trim())}<span style="padding:0 4px;border-radius:4px;background:${c.badgeBg};color:#FFFFFF;font-size:9px">${c.label}</span></div></div>`;
      }).join('');

      // Show non-Baja sensors, plus the currently selected sensor even if it is Baja
      const visibleSensors = currentState.sensores.filter(
        (s) => s.estado !== 'Baja' || info.highlightSensores.has(s.codigo)
      );
      layerSensores.innerHTML = visibleSensors.map((s) => {
        const p = project(s.lat, s.lon);
        const isHi = info.highlightSensores.has(s.codigo);
        const bg = isHi && selectedTarget?.type === 'alerta'
          ? '#8B1A1A'
          : (s.estado === 'Activo' ? '#0284C7' : '#5B6170');
        const opacity = hasSel ? (isHi ? '1' : '0.4') : '1';
        const scale = isHi ? 'transform:translate(-50%,-13px) scale(1.18);z-index:5;' : 'transform:translate(-50%,-13px);';
        return `<div style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;${scale}display:flex;flex-direction:column;align-items:center;gap:1px;opacity:${opacity};transition:opacity 0.2s"><button type="button" data-minimap-sensor="${escapeHtml(s.codigo)}" aria-label="Sensor ${escapeHtml(s.codigo)}" style="width:26px;height:26px;border-radius:50%;border:2px solid #FFFFFF;background:${bg};color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(45,29,19,0.30)"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-8"/><circle cx="12" cy="9" r="2"/><path d="M7.5 13.5a6.5 6.5 0 0 1 0-9"/><path d="M16.5 4.5a6.5 6.5 0 0 1 0 9"/></svg></button><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;font-weight:700;background:#FFFFFF;border:${isHi ? '1.5px solid ' + bg : '1px solid #D4C9BA'};border-radius:4px;padding:0 3px">${escapeHtml(s.codigo)}</span></div>`;
      }).join('');

      layerRefugios.innerHTML = currentState.refugios.map((r) => {
        const p = project(r.lat, r.lon);
        const isHi = info.highlightRefugios.has(r.id);
        const opacity = hasSel ? (isHi ? '1' : '0.4') : '1';
        const scale = isHi ? 'transform:translate(-50%,-13px) scale(1.18);z-index:5;' : 'transform:translate(-50%,-13px);';
        return `<div style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;${scale}display:flex;flex-direction:column;align-items:center;gap:1px;opacity:${opacity};transition:opacity 0.2s"><button type="button" data-minimap-refugio="${escapeHtml(r.id)}" aria-label="Refugio ${escapeHtml(r.nombre)}" style="width:26px;height:26px;border-radius:7px;border:2px solid #FFFFFF;background:#0F5F56;color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(45,29,19,0.30)"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></button><span style="font-size:10px;font-weight:700;background:#FFFFFF;border:${isHi ? '1.5px solid #0F5F56' : '1px solid #D4C9BA'};border-radius:4px;padding:0 3px;white-space:nowrap">${escapeHtml(r.nombre)}</span></div>`;
      }).join('');

      layerAlertas.innerHTML = currentState.zonas
        .filter((z) => z.alertasActivasCount > 0)
        .map((z) => {
          const p = project(z.lat, z.lon);
          const rPx = Math.max(12, Math.round((z.diametro * 0.045) / 2));
          const isHi = !hasSel || info.highlightZonaIds.has(z.id);
          return `<div style="position:absolute;left:calc(${p.leftPct.toFixed(1)}% + ${Math.round(rPx * 0.45)}px);top:max(8px, calc(${p.topPct.toFixed(1)}% - ${Math.round(rPx * 0.85)}px));display:flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:999px;background:#8B1A1A;color:#FFFFFF;font-weight:800;font-size:11px;border:1.5px solid #FFFFFF;box-shadow:0 2px 5px rgba(45,29,19,0.30);pointer-events:none;opacity:${isHi ? '1' : '0.35'}">${z.alertasActivasCount} ${z.alertasActivasCount === 1 ? 'alerta' : 'alertas'}</div>`;
        }).join('');

      layerSeleccion.innerHTML = info.pulsePoints.map((pt) => {
        const p = project(pt.lat, pt.lon);
        return `<div class="sigri-pulse-ring" style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;width:${pt.size}px;height:${pt.size}px;border-radius:50%;border:3px solid ${info.pulseColor};background:rgba(2,132,199,0.12)"></div>`;
      }).join('');

      if (detailEl) detailEl.innerHTML = info.detailHtml;

      // Bind clicks on mini-map pins/zones
      if (typeof opts.onMapEntityClick === 'function') {
        layerZonas.querySelectorAll('[data-minimap-zona]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onMapEntityClick({ type: 'zona', id: el.dataset.minimapZona });
          });
        });
        layerSensores.querySelectorAll('[data-minimap-sensor]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onMapEntityClick({ type: 'sensor', codigo: el.dataset.minimapSensor });
          });
        });
        layerRefugios.querySelectorAll('[data-minimap-refugio]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onMapEntityClick({ type: 'refugio', id: el.dataset.minimapRefugio });
          });
        });
      }
    };

    const selectTarget = (target, skipZoom) => {
      selectedTarget = target || null;
      renderLayers();
      const info = resolveSelection(selectedTarget);
      if (!skipZoom) {
        if (info.focusLat !== null && info.focusLon !== null) {
          focusCoords(info.focusLat, info.focusLon, info.focusZoom);
        } else {
          zoom = 1;
          panX = 0;
          panY = 0;
          applyTransform(true);
        }
      }
    };

    const updateState = (nuevoEstado) => {
      currentState = nuevoEstado;
      renderLayers();
    };

    // Controls: Zoom in/out, Reset, Drag pan, Mouse coords
    aside.querySelector('[data-minimap-zoom-in]').addEventListener('click', () => {
      zoom = Math.min(2.5, Number((zoom + 0.25).toFixed(2)));
      applyTransform(true);
    });
    aside.querySelector('[data-minimap-zoom-out]').addEventListener('click', () => {
      zoom = Math.max(1, Number((zoom - 0.25).toFixed(2)));
      applyTransform(true);
    });
    aside.querySelector('[data-minimap-reset]').addEventListener('click', () => {
      selectTarget(null);
      if (typeof opts.onReset === 'function') opts.onReset();
    });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, a')) return;
      dragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform(false);
      }
    });
    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        viewport.style.cursor = 'grab';
      }
    });
    mapBox.addEventListener('mousemove', (e) => {
      if (!coordsEl) return;
      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xRel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const yRel = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const lon = -58.000 + xRel * 0.110;
      const lat = -34.888 - yRel * 0.070;
      coordsEl.textContent = `Lat ${lat.toFixed(6)} · Lon ${lon.toFixed(6)}`;
    });

    renderLayers();

    return { middleCol, aside, selectTarget, updateState };
  }

  function applyRowSelectionStyle(row, isSelected) {
    if (isSelected) {
      row.style.backgroundColor = '#EBF5FA';
      row.style.boxShadow = 'inset 4px 0 0 #0284C7';
    } else {
      row.style.backgroundColor = '';
      row.style.boxShadow = '';
    }
  }

  // ---------------- PAGE: MAPA (index.html) ----------------
  async function initMapaPage() {
    const estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    const mapSection = document.querySelector('section[aria-label="Mapa georreferenciado"]');
    if (!mapSection) return;

    const svgEl = mapSection.querySelector('svg');
    const layerZonas = mapSection.querySelector('[data-layer="zonas"]');
    const layerSensores = mapSection.querySelector('[data-layer="sensores"]');
    const layerRefugios = mapSection.querySelector('[data-layer="refugios"]');
    const layerAlertas = mapSection.querySelector('[data-layer="alertas"]');

    // Wrap SVG + layers in zoomable viewport without altering UI controls
    let viewport = mapSection.querySelector('[data-map-viewport]');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.dataset.mapViewport = 'true';
      viewport.style.cssText = 'position:absolute;inset:0;transform-origin:center center;transition:transform 0.18s ease-out;cursor:grab';
      mapSection.insertBefore(viewport, svgEl);
      viewport.appendChild(svgEl);
      viewport.appendChild(layerZonas);
      viewport.appendChild(layerSensores);
      viewport.appendChild(layerRefugios);
      viewport.appendChild(layerAlertas);
    }

    const project = (lat, lon) => ({
      leftPct: ((lon - (-58.000)) / 0.110) * 100,
      topPct: ((-34.888 - lat) / 0.070) * 100
    });

    // Render Zonas
    const zonaColors = {
      Alto: { border: '#8B1A1A', bg: 'rgba(139,26,26,0.20)', badgeBg: '#8B1A1A', label: 'ALTO' },
      Medio: { border: '#B45309', bg: 'rgba(217,119,6,0.22)', badgeBg: '#B45309', label: 'MEDIO' },
      Bajo: { border: '#0E7490', bg: 'rgba(14,116,144,0.20)', badgeBg: '#0E7490', label: 'BAJO' }
    };
    layerZonas.innerHTML = estado.zonas.map((z) => {
      const p = project(z.lat, z.lon);
      const size = Math.max(36, Math.round(z.diametro * 0.082));
      const half = Math.round(size / 2);
      const c = zonaColors[z.nivelRiesgo] || zonaColors.Bajo;
      return `<div style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;width:${size}px;height:${size}px;margin-left:-${half}px;margin-top:-${half}px;border-radius:50%;border:2.5px solid ${c.border};background:${c.bg};box-sizing:border-box"><div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;display:flex;align-items:center;gap:6px;white-space:nowrap;background:#FFFFFF;border:1px solid #D9CEBF;border-radius:8px;padding:3px 4px 3px 8px;font-size:12px;font-weight:700">${escapeHtml(z.nombre)}<span style="padding:1px 6px;border-radius:6px;background:${c.badgeBg};color:#FFFFFF;font-size:11px;letter-spacing:0.04em">${c.label}</span></div></div>`;
    }).join('');

    // Render Sensores (todos menos Baja)
    layerSensores.innerHTML = estado.sensores
      .filter((s) => s.estado !== 'Baja')
      .map((s) => {
        const p = project(s.lat, s.lon);
        const bg = s.estado === 'Activo' ? '#0284C7' : '#5B6170';
        return `<div style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;transform:translate(-50%,-18px);display:flex;flex-direction:column;align-items:center;gap:2px"><button type="button" data-map-sensor="${escapeHtml(s.codigo)}" aria-label="Sensor ${escapeHtml(s.codigo)}, ${escapeHtml(s.estado.toLowerCase())}" style="width:36px;height:36px;border-radius:50%;border:2.5px solid #FFFFFF;background:${bg};color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(45,29,19,0.30)">${ICONS.sensor}</button><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;font-weight:700;background:#FFFFFF;border-radius:4px;padding:0 4px">${escapeHtml(s.codigo)}</span></div>`;
      }).join('');

    // Render Refugios
    layerRefugios.innerHTML = estado.refugios.map((r) => {
      const p = project(r.lat, r.lon);
      return `<div style="position:absolute;left:${p.leftPct.toFixed(1)}%;top:${p.topPct.toFixed(1)}%;transform:translate(-50%,-18px);display:flex;flex-direction:column;align-items:center;gap:2px"><button type="button" data-map-refugio="${escapeHtml(r.id)}" aria-label="Refugio ${escapeHtml(r.nombre)}" style="width:36px;height:36px;border-radius:9px;border:2.5px solid #FFFFFF;background:#0F5F56;color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(45,29,19,0.30)">${ICONS.refugio}</button><span style="font-size:11px;font-weight:700;background:#FFFFFF;border-radius:4px;padding:0 4px;white-space:nowrap">${escapeHtml(r.nombre)}</span></div>`;
    }).join('');

    // Render Alertas activas por zona
    layerAlertas.innerHTML = estado.zonas
      .filter((z) => z.alertasActivasCount > 0)
      .map((z) => {
        const p = project(z.lat, z.lon);
        const rPx = Math.max(18, Math.round((z.diametro * 0.082) / 2));
        const count = z.alertasActivasCount;
        const txt = `${count} ${count === 1 ? 'alerta' : 'alertas'}`;
        return `<a href="Alertas.html?zona=${encodeURIComponent(z.id)}" aria-label="${txt} activas en ${escapeHtml(z.nombre)}" style="position:absolute;left:calc(${p.leftPct.toFixed(1)}% + ${Math.round(rPx * 0.45)}px);top:max(10px, calc(${p.topPct.toFixed(1)}% - ${Math.round(rPx * 0.85)}px));display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:999px;background:#8B1A1A;color:#FFFFFF;font-weight:800;font-size:13px;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(45,29,19,0.35);white-space:nowrap">${ICONS.alerta}${txt}</a>`;
      }).join('');

    // Layer checkbox sync
    mapSection.querySelectorAll('input[data-toggle]').forEach((cb) => {
      const layer = mapSection.querySelector(`[data-layer="${cb.dataset.toggle}"]`);
      if (layer) layer.hidden = !cb.checked;
    });

    // Map Popover on pin click
    let popover = mapSection.querySelector('[data-map-popover]');
    if (!popover) {
      popover = document.createElement('div');
      popover.dataset.mapPopover = 'true';
      popover.hidden = true;
      popover.style.cssText = 'position:absolute;left:16px;top:116px;z-index:20;width:290px;max-width:calc(100% - 32px);background:#FFFFFF;border:1px solid #D6CCBE;border-radius:14px;padding:14px 16px;box-shadow:0 12px 28px rgba(45,29,19,0.22);display:flex;flex-direction:column;gap:8px';
      mapSection.appendChild(popover);
    }

    const showPopover = (html) => {
      popover.innerHTML = html;
      popover.hidden = false;
      popover.style.display = 'flex';
      const closeBtn = popover.querySelector('[data-close-popover]');
      if (closeBtn) closeBtn.addEventListener('click', () => { popover.hidden = true; popover.style.display = 'none'; });
    };

    layerSensores.querySelectorAll('[data-map-sensor]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = estado.sensores.find((x) => x.codigo === btn.dataset.mapSensor);
        if (!s) return;
        const medTxt = s.ultimaMedicion
          ? `${formatValorUnidad(s.ultimaMedicion.valor, s.unidad)} (${formatShortDateTime(s.ultimaMedicion.fechaHora)})`
          : 'Sin mediciones';
        const zonasTxt = s.zonasNombres.length ? s.zonasNombres.join(', ') : 'Sin zona asociada';
        showPopover(`
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="display:flex;align-items:center;gap:8px"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:800;font-size:15px">${escapeHtml(s.codigo)}</span>${badgeEstadoSensorHtml(s.estado)}</div>
            <button type="button" data-close-popover aria-label="Cerrar detalle" style="border:none;background:#EAE3D6;width:28px;height:28px;border-radius:8px;cursor:pointer;font-weight:800;color:#2B1D14">×</button>
          </div>
          <span style="font-weight:700">${escapeHtml(s.tipo)}</span>
          <span style="color:#6F5E51;font-size:13px">${escapeHtml(zonasTxt)}</span>
          <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#6F5E51">Última: ${escapeHtml(medTxt)}</span>
          <div style="display:flex;gap:8px;margin-top:2px">
            <a href="DlgMedicion.html?sensor=${encodeURIComponent(s.codigo)}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;height:36px;border-radius:10px;background:#0284C7;color:#FFFFFF;font-size:13px;font-weight:700">Cargar medición</a>
            <a href="Sensores.html" style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 12px;border-radius:10px;background:#EAE3D6;color:#2B1D14;font-size:13px;font-weight:700">Ver lista</a>
          </div>
        `);
      });
    });

    layerRefugios.querySelectorAll('[data-map-refugio]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = estado.refugios.find((x) => x.id === btn.dataset.mapRefugio);
        if (!r) return;
        showPopover(`
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-weight:800;font-size:15px;color:#0F5F56">${escapeHtml(r.nombre)}</span>
            <button type="button" data-close-popover aria-label="Cerrar detalle" style="border:none;background:#EAE3D6;width:28px;height:28px;border-radius:8px;cursor:pointer;font-weight:800;color:#2B1D14">×</button>
          </div>
          <span style="color:#524337;font-size:13px">${escapeHtml(r.descripcion)}</span>
          <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#6F5E51">${escapeHtml(formatCoords(r.lat, r.lon))}</span>
          <a href="Refugios.html" style="display:inline-flex;align-items:center;justify-content:center;height:36px;border-radius:10px;background:#EAE3D6;color:#2B1D14;font-size:13px;font-weight:700">Administrar refugios</a>
        `);
      });
    });

    // Zoom & Pan controls
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    const scaleBarText = Array.from(mapSection.querySelectorAll('span')).find((s) => s.textContent.trim() === '1 km');
    const coordsText = Array.from(mapSection.querySelectorAll('span')).find((s) => s.textContent.includes('Lat '));

    const applyTransform = () => {
      viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      if (scaleBarText) {
        const km = 1 / zoom;
        scaleBarText.textContent = km >= 1
          ? `${km.toFixed(km % 1 === 0 ? 0 : 1).replace('.', ',')} km`
          : `${Math.round(km * 1000)} m`;
      }
    };

    const btnZoomIn = mapSection.querySelector('button[aria-label="Acercar"]');
    const btnZoomOut = mapSection.querySelector('button[aria-label="Alejar"]');
    if (btnZoomIn) {
      btnZoomIn.onclick = () => {
        zoom = Math.min(2.5, Number((zoom + 0.25).toFixed(2)));
        applyTransform();
      };
    }
    if (btnZoomOut) {
      btnZoomOut.onclick = () => {
        zoom = Math.max(0.75, Number((zoom - 0.25).toFixed(2)));
        if (zoom <= 1) { panX = 0; panY = 0; }
        applyTransform();
      };
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, a')) return;
      dragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform();
      }
    });
    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        viewport.style.cursor = 'grab';
      }
    });

    mapSection.addEventListener('mousemove', (e) => {
      if (!coordsText) return;
      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xRel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const yRel = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const lon = -58.000 + xRel * 0.110;
      const lat = -34.888 - yRel * 0.070;
      coordsText.textContent = `Lat ${lat.toFixed(6)} · Lon ${lon.toFixed(6)}`;
    });

    // Right Aside: Active Alerts + Summary
    const aside = document.querySelector('main aside');
    if (aside) {
      const sections = aside.querySelectorAll('section');
      const alertsSection = sections[0];
      const summarySection = sections[1];

      if (alertsSection) {
        const activas = estado.alertas.filter((a) => a.estado === 'Activa');
        const h2Row = alertsSection.firstElementChild;
        const countBadge = h2Row ? h2Row.querySelector('span') : null;
        if (countBadge) countBadge.textContent = String(activas.length);

        // Remove old alert cards (everything between h2Row and last link)
        const viewAllLink = alertsSection.querySelector('a[href="Alertas.html"]');
        Array.from(alertsSection.children).forEach((ch) => {
          if (ch !== h2Row && ch !== viewAllLink) ch.remove();
        });

        const toShow = activas.slice(0, 4);
        if (toShow.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = 'padding:14px;border:1px solid #E5DDD0;border-radius:12px;background:#FAF7F2;color:#6F5E51;font-size:13px';
          empty.textContent = 'No hay alertas activas en este momento.';
          alertsSection.insertBefore(empty, viewAllLink);
        } else {
          toShow.forEach((a) => {
            const card = document.createElement('a');
            card.href = `DlgEstadoAlerta.html?codigo=${encodeURIComponent(a.codigo)}`;
            card.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid #E5DDD0;border-radius:12px;background:#FAF7F2;color:inherit';
            card.innerHTML = `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <div style="display:flex;align-items:center;gap:8px"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(a.codigo)}</span>${badgeNivelHtml(a.nivel)}</div>
                ${badgeEstadoAlertaHtml(a.estado)}
              </div>
              <span style="font-weight:700">${escapeHtml(a.zonaNombre)}</span>
              <span style="color:#6F5E51;font-size:13px">${escapeHtml(a.sensorCodigo)} · ${escapeHtml(a.detalleCorto)}</span>
              <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#6F5E51">${escapeHtml(a.fechaHora)}</span>
            `;
            alertsSection.insertBefore(card, viewAllLink);
          });
        }
      }

      if (summarySection) {
        const rows = summarySection.children;
        if (rows[0]) rows[0].lastElementChild.textContent = String(estado.resumen.zonasTotal);
        if (rows[1]) rows[1].lastElementChild.textContent = `${estado.resumen.sensoresActivos} de ${estado.resumen.sensoresTotal}`;
        if (rows[2]) rows[2].lastElementChild.textContent = String(estado.resumen.refugiosTotal);
      }
    }
  }

  // ---------------- PAGE: ZONAS (Zonas.html) ----------------
  async function initZonasPage() {
    const estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedId = null;
    let userCleared = false;
    let currentFiltered = [];

    const newLink = document.querySelector('a[href^="DlgZona.html"]');
    if (newLink) newLink.href = 'DlgZona.html?mode=new';

    const inputSearch = findLabelInput('Buscar zona');
    const selectNivel = findLabelInput('Nivel de riesgo');
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedId);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná una zona para marcar su cobertura',
      onReset: () => {
        userCleared = true;
        selectedId = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'zona') {
          userCleared = false;
          selectedId = entity.id;
          syncRowHighlight();
          miniMap.selectTarget({ type: 'zona', id: entity.id });
        } else {
          miniMap.selectTarget(entity);
        }
      }
    });

    const footerSpan = miniMap?.middleCol.querySelector(':scope > span') || document.querySelector('main > span');

    const render = () => {
      const q = (inputSearch?.value || '').trim().toLowerCase();
      const nivel = selectNivel?.value || 'Todos';
      const filtered = estado.zonas.filter((z) => {
        const matchQ = !q || z.nombre.toLowerCase().includes(q) || (z.descripcion || '').toLowerCase().includes(q);
        const matchN = nivel === 'Todos' || z.nivelRiesgo === nivel;
        return matchQ && matchN;
      });
      currentFiltered = filtered;

      if (!userCleared && (!selectedId || !filtered.some((z) => z.id === selectedId))) {
        selectedId = filtered[0]?.id || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No se encontraron zonas que coincidan con los filtros.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((z) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = z.id;
          row.style.cssText = 'display:grid;grid-template-columns:minmax(190px,2fr) 95px minmax(150px,1.2fr) 78px 72px 64px 132px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          row.innerHTML = `
            <div style="min-width:0"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:700">${escapeHtml(z.nombre)}</span><span style="color:#6F5E51;font-size:13px">${escapeHtml(z.descripcion)}</span></div></div>
            <div style="min-width:0">${badgeNivelHtml(z.nivelRiesgo)}</div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px">${escapeHtml(formatCoords(z.lat, z.lon))}</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px">${escapeHtml(formatMeters(z.diametro))} m</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px">${escapeHtml(formatMeters(z.radio))} m</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px">${z.sensoresCount}</span></div>
            <div style="min-width:0"><div style="display:flex;gap:6px;justify-content:flex-end">
              <a href="DlgAsociarSensores.html?id=${encodeURIComponent(z.id)}" aria-label="Asociar sensores a ${escapeHtml(z.nombre)}" title="Asociar sensores" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#2B1D14;border:none;cursor:pointer;padding:0">${ICONS.link}</a>
              <a href="DlgZona.html?id=${encodeURIComponent(z.id)}" aria-label="Modificar ${escapeHtml(z.nombre)}" title="Modificar zona" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#2B1D14;border:none;cursor:pointer;padding:0">${ICONS.edit}</a>
              <a href="DlgEliminarZona.html?id=${encodeURIComponent(z.id)}" aria-label="Eliminar ${escapeHtml(z.nombre)}" title="Eliminar zona" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#8B1A1A;border:none;cursor:pointer;padding:0">${ICONS.trash}</a>
            </div></div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedId = z.id;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'zona', id: z.id });
          });
          table.inner.appendChild(row);
        });
      }

      syncRowHighlight();
      if (miniMap && selectedId && currentFiltered.some((z) => z.id === selectedId)) {
        miniMap.selectTarget({ type: 'zona', id: selectedId });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }

      if (footerSpan) {
        footerSpan.textContent = filtered.length === estado.zonas.length
          ? `${estado.zonas.length} zonas registradas · el radio se calcula automáticamente a partir del diámetro`
          : `Mostrando ${filtered.length} de ${estado.zonas.length} zonas registradas`;
      }
    };

    if (inputSearch) inputSearch.addEventListener('input', () => { userCleared = false; render(); });
    if (selectNivel) selectNivel.addEventListener('change', () => { userCleared = false; render(); });
    render();
  }

  // ---------------- PAGE: DlgZona.html ----------------
  async function initDlgZonaPage() {
    const params = getQueryParams();
    const zonaId = params.get('id');
    const isNew = params.get('mode') === 'new' || (!zonaId && params.get('restore') !== '1');
    const restore = params.get('restore') === '1';

    const h1 = document.querySelector('h1');
    const inNombre = findLabelInput('Nombre');
    const inDesc = findLabelInput('Descripción');
    const nivelBtns = findButtonGroupByTitle('Nivel de riesgo');
    const inLat = findLabelInput('Latitud del centro');
    const inLon = findLabelInput('Longitud del centro');
    const inDiam = findLabelInput('Diámetro');
    const radioDisplay = Array.from(document.querySelectorAll('span')).find((s) => s.previousElementSibling?.textContent.trim() === 'Radio calculado');
    const btnGuardar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Registrar zona');

    const updateRadio = () => {
      const d = parseNumero(inDiam?.value);
      if (radioDisplay) {
        radioDisplay.textContent = d !== null && !Number.isNaN(d) && d > 0 ? `${formatMeters(Math.round(d / 2))} m` : '—';
      }
    };

    nivelBtns.forEach((btn) => {
      btn.addEventListener('click', () => setPressedButton(nivelBtns, btn.textContent.trim()));
    });
    if (inDiam) inDiam.addEventListener('input', updateRadio);

    let editId = zonaId;
    if (restore) {
      const draft = loadDraft('zona');
      if (draft) {
        editId = draft.editId || null;
        if (inNombre) inNombre.value = draft.nombre || '';
        if (inDesc) inDesc.value = draft.descripcion || '';
        setPressedButton(nivelBtns, draft.nivelRiesgo || 'Alto');
        if (inLat) inLat.value = draft.lat ?? '';
        if (inLon) inLon.value = draft.lon ?? '';
        if (inDiam) inDiam.value = draft.diametro ?? '';
      }
    } else if (editId) {
      const z = await apiRequest('GET', `/api/zonas/${encodeURIComponent(editId)}`);
      if (h1) h1.textContent = 'Modificar zona de riesgo';
      document.title = 'SIGRI · Modificar zona de riesgo';
      if (btnGuardar) btnGuardar.textContent = 'Guardar cambios';
      if (inNombre) inNombre.value = z.nombre;
      if (inDesc) inDesc.value = z.descripcion || '';
      setPressedButton(nivelBtns, z.nivelRiesgo);
      if (inLat) inLat.value = z.lat.toFixed(6);
      if (inLon) inLon.value = z.lon.toFixed(6);
      if (inDiam) inDiam.value = String(z.diametro);
    } else if (isNew) {
      if (inNombre) inNombre.value = '';
      if (inNombre) inNombre.placeholder = 'Ej. Arroyo El Pescado – Ignacio Correas';
      if (inDesc) inDesc.value = '';
      if (inDesc) inDesc.placeholder = 'Descripción de la zona';
      setPressedButton(nivelBtns, 'Medio');
      if (inLat) inLat.value = '-34.920000';
      if (inLon) inLon.value = '-57.950000';
      if (inDiam) inDiam.value = '1200';
    }
    if (editId && h1) {
      h1.textContent = 'Modificar zona de riesgo';
      if (btnGuardar) btnGuardar.textContent = 'Guardar cambios';
    }
    updateRadio();

    if (btnGuardar) {
      btnGuardar.addEventListener('click', async (e) => {
        e.preventDefault();
        const payload = {
          nombre: inNombre?.value || '',
          descripcion: inDesc?.value || '',
          nivelRiesgo: getSelectedButtonText(nivelBtns),
          lat: inLat?.value || '',
          lon: inLon?.value || '',
          diametro: inDiam?.value || ''
        };
        try {
          if (editId) {
            await apiRequest('PUT', `/api/zonas/${encodeURIComponent(editId)}`, payload);
          } else {
            await apiRequest('POST', '/api/zonas', payload);
          }
          clearDraft();
          window.location.href = 'Zonas.html';
        } catch (err) {
          saveDraft('zona', { ...payload, editId });
          const p = err.payload || {};
          const backUrl = editId ? `DlgZona.html?restore=1&id=${encodeURIComponent(editId)}` : 'DlgZona.html?restore=1&mode=new';
          setMsgContext({
            type: 'advertencia',
            title: p.title || 'Datos no válidos',
            detail: p.detail || err.message,
            primaryHref: backUrl,
            primaryText: 'Aceptar'
          });
          window.location.href = 'MsgAdvertencia.html';
        }
      });
    }
  }

  // ---------------- PAGE: DlgAsociarSensores.html ----------------
  async function initDlgAsociarSensoresPage() {
    const params = getQueryParams();
    const zonaId = params.get('id') || 'Z-001';
    const data = await apiRequest('GET', `/api/zonas/${encodeURIComponent(zonaId)}/sensores`);
    const { zona, sensores } = data;

    const subtitle = document.querySelector('h1')?.nextElementSibling;
    if (subtitle) subtitle.textContent = `Zona ${zona.nombre} · radio ${formatMeters(zona.radio)} m`;

    const listContainer = document.querySelector('[role="dialog"] > div:nth-child(2)');
    const counterSpan = Array.from(document.querySelectorAll('span')).find((s) => s.previousElementSibling?.textContent.trim() === 'Sensores seleccionados');
    const btnGuardar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Guardar asociación');

    const updateCountAndStyles = () => {
      const checks = Array.from(listContainer.querySelectorAll('input[type="checkbox"]'));
      let count = 0;
      checks.forEach((cb) => {
        const lbl = cb.closest('label');
        if (cb.checked) {
          count++;
          lbl.style.border = '2px solid #0284C7';
          lbl.style.background = '#EBF5FA';
        } else {
          lbl.style.border = '1.5px solid #D4C9BA';
          lbl.style.background = '#FFFFFF';
        }
      });
      if (counterSpan) counterSpan.textContent = String(count);
    };

    if (listContainer) {
      listContainer.style.maxHeight = '360px';
      listContainer.style.overflowY = 'auto';
      listContainer.innerHTML = sensores.map((s) => {
        const badge = s.dentroDeZona
          ? '<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1.5px solid transparent;background:#DCF2E3;color:#14532D;font-size:12px;font-weight:700;white-space:nowrap">Dentro de la zona</span>'
          : '<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1.5px solid transparent;background:#EAE3D6;color:#524337;font-size:12px;font-weight:700;white-space:nowrap">Fuera de la zona</span>';
        return `
          <label style="display:flex;align-items:center;gap:14px;min-height:60px;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;cursor:pointer;flex-shrink:0">
            <input type="checkbox" value="${escapeHtml(s.codigo)}" ${s.asociado ? 'checked' : ''} style="width:20px;height:20px;margin:0;accent-color:#0284C7">
            <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:15px;font-weight:700">${escapeHtml(s.codigo)}</span>
            <span style="flex:1 1 0;display:flex;flex-direction:column"><span style="font-weight:700">${escapeHtml(s.tipo)}</span><span style="color:#6F5E51;font-size:13px">a ${escapeHtml(formatMeters(s.distanciaMetros))} m del centro</span></span>
            ${badge}
          </label>
        `;
      }).join('');

      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', updateCountAndStyles);
      });
      updateCountAndStyles();
    }

    if (btnGuardar) {
      btnGuardar.addEventListener('click', async (e) => {
        e.preventDefault();
        const checked = Array.from(listContainer.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
        await apiRequest('PUT', `/api/zonas/${encodeURIComponent(zonaId)}/sensores`, { sensoresCodigos: checked });
        window.location.href = 'Zonas.html';
      });
    }
  }

  // ---------------- PAGE: DlgEliminarZona.html ----------------
  async function initDlgEliminarZonaPage() {
    const params = getQueryParams();
    const zonaId = params.get('id') || 'Z-004';
    const z = await apiRequest('GET', `/api/zonas/${encodeURIComponent(zonaId)}`);

    const bodyBox = document.querySelector('[role="dialog"] > div:nth-child(2) > div:nth-child(2)');
    if (bodyBox) {
      const spans = bodyBox.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = `¿Eliminar ${z.nombre}?`;
      if (spans[1]) {
        const sTxt = `${z.sensoresCount} ${z.sensoresCount === 1 ? 'sensor asociado' : 'sensores asociados'}`;
        const uTxt = `${z.umbralesCount} ${z.umbralesCount === 1 ? 'umbral configurado' : 'umbrales configurados'}`;
        spans[1].textContent = `Se quitan ${sTxt} y ${uTxt}. El historial de mediciones y alertas se conserva. Esta acción no se puede deshacer.`;
      }
    }

    const btnEliminar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.includes('eliminar zona'));
    if (btnEliminar) {
      btnEliminar.addEventListener('click', async (e) => {
        e.preventDefault();
        await apiRequest('DELETE', `/api/zonas/${encodeURIComponent(zonaId)}`);
        window.location.href = 'Zonas.html';
      });
    }
  }

  // ---------------- PAGE: SENSORES (Sensores.html) ----------------
  async function initSensoresPage() {
    let estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedCodigo = null;
    let userCleared = false;

    const newLink = document.querySelector('a[href^="DlgSensor.html"]');
    if (newLink) newLink.href = 'DlgSensor.html?mode=new';

    const inCodigo = findLabelInput('Buscar por código');
    const selEstado = findLabelInput('Estado');
    const selTipo = findLabelInput('Tipo');
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedCodigo);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná un sensor para ubicarlo en el mapa',
      onReset: () => {
        userCleared = true;
        selectedCodigo = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'sensor') {
          userCleared = false;
          selectedCodigo = entity.codigo;
          syncRowHighlight();
          miniMap.selectTarget({ type: 'sensor', codigo: entity.codigo });
        } else {
          miniMap.selectTarget(entity);
        }
      }
    });

    const chkSinZona = miniMap?.middleCol.querySelector('input[type="checkbox"]') || document.querySelector('main input[type="checkbox"]');
    const footerSpan = miniMap?.middleCol.querySelector(':scope > span') || document.querySelector('main > span');

    const render = () => {
      const q = (inCodigo?.value || '').trim().toLowerCase();
      const est = selEstado?.value || 'Todos';
      const tipo = selTipo?.value || 'Todos';
      const sinZona = Boolean(chkSinZona?.checked);

      const filtered = estado.sensores.filter((s) => {
        if (q && !s.codigo.toLowerCase().includes(q)) return false;
        if (est !== 'Todos' && s.estado !== est) return false;
        if (tipo !== 'Todos' && s.tipo !== tipo) return false;
        if (sinZona && s.zonasIds.length > 0) return false;
        return true;
      });

      if (!userCleared && (!selectedCodigo || !filtered.some((s) => s.codigo === selectedCodigo))) {
        selectedCodigo = filtered[0]?.codigo || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No se encontraron sensores que coincidan con los filtros.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((s) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = s.codigo;
          row.style.cssText = 'display:grid;grid-template-columns:72px 105px minmax(150px,1.1fr) 128px minmax(150px,1.4fr) 110px 92px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          const zonasHtml = s.zonasNombres.length > 0
            ? escapeHtml(s.zonasNombres.join(', '))
            : '<span style="color:#6F5E51;font-style:italic">Sin zona asociada</span>';
          const medHtml = s.ultimaMedicion
            ? `<div style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:700"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(formatValorUnidad(s.ultimaMedicion.valor, s.unidad))}</span></span><span style="color:#6F5E51;font-size:12px"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px">${escapeHtml(formatShortDateTime(s.ultimaMedicion.fechaHora))}</span></span></div>`
            : '<span style="color:#6F5E51">Sin mediciones</span>';
          row.innerHTML = `
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;font-weight:700">${escapeHtml(s.codigo)}</span></div>
            <div style="min-width:0">${escapeHtml(s.tipo)}</div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px">${escapeHtml(formatCoords(s.lat, s.lon))}</span></div>
            <div style="min-width:0">${badgeEstadoSensorHtml(s.estado)}</div>
            <div style="min-width:0">${zonasHtml}</div>
            <div style="min-width:0">${medHtml}</div>
            <div style="min-width:0"><div style="display:flex;gap:6px;justify-content:flex-end">
              <a href="DlgSensor.html?codigo=${encodeURIComponent(s.codigo)}" aria-label="Modificar ${escapeHtml(s.codigo)}" title="Modificar sensor" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#2B1D14;border:none;cursor:pointer;padding:0">${ICONS.edit}</a>
              <button type="button" data-delete-sensor="${escapeHtml(s.codigo)}" aria-label="Eliminar ${escapeHtml(s.codigo)}" title="Eliminar sensor" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#8B1A1A;border:none;cursor:pointer;padding:0">${ICONS.trash}</button>
            </div></div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedCodigo = s.codigo;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'sensor', codigo: s.codigo });
          });
          table.inner.appendChild(row);
        });

        table.inner.querySelectorAll('[data-delete-sensor]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cod = btn.dataset.deleteSensor;
            showConfirmModal({
              titulo: 'Eliminar sensor',
              pregunta: `¿Eliminar el sensor ${cod}?`,
              detalle: 'Se quitará el sensor de las zonas asociadas. El historial de mediciones y alertas se conserva.',
              textoConfirmar: 'Sí, eliminar sensor',
              onConfirm: async () => {
                await apiRequest('DELETE', `/api/sensores/${encodeURIComponent(cod)}`);
                estado = await apiRequest('GET', '/api/estado');
                if (selectedCodigo === cod) selectedCodigo = null;
                miniMap?.updateState(estado);
                render();
              }
            });
          });
        });
      }

      syncRowHighlight();
      if (miniMap && selectedCodigo && filtered.some((s) => s.codigo === selectedCodigo)) {
        miniMap.selectTarget({ type: 'sensor', codigo: selectedCodigo });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }

      if (footerSpan) {
        const activos = estado.sensores.filter((s) => s.estado === 'Activo').length;
        footerSpan.textContent = filtered.length === estado.sensores.length
          ? `${estado.sensores.length} sensores registrados · ${activos} activos`
          : `Mostrando ${filtered.length} de ${estado.sensores.length} sensores registrados · ${activos} activos`;
      }
    };

    if (inCodigo) inCodigo.addEventListener('input', () => { userCleared = false; render(); });
    if (selEstado) selEstado.addEventListener('change', () => { userCleared = false; render(); });
    if (selTipo) selTipo.addEventListener('change', () => { userCleared = false; render(); });
    if (chkSinZona) chkSinZona.addEventListener('change', () => { userCleared = false; render(); });
    render();
  }

  // ---------------- PAGE: DlgSensor.html ----------------
  async function initDlgSensorPage() {
    const params = getQueryParams();
    const codigoParam = params.get('codigo');
    const restore = params.get('restore') === '1';

    const h1 = document.querySelector('h1');
    const inCodigo = findLabelInput('Código');
    const selTipo = findLabelInput('Tipo de sensor');
    const inLat = findLabelInput('Latitud');
    const inLon = findLabelInput('Longitud');
    const selEstado = findLabelInput('Estado operativo');
    const btnGuardar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Registrar sensor');

    const mapTipoLabelToValue = (txt) => {
      if (txt.startsWith('Pluviómetro')) return 'Pluviómetro';
      if (txt.startsWith('Caudal')) return 'Caudal';
      return 'Nivel de agua';
    };

    const selectTipoByName = (tipo) => {
      if (!selTipo) return;
      const opt = Array.from(selTipo.options).find((o) => o.textContent.startsWith(tipo));
      if (opt) selTipo.value = opt.value;
    };

    let editCodigo = codigoParam;
    if (restore) {
      const draft = loadDraft('sensor');
      if (draft) {
        editCodigo = draft.editCodigo || null;
        if (inCodigo) inCodigo.value = draft.codigo || '';
        selectTipoByName(draft.tipo || 'Pluviómetro');
        if (inLat) inLat.value = draft.lat ?? '';
        if (inLon) inLon.value = draft.lon ?? '';
        if (selEstado) selEstado.value = draft.estado || 'Activo';
      }
    } else if (editCodigo) {
      const s = await apiRequest('GET', `/api/sensores/${encodeURIComponent(editCodigo)}`);
      if (inCodigo) inCodigo.value = s.codigo;
      selectTipoByName(s.tipo);
      if (inLat) inLat.value = s.lat.toFixed(6);
      if (inLon) inLon.value = s.lon.toFixed(6);
      if (selEstado) selEstado.value = s.estado;
    } else {
      const sensores = await apiRequest('GET', '/api/sensores');
      let maxNum = 9;
      sensores.forEach((s) => {
        const m = s.codigo.match(/^SN-(\d+)$/i);
        if (m) maxNum = Math.max(maxNum, Number(m[1]));
      });
      if (inCodigo) inCodigo.value = `SN-${String(maxNum + 1).padStart(3, '0')}`;
    }

    if (editCodigo && h1) {
      h1.textContent = `Modificar sensor ${editCodigo}`;
      document.title = 'SIGRI · Modificar sensor';
      if (btnGuardar) btnGuardar.textContent = 'Guardar cambios';
    }

    if (btnGuardar) {
      btnGuardar.addEventListener('click', async (e) => {
        e.preventDefault();
        const payload = {
          codigo: inCodigo?.value || '',
          tipo: mapTipoLabelToValue(selTipo?.value || ''),
          lat: inLat?.value || '',
          lon: inLon?.value || '',
          estado: selEstado?.value || 'Activo'
        };
        try {
          if (editCodigo) {
            await apiRequest('PUT', `/api/sensores/${encodeURIComponent(editCodigo)}`, payload);
          } else {
            await apiRequest('POST', '/api/sensores', payload);
          }
          clearDraft();
          window.location.href = 'Sensores.html';
        } catch (err) {
          saveDraft('sensor', { ...payload, editCodigo });
          const p = err.payload || {};
          const backUrl = editCodigo
            ? `DlgSensor.html?restore=1&codigo=${encodeURIComponent(editCodigo)}`
            : 'DlgSensor.html?restore=1&mode=new';
          if (err.status === 409) {
            setMsgContext({
              type: 'error',
              title: p.title || 'No se pudo registrar el sensor',
              codigo: p.codigo || payload.codigo,
              detailHtml: `Ya existe un sensor con el código <strong style="font-family:'JetBrains Mono',ui-monospace,monospace;color:#2B1D14">${escapeHtml((p.codigo || payload.codigo).toUpperCase())}</strong>. Ingresá un código distinto para continuar.`,
              cancelHref: 'Sensores.html',
              cancelText: 'Cancelar',
              primaryHref: backUrl,
              primaryText: 'Corregir código'
            });
            window.location.href = 'MsgError.html';
          } else {
            setMsgContext({
              type: 'advertencia',
              title: p.title || 'Datos no válidos',
              detail: p.detail || err.message,
              primaryHref: backUrl,
              primaryText: 'Aceptar'
            });
            window.location.href = 'MsgAdvertencia.html';
          }
        }
      });
    }
  }

  // ---------------- PAGE: UMBRALES (Umbrales.html) ----------------
  async function initUmbralesPage() {
    let estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedId = null;
    let userCleared = false;
    let currentFiltered = [];

    const newLink = document.querySelector('a[href^="DlgUmbral.html"]');
    if (newLink) newLink.href = 'DlgUmbral.html?mode=new';

    const selZona = findLabelInput('Zona de riesgo');
    const selTipo = findLabelInput('Tipo de sensor');
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedId);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná un umbral para ver su zona de aplicación',
      onReset: () => {
        userCleared = true;
        selectedId = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'zona') {
          const match = currentFiltered.find((u) => u.zonaId === entity.id);
          if (match) {
            userCleared = false;
            selectedId = match.id;
            syncRowHighlight();
            miniMap.selectTarget({ type: 'umbral', id: match.id });
            return;
          }
        }
        miniMap.selectTarget(entity);
      }
    });

    const populateZonas = () => {
      if (!selZona) return;
      const prev = selZona.value;
      selZona.innerHTML = '<option value="Todas">Todas</option>' +
        estado.zonas.map((z) => `<option value="${escapeHtml(z.id)}">${escapeHtml(z.nombre)}</option>`).join('');
      if (Array.from(selZona.options).some((o) => o.value === prev)) {
        selZona.value = prev;
      }
    };

    const render = () => {
      const zId = selZona?.value || 'Todas';
      const tipo = selTipo?.value || 'Todos';
      const filtered = estado.umbrales.filter((u) => {
        if (zId !== 'Todas' && u.zonaId !== zId) return false;
        if (tipo !== 'Todos' && u.tipo !== tipo) return false;
        return true;
      });
      currentFiltered = filtered;

      if (!userCleared && (!selectedId || !filtered.some((u) => u.id === selectedId))) {
        selectedId = filtered[0]?.id || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No se encontraron umbrales para los filtros seleccionados.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((u) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = u.id;
          row.style.cssText = 'display:grid;grid-template-columns:minmax(180px,1.8fr) minmax(110px,1fr) 105px 105px 100px 92px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          const minHtml = u.minimo !== null && u.minimo !== undefined
            ? `<span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px">${escapeHtml(formatValorUnidad(u.minimo, u.unidad))}</span>`
            : '<span style="color:#6F5E51">Sin mínimo</span>';
          const maxHtml = u.maximo !== null && u.maximo !== undefined
            ? `<span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;font-weight:700">${escapeHtml(formatValorUnidad(u.maximo, u.unidad))}</span>`
            : '<span style="color:#6F5E51">Sin máximo</span>';
          row.innerHTML = `
            <div style="min-width:0"><span style="font-weight:700">${escapeHtml(u.zonaNombre)}</span></div>
            <div style="min-width:0">${escapeHtml(u.tipo)}</div>
            <div style="min-width:0">${minHtml}</div>
            <div style="min-width:0">${maxHtml}</div>
            <div style="min-width:0">${badgeNivelHtml(u.nivelAlerta)}</div>
            <div style="min-width:0"><div style="display:flex;gap:6px;justify-content:flex-end">
              <a href="DlgUmbral.html?id=${encodeURIComponent(u.id)}" aria-label="Modificar umbral" title="Modificar umbral" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#2B1D14;border:none;cursor:pointer;padding:0">${ICONS.edit}</a>
              <button type="button" data-delete-umbral="${escapeHtml(u.id)}" aria-label="Eliminar umbral" title="Eliminar umbral" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#8B1A1A;border:none;cursor:pointer;padding:0">${ICONS.trash}</button>
            </div></div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedId = u.id;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'umbral', id: u.id });
          });
          table.inner.appendChild(row);
        });

        table.inner.querySelectorAll('[data-delete-umbral]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.deleteUmbral;
            const u = estado.umbrales.find((x) => x.id === id);
            showConfirmModal({
              titulo: 'Eliminar umbral',
              pregunta: `¿Eliminar umbral de ${u?.tipo || ''} en ${u?.zonaNombre || ''}?`,
              detalle: 'Las futuras mediciones en esta zona dejarán de evaluarse contra este límite.',
              textoConfirmar: 'Sí, eliminar umbral',
              onConfirm: async () => {
                await apiRequest('DELETE', `/api/umbrales/${encodeURIComponent(id)}`);
                estado = await apiRequest('GET', '/api/estado');
                if (selectedId === id) selectedId = null;
                miniMap?.updateState(estado);
                populateZonas();
                render();
              }
            });
          });
        });
      }

      syncRowHighlight();
      if (miniMap && selectedId && filtered.some((u) => u.id === selectedId)) {
        miniMap.selectTarget({ type: 'umbral', id: selectedId });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }
    };

    populateZonas();
    if (selZona) selZona.addEventListener('change', () => { userCleared = false; render(); });
    if (selTipo) selTipo.addEventListener('change', () => { userCleared = false; render(); });
    render();
  }

  // ---------------- PAGE: DlgUmbral.html ----------------
  async function initDlgUmbralPage() {
    const params = getQueryParams();
    const umbralId = params.get('id');
    const restore = params.get('restore') === '1';

    const zonas = await apiRequest('GET', '/api/zonas');
    const h1 = document.querySelector('h1');
    const selZona = findLabelInput('Zona de riesgo');
    const selTipo = findLabelInput('Tipo de sensor');
    const inMin = findLabelInput('Valor mínimo');
    const inMax = findLabelInput('Valor máximo');
    const nivelBtns = findButtonGroupByTitle('Nivel de alerta que genera');
    const btnGuardar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Registrar umbral');

    if (selZona) {
      selZona.innerHTML = zonas.map((z) => `<option value="${escapeHtml(z.id)}">${escapeHtml(z.nombre)}</option>`).join('');
    }

    const mapTipoLabelToValue = (txt) => {
      if (txt.startsWith('Pluviómetro')) return 'Pluviómetro';
      if (txt.startsWith('Caudal')) return 'Caudal';
      return 'Nivel de agua';
    };

    const updateUnitLabels = () => {
      const tipo = mapTipoLabelToValue(selTipo?.value || '');
      const unit = SENSOR_UNITS[tipo] || 'm';
      if (inMin?.parentElement?.firstChild) {
        inMin.parentElement.firstChild.textContent = `Valor mínimo (${unit})`;
      }
      if (inMax?.parentElement?.firstChild) {
        inMax.parentElement.firstChild.textContent = `Valor máximo (${unit})`;
      }
    };

    if (selTipo) selTipo.addEventListener('change', updateUnitLabels);
    nivelBtns.forEach((btn) => {
      btn.addEventListener('click', () => setPressedButton(nivelBtns, btn.textContent.trim()));
    });

    const selectTipoByName = (tipo) => {
      if (!selTipo) return;
      const opt = Array.from(selTipo.options).find((o) => o.textContent.startsWith(tipo));
      if (opt) selTipo.value = opt.value;
    };

    let editId = umbralId;
    if (restore) {
      const draft = loadDraft('umbral');
      if (draft) {
        editId = draft.editId || null;
        if (selZona && draft.zonaId) selZona.value = draft.zonaId;
        selectTipoByName(draft.tipo || 'Nivel de agua');
        if (inMin) inMin.value = draft.minimo ?? '';
        if (inMax) inMax.value = draft.maximo ?? '';
        setPressedButton(nivelBtns, draft.nivelAlerta || 'Alto');
      }
    } else if (editId) {
      const u = await apiRequest('GET', `/api/umbrales/${encodeURIComponent(editId)}`);
      if (selZona) selZona.value = u.zonaId;
      selectTipoByName(u.tipo);
      const dec = u.tipo === 'Nivel de agua' ? 2 : 1;
      if (inMin) inMin.value = u.minimo !== null && u.minimo !== undefined ? formatDecimals(u.minimo, dec) : '';
      if (inMax) inMax.value = u.maximo !== null && u.maximo !== undefined ? formatDecimals(u.maximo, dec) : '';
      setPressedButton(nivelBtns, u.nivelAlerta);
    } else {
      if (inMin) inMin.value = '';
      if (inMax) inMax.value = '';
      if (inMax) inMax.placeholder = 'Sin máximo';
    }

    if (editId && h1) {
      h1.textContent = 'Modificar umbral';
      document.title = 'SIGRI · Modificar umbral';
      if (btnGuardar) btnGuardar.textContent = 'Guardar cambios';
    }
    updateUnitLabels();

    if (btnGuardar) {
      btnGuardar.addEventListener('click', async (e) => {
        e.preventDefault();
        const payload = {
          zonaId: selZona?.value || '',
          tipo: mapTipoLabelToValue(selTipo?.value || ''),
          minimo: inMin?.value || '',
          maximo: inMax?.value || '',
          nivelAlerta: getSelectedButtonText(nivelBtns)
        };
        try {
          if (editId) {
            await apiRequest('PUT', `/api/umbrales/${encodeURIComponent(editId)}`, payload);
          } else {
            await apiRequest('POST', '/api/umbrales', payload);
          }
          clearDraft();
          window.location.href = 'Umbrales.html';
        } catch (err) {
          saveDraft('umbral', { ...payload, editId });
          const p = err.payload || {};
          const backUrl = editId ? `DlgUmbral.html?restore=1&id=${encodeURIComponent(editId)}` : 'DlgUmbral.html?restore=1&mode=new';
          setMsgContext({
            type: 'advertencia',
            title: p.title || 'Valores de umbral no válidos',
            detail: p.detail || err.message,
            primaryHref: backUrl,
            primaryText: 'Aceptar'
          });
          window.location.href = 'MsgAdvertencia.html';
        }
      });
    }
  }

  // ---------------- PAGE: MEDICIONES (Mediciones.html) ----------------
  async function initMedicionesPage() {
    let estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedId = null;
    let userCleared = false;
    let currentFiltered = [];

    const selSensor = findLabelInput('Sensor');
    const selZona = findLabelInput('Zona');
    const inDesde = findLabelInput('Desde');
    const inHasta = findLabelInput('Hasta');
    const btnLimpiar = Array.from(document.querySelectorAll('main button')).find((b) => b.textContent.trim() === 'Limpiar filtros');

    // Simulation banner (query before wrapping into split column)
    const banner = document.querySelector('main > div:nth-child(2)');
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedId);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná una medición para ubicar su sensor',
      onReset: () => {
        userCleared = true;
        selectedId = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'sensor') {
          const match = currentFiltered.find((m) => m.sensorCodigo === entity.codigo);
          if (match) {
            userCleared = false;
            selectedId = match.id;
            syncRowHighlight();
            miniMap.selectTarget({ type: 'medicion', id: match.id });
            return;
          }
        }
        miniMap.selectTarget(entity);
      }
    });

    if (banner) {
      const statusBadge = Array.from(banner.querySelectorAll('span')).find((s) => s.textContent.trim() === 'En ejecución' || s.textContent.trim() === 'Pausada');
      const simSubtitle = Array.from(banner.querySelectorAll('span')).find((s) => s.textContent.includes('Genera mediciones para los sensores activos'));

      const refreshBanner = (sim) => {
        if (statusBadge) {
          statusBadge.style.cursor = 'pointer';
          statusBadge.title = 'Clic para pausar o reanudar la simulación automática';
          if (sim.activa) {
            statusBadge.textContent = 'En ejecución';
            statusBadge.style.background = '#DCF2E3';
            statusBadge.style.color = '#14532D';
          } else {
            statusBadge.textContent = 'Pausada';
            statusBadge.style.background = '#FDEBC8';
            statusBadge.style.color = '#7A3E00';
          }
        }
        if (simSubtitle) {
          simSubtitle.textContent = `Genera mediciones para los sensores activos cada ${sim.intervaloMinutos} minutos · última ejecución ${sim.ultimaEjecucion} · próxima ${sim.proximaEjecucion}`;
        }
      };

      refreshBanner(estado.simulacion);
      if (statusBadge) {
        statusBadge.addEventListener('click', async () => {
          const updated = await apiRequest('PATCH', '/api/simulacion', { activa: !estado.simulacion.activa });
          estado.simulacion = updated;
          refreshBanner(updated);
        });
      }
    }

    // Populate filters
    if (selSensor) {
      selSensor.innerHTML = '<option value="Todos">Todos</option>' +
        estado.sensores.map((s) => `<option value="${escapeHtml(s.codigo)}">${escapeHtml(s.codigo)}</option>`).join('');
    }
    if (selZona) {
      selZona.innerHTML = '<option value="Todas">Todas</option>' +
        estado.zonas.map((z) => `<option value="${escapeHtml(z.nombre)}">${escapeHtml(z.nombre)}</option>`).join('') +
        '<option value="Sin zona asociada">Sin zona asociada</option>';
    }
    if (inHasta && estado.simulacion?.fechaISO && inHasta.value < estado.simulacion.fechaISO) {
      inHasta.value = estado.simulacion.fechaISO;
    }

    const render = () => {
      const fSensor = selSensor?.value || 'Todos';
      const fZona = selZona?.value || 'Todas';
      const fDesde = inDesde?.value || '';
      const fHasta = inHasta?.value || '';

      const filtered = estado.mediciones.filter((m) => {
        if (fSensor !== 'Todos' && m.sensorCodigo !== fSensor) return false;
        if (fZona !== 'Todas' && !m.zonaNombre.includes(fZona)) return false;
        if (fDesde && m.fechaISO < fDesde) return false;
        if (fHasta && m.fechaISO > fHasta) return false;
        return true;
      });
      currentFiltered = filtered;

      if (!userCleared && (!selectedId || !filtered.some((m) => m.id === selectedId))) {
        selectedId = filtered[0]?.id || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No se encontraron mediciones para los filtros aplicados.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((m) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = m.id;
          row.style.cssText = 'display:grid;grid-template-columns:145px 65px 105px minmax(150px,1.4fr) 88px 98px 155px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          const zonaHtml = m.zonaNombre === 'Sin zona asociada'
            ? '<span style="color:#6F5E51;font-style:italic">Sin zona asociada</span>'
            : escapeHtml(m.zonaNombre);
          row.innerHTML = `
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px">${escapeHtml(m.fechaHora)}</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(m.sensorCodigo)}</span></div>
            <div style="min-width:0">${escapeHtml(m.tipo)}</div>
            <div style="min-width:0">${zonaHtml}</div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(formatValorUnidad(m.valor, m.unidad))}</span></div>
            <div style="min-width:0">${badgeOrigenHtml(m.origen)}</div>
            <div style="min-width:0">${badgeEvaluacionHtml(m)}</div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedId = m.id;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'medicion', id: m.id });
          });
          table.inner.appendChild(row);
        });
      }

      syncRowHighlight();
      if (miniMap && selectedId && filtered.some((m) => m.id === selectedId)) {
        miniMap.selectTarget({ type: 'medicion', id: selectedId });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }
    };

    if (selSensor) selSensor.addEventListener('change', () => { userCleared = false; render(); });
    if (selZona) selZona.addEventListener('change', () => { userCleared = false; render(); });
    if (inDesde) inDesde.addEventListener('change', () => { userCleared = false; render(); });
    if (inHasta) inHasta.addEventListener('change', () => { userCleared = false; render(); });
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        if (selSensor) selSensor.value = 'Todos';
        if (selZona) selZona.value = 'Todas';
        if (inDesde) inDesde.value = '';
        if (inHasta) inHasta.value = '';
        userCleared = false;
        render();
      });
    }
    render();
  }

  // ---------------- PAGE: DlgMedicion.html ----------------
  async function initDlgMedicionPage() {
    const params = getQueryParams();
    const preSensor = params.get('sensor');
    const restore = params.get('restore') === '1';

    const estado = await apiRequest('GET', '/api/estado');
    const selSensor = findLabelInput('Sensor');
    const inValor = findLabelInput('Valor medido');
    const umbralLabelSpan = Array.from(document.querySelectorAll('span')).find((s) => s.textContent.trim().startsWith('Umbral'));
    const umbralValueSpan = umbralLabelSpan ? umbralLabelSpan.nextElementSibling : null;
    const btnRegistrar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Registrar medición');

    const sensoresOperativos = estado.sensores.filter((s) => s.estado !== 'Baja');
    if (selSensor) {
      selSensor.innerHTML = sensoresOperativos.map((s) => {
        const zName = s.zonasNombres.length ? s.zonasNombres.join(', ') : 'Sin zona asociada';
        return `<option value="${escapeHtml(s.codigo)}">${escapeHtml(s.codigo)} · ${escapeHtml(s.tipo)} · ${escapeHtml(zName)}</option>`;
      }).join('');
      if (preSensor && sensoresOperativos.some((s) => s.codigo === preSensor)) {
        selSensor.value = preSensor;
      } else if (sensoresOperativos.some((s) => s.codigo === 'SN-004')) {
        selSensor.value = 'SN-004';
      }
    }

    const updateUmbralInfo = () => {
      const s = sensoresOperativos.find((x) => x.codigo === selSensor?.value);
      if (!s) return;
      if (inValor?.parentElement?.firstChild) {
        inValor.parentElement.firstChild.textContent = `Valor medido (${s.unidad})`;
      }
      const umbs = estado.umbrales.filter((u) => s.zonasIds.includes(u.zonaId) && u.tipo === s.tipo);
      if (umbs.length === 0) {
        if (umbralLabelSpan) umbralLabelSpan.textContent = 'Umbral de la zona';
        if (umbralValueSpan) umbralValueSpan.textContent = 'Sin umbral';
      } else {
        const u = umbs[0];
        if (u.maximo !== null && u.minimo !== null) {
          if (umbralLabelSpan) umbralLabelSpan.textContent = 'Rango permitido en la zona';
          if (umbralValueSpan) umbralValueSpan.textContent = `${formatDecimals(u.minimo, s.unidad === 'm' ? 2 : 1)} – ${formatValorUnidad(u.maximo, s.unidad)}`;
        } else if (u.maximo !== null) {
          if (umbralLabelSpan) umbralLabelSpan.textContent = 'Umbral máximo de la zona';
          if (umbralValueSpan) umbralValueSpan.textContent = formatValorUnidad(u.maximo, s.unidad);
        } else {
          if (umbralLabelSpan) umbralLabelSpan.textContent = 'Umbral mínimo de la zona';
          if (umbralValueSpan) umbralValueSpan.textContent = formatValorUnidad(u.minimo, s.unidad);
        }
      }
    };

    if (restore) {
      const draft = loadDraft('medicion');
      if (draft) {
        if (selSensor && draft.sensorCodigo) selSensor.value = draft.sensorCodigo;
        if (inValor) inValor.value = draft.valor ?? '';
      }
    }
    if (selSensor) selSensor.addEventListener('change', updateUmbralInfo);
    updateUmbralInfo();

    if (btnRegistrar) {
      btnRegistrar.addEventListener('click', async (e) => {
        e.preventDefault();
        const payload = {
          sensorCodigo: selSensor?.value || '',
          valor: inValor?.value || ''
        };
        try {
          const res = await apiRequest('POST', '/api/mediciones', payload);
          clearDraft();
          const m = res.medicion;
          const valStr = formatValorUnidad(m.valor, m.unidad);
          if (res.alertasGeneradas && res.alertasGeneradas.length > 0) {
            const a = res.alertasGeneradas[0];
            setMsgContext({
              type: 'informacion',
              title: 'Medición registrada y alerta generada',
              detailHtml: `El valor <strong style="font-family:'JetBrains Mono',ui-monospace,monospace;color:#2B1D14">${escapeHtml(valStr)}</strong> de ${escapeHtml(m.sensorCodigo)} (${escapeHtml(a.condicion.toLowerCase())}). Se generó la alerta <strong>${escapeHtml(a.codigo)}</strong> en ${escapeHtml(a.zonaNombre)}.`,
              secondaryHref: 'Mediciones.html',
              secondaryText: 'Aceptar',
              primaryHref: `Alertas.html?codigo=${encodeURIComponent(a.codigo)}`,
              primaryText: 'Ver alerta'
            });
          } else if (m.evaluacionTipo === 'ok') {
            setMsgContext({
              type: 'informacion',
              title: 'Medición registrada dentro de umbral',
              detailHtml: `El valor <strong style="font-family:'JetBrains Mono',ui-monospace,monospace;color:#2B1D14">${escapeHtml(valStr)}</strong> de ${escapeHtml(m.sensorCodigo)} quedó registrado como medición manual dentro de los límites configurados.`,
              secondaryHref: 'Mediciones.html',
              secondaryText: 'Aceptar',
              primaryHref: 'index.html',
              primaryText: 'Ver en el mapa'
            });
          } else {
            setMsgContext({
              type: 'informacion',
              title: 'Medición registrada',
              detailHtml: `El valor <strong style="font-family:'JetBrains Mono',ui-monospace,monospace;color:#2B1D14">${escapeHtml(valStr)}</strong> de ${escapeHtml(m.sensorCodigo)} quedó registrado. No existen umbrales definidos para esta combinación de zona y tipo de sensor.`,
              secondaryHref: 'Mediciones.html',
              secondaryText: 'Aceptar',
              primaryHref: 'Umbrales.html',
              primaryText: 'Ver umbrales'
            });
          }
          window.location.href = 'MsgInformacion.html';
        } catch (err) {
          saveDraft('medicion', payload);
          const p = err.payload || {};
          setMsgContext({
            type: 'advertencia',
            title: p.title || 'Valor medido no válido',
            detail: p.detail || err.message,
            primaryHref: 'DlgMedicion.html?restore=1',
            primaryText: 'Aceptar'
          });
          window.location.href = 'MsgAdvertencia.html';
        }
      });
    }
  }

  // ---------------- PAGE: MsgProgreso.html ----------------
  async function initMsgProgresoPage() {
    const estado = await apiRequest('GET', '/api/estado');
    const activos = estado.resumen.sensoresActivos;
    const pDesc = document.querySelector('[role="dialog"] p');
    if (pDesc) {
      pDesc.textContent = `Generando mediciones para los ${activos} sensores activos y evaluando umbrales. No cierres esta pantalla.`;
    }

    const bar = document.querySelector('[role="progressbar"]');
    const fill = bar ? bar.firstElementChild : null;
    const btnCancelar = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Cancelar');

    let cancelled = false;
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => { cancelled = true; });
    }

    let pct = 15;
    const setProgress = (val) => {
      if (bar) bar.setAttribute('aria-valuenow', String(val));
      if (fill) {
        fill.style.transition = 'width 0.25s ease';
        fill.style.width = `${val}%`;
      }
    };
    setProgress(pct);

    const timer = setInterval(async () => {
      if (cancelled) {
        clearInterval(timer);
        return;
      }
      pct = Math.min(100, pct + 28);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        const res = await apiRequest('POST', '/api/mediciones/simular');
        if (cancelled) return;
        const nMed = res.medicionesGeneradas.length;
        const nAlt = res.alertasGeneradas.length;
        if (nAlt > 0) {
          const codigos = res.alertasGeneradas.map((a) => a.codigo).join(', ');
          setMsgContext({
            type: 'informacion',
            title: 'Simulación automática completada',
            detailHtml: `Se generaron <strong>${nMed}</strong> mediciones para los sensores activos y se dispararon <strong>${nAlt}</strong> ${nAlt === 1 ? 'nueva alerta' : 'nuevas alertas'} (<strong style="font-family:'JetBrains Mono',ui-monospace,monospace;color:#2B1D14">${escapeHtml(codigos)}</strong>).`,
            secondaryHref: 'Mediciones.html',
            secondaryText: 'Aceptar',
            primaryHref: 'Alertas.html',
            primaryText: 'Ver alertas'
          });
        } else {
          setMsgContext({
            type: 'informacion',
            title: 'Simulación automática completada',
            detailHtml: `Se generaron <strong>${nMed}</strong> mediciones para los sensores activos. Todas las lecturas evaluadas se mantuvieron dentro de los umbrales configurados.`,
            secondaryHref: 'Mediciones.html',
            secondaryText: 'Aceptar',
            primaryHref: 'index.html',
            primaryText: 'Ver mapa'
          });
        }
        window.location.href = 'MsgInformacion.html';
      }
    }, 320);
  }

  // ---------------- PAGE: ALERTAS (Alertas.html) ----------------
  async function initAlertasPage() {
    const params = getQueryParams();
    const zonaParam = params.get('zona');
    const codigoParam = params.get('codigo');

    const estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedCodigo = codigoParam || null;
    let userCleared = false;
    let currentFiltered = [];

    const selZona = findLabelInput('Zona de riesgo');
    const selSensor = findLabelInput('Sensor');
    const selEstado = findLabelInput('Estado');
    const inDesde = findLabelInput('Desde');
    const inHasta = findLabelInput('Hasta');
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedCodigo);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná una alerta para ubicar el foco en el mapa',
      onReset: () => {
        userCleared = true;
        selectedCodigo = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'sensor') {
          const match = currentFiltered.find((a) => a.sensorCodigo === entity.codigo);
          if (match) {
            userCleared = false;
            selectedCodigo = match.codigo;
            syncRowHighlight();
            miniMap.selectTarget({ type: 'alerta', codigo: match.codigo });
            return;
          }
        } else if (entity.type === 'zona') {
          const match = currentFiltered.find((a) => a.zonaId === entity.id);
          if (match) {
            userCleared = false;
            selectedCodigo = match.codigo;
            syncRowHighlight();
            miniMap.selectTarget({ type: 'alerta', codigo: match.codigo });
            return;
          }
        }
        miniMap.selectTarget(entity);
      }
    });

    const footerSpan = miniMap?.middleCol.querySelector(':scope > span') || document.querySelector('main > span');

    if (selZona) {
      selZona.innerHTML = '<option value="Todas">Todas</option>' +
        estado.zonas.map((z) => `<option value="${escapeHtml(z.id)}">${escapeHtml(z.nombre)}</option>`).join('');
      if (zonaParam && estado.zonas.some((z) => z.id === zonaParam)) {
        selZona.value = zonaParam;
      }
    }
    if (selSensor) {
      selSensor.innerHTML = '<option value="Todos">Todos</option>' +
        estado.sensores.map((s) => `<option value="${escapeHtml(s.codigo)}">${escapeHtml(s.codigo)}</option>`).join('');
    }
    if (inHasta && estado.simulacion?.fechaISO && inHasta.value < estado.simulacion.fechaISO) {
      inHasta.value = estado.simulacion.fechaISO;
    }

    const render = () => {
      const fZona = selZona?.value || 'Todas';
      const fSensor = selSensor?.value || 'Todos';
      const fEstado = selEstado?.value || 'Todos';
      const fDesde = inDesde?.value || '';
      const fHasta = inHasta?.value || '';

      const filtered = estado.alertas.filter((a) => {
        if (fZona !== 'Todas' && a.zonaId !== fZona) return false;
        if (fSensor !== 'Todos' && a.sensorCodigo !== fSensor) return false;
        if (fEstado !== 'Todos' && a.estado !== fEstado) return false;
        if (fDesde && a.fechaISO < fDesde) return false;
        if (fHasta && a.fechaISO > fHasta) return false;
        return true;
      });
      currentFiltered = filtered;

      if (!userCleared && (!selectedCodigo || !filtered.some((a) => a.codigo === selectedCodigo))) {
        selectedCodigo = filtered[0]?.codigo || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No hay alertas que coincidan con los filtros aplicados.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((a) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = a.codigo;
          row.style.cssText = 'display:grid;grid-template-columns:135px 72px minmax(190px,2fr) 64px 88px 108px 142px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          row.innerHTML = `
            <div style="min-width:0"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;font-weight:700">${escapeHtml(a.codigo)}</span><span style="color:#6F5E51;font-size:11px;font-family:'JetBrains Mono',ui-monospace,monospace">${escapeHtml(a.fechaHora)}</span></div></div>
            <div style="min-width:0">${badgeNivelHtml(a.nivel)}</div>
            <div style="min-width:0"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:700">${escapeHtml(a.zonaNombre)}</span><span style="color:#6F5E51;font-size:12px">${escapeHtml(a.condicion)}</span></div></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(a.sensorCodigo)}</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:700">${escapeHtml(formatValorUnidad(a.valor, a.unidad))}</span></div>
            <div style="min-width:0">${badgeEstadoAlertaHtml(a.estado)}</div>
            <div style="min-width:0"><div style="display:flex;gap:6px;justify-content:flex-end"><a href="DlgEstadoAlerta.html?codigo=${encodeURIComponent(a.codigo)}" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:13px;white-space:nowrap;background:#EAE3D6;color:#2B1D14">Actualizar estado</a></div></div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedCodigo = a.codigo;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'alerta', codigo: a.codigo });
          });
          table.inner.appendChild(row);
        });
      }

      syncRowHighlight();
      if (miniMap && selectedCodigo && filtered.some((a) => a.codigo === selectedCodigo)) {
        miniMap.selectTarget({ type: 'alerta', codigo: selectedCodigo });
      } else if (miniMap && zonaParam && fZona === zonaParam) {
        miniMap.selectTarget({ type: 'zona', id: zonaParam });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }

      if (footerSpan) {
        const activasCount = filtered.filter((a) => a.estado === 'Activa').length;
        footerSpan.textContent = `${filtered.length} ${filtered.length === 1 ? 'alerta' : 'alertas'} en el período · ${activasCount} ${activasCount === 1 ? 'activa' : 'activas'}`;
      }
    };

    if (selZona) selZona.addEventListener('change', () => { userCleared = false; render(); });
    if (selSensor) selSensor.addEventListener('change', () => { userCleared = false; render(); });
    if (selEstado) selEstado.addEventListener('change', () => { userCleared = false; render(); });
    if (inDesde) inDesde.addEventListener('change', () => { userCleared = false; render(); });
    if (inHasta) inHasta.addEventListener('change', () => { userCleared = false; render(); });
    render();
  }

  // ---------------- PAGE: DlgEstadoAlerta.html ----------------
  async function initDlgEstadoAlertaPage() {
    const params = getQueryParams();
    const codigo = params.get('codigo') || 'A-0042';
    const a = await apiRequest('GET', `/api/alertas/${encodeURIComponent(codigo)}`);

    const summaryBox = document.querySelector('[role="dialog"] > div:nth-child(2)');
    if (summaryBox) {
      summaryBox.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:15px;font-weight:700">${escapeHtml(a.codigo)}</span>
          ${badgeNivelHtml(a.nivel)}
          ${badgeEstadoAlertaHtml(a.estado)}
        </div>
        <span style="font-weight:700">${escapeHtml(a.zonaNombre)}</span>
        <span style="color:#524337;font-size:14px">${escapeHtml(a.sensorCodigo)} · ${escapeHtml(a.detalleCorto)} · ${escapeHtml(a.fechaHora)}</span>
      `;
    }

    const fieldset = document.querySelector('fieldset');
    const radios = Array.from(fieldset.querySelectorAll('input[type="radio"]'));
    radios.forEach((r) => {
      const titleSpan = r.nextElementSibling?.querySelector('span');
      if (titleSpan) r.value = titleSpan.textContent.trim();
    });

    // If current alert isn't 'Activa', add 'Activa' option too so operator can reopen if desired
    if (a.estado !== 'Activa' && !radios.some((r) => r.value === 'Activa')) {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:14px;min-height:56px;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;cursor:pointer';
      lbl.innerHTML = '<input type="radio" name="estado" value="Activa" style="width:20px;height:20px;margin:0;accent-color:#0284C7"><span style="display:flex;flex-direction:column"><span style="font-weight:700">Activa</span><span style="color:#6F5E51;font-size:13px">Reabrir la alerta para seguimiento inmediato</span></span>';
      fieldset.insertBefore(lbl, fieldset.querySelector('label'));
      radios.unshift(lbl.querySelector('input'));
    }

    const preSelect = a.estado === 'Activa' ? 'En análisis' : a.estado;
    const syncStyles = () => {
      radios.forEach((r) => {
        const lbl = r.closest('label');
        if (r.checked) {
          lbl.style.border = '2px solid #0284C7';
          lbl.style.background = '#EBF5FA';
        } else {
          lbl.style.border = '1.5px solid #D4C9BA';
          lbl.style.background = '#FFFFFF';
        }
      });
    };

    radios.forEach((r) => {
      r.checked = r.value === preSelect;
      r.addEventListener('change', syncStyles);
    });
    syncStyles();

    const btnActualizar = Array.from(document.querySelectorAll('a')).find((el) => el.textContent.trim() === 'Actualizar estado');
    if (btnActualizar) {
      btnActualizar.addEventListener('click', async (e) => {
        e.preventDefault();
        const selected = radios.find((r) => r.checked)?.value || preSelect;
        await apiRequest('PATCH', `/api/alertas/${encodeURIComponent(a.codigo)}`, { estado: selected });
        window.location.href = 'Alertas.html';
      });
    }
  }

  // ---------------- PAGE: REFUGIOS (Refugios.html) ----------------
  async function initRefugiosPage() {
    let estado = await apiRequest('GET', '/api/estado');
    updateHeaderClock(estado.simulacion);

    let selectedId = null;
    let userCleared = false;

    const inSearch = findLabelInput('Buscar refugio');
    const btnNuevo = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.includes('Nuevo refugio'));
    const table = getTableParts();

    let miniMap = null;
    const syncRowHighlight = () => {
      Array.from(table.inner.querySelectorAll('[data-row-id]')).forEach((row) => {
        applyRowSelectionStyle(row, row.dataset.rowId === selectedId);
      });
    };

    miniMap = setupSplitLayoutWithMiniMap(estado, {
      subtitle: 'Seleccioná un refugio para ubicarlo en el mapa',
      onReset: () => {
        userCleared = true;
        selectedId = null;
        syncRowHighlight();
      },
      onMapEntityClick: (entity) => {
        if (entity.type === 'refugio') {
          userCleared = false;
          selectedId = entity.id;
          syncRowHighlight();
          miniMap.selectTarget({ type: 'refugio', id: entity.id });
        } else {
          miniMap.selectTarget(entity);
        }
      }
    });

    const openRefugioModal = (refugio) => {
      const existing = document.getElementById('sigri-dynamic-modal');
      if (existing) existing.remove();

      const isEdit = Boolean(refugio);
      const overlay = document.createElement('div');
      overlay.id = 'sigri-dynamic-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;padding:24px;box-sizing:border-box;background:rgba(42,27,18,0.72);display:flex;align-items:center;justify-content:center;font-family:"Manrope",system-ui,sans-serif;color:#2B1D14;font-size:15px;line-height:1.4';
      overlay.innerHTML = `
        <div role="dialog" aria-modal="true" style="width:640px;max-width:100%;box-sizing:border-box;background:#FFFFFF;border-radius:28px;border-top:8px solid #0284C7;padding:32px 36px 36px;display:flex;flex-direction:column;gap:18px;box-shadow:0 24px 60px rgba(45,29,19,0.35)">
          <div style="display:flex;flex-direction:column;gap:2px">
            <h2 style="margin:0;font-size:26px;font-weight:800;letter-spacing:-0.01em">${isEdit ? 'Modificar refugio' : 'Registrar refugio'}</h2>
            <span style="color:#6F5E51">Punto de resguardo informativo que se muestra en el mapa</span>
          </div>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#6F5E51">Nombre<input type="text" data-field="nombre" value="${escapeHtml(refugio?.nombre || '')}" placeholder="Ej. Escuela Primaria N° 18" style="height:52px;width:100%;box-sizing:border-box;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;font-family:'Manrope',system-ui,sans-serif;font-size:17px;color:#2B1D14"></label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#6F5E51">Descripción<input type="text" data-field="descripcion" value="${escapeHtml(refugio?.descripcion || '')}" placeholder="Características y accesibilidad" style="height:52px;width:100%;box-sizing:border-box;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;font-family:'Manrope',system-ui,sans-serif;font-size:17px;color:#2B1D14"></label>
          <div style="display:flex;gap:14px">
            <label style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#6F5E51">Latitud<input type="text" data-field="lat" value="${escapeHtml(refugio ? refugio.lat.toFixed(6) : '-34.922000')}" style="height:52px;width:100%;box-sizing:border-box;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:17px;color:#2B1D14"></label>
            <label style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#6F5E51">Longitud<input type="text" data-field="lon" value="${escapeHtml(refugio ? refugio.lon.toFixed(6) : '-57.955000')}" style="height:52px;width:100%;box-sizing:border-box;padding:0 16px;border-radius:14px;border:1.5px solid #D4C9BA;background:#FFFFFF;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:17px;color:#2B1D14"></label>
          </div>
          <div style="display:flex;gap:14px;margin-top:6px">
            <button type="button" data-action="cancel" style="flex:1 1 0;height:60px;border:none;border-radius:16px;font-family:'Manrope',system-ui,sans-serif;font-size:17px;font-weight:800;background:#EAE3D6;color:#2B1D14;cursor:pointer">Cancelar</button>
            <button type="button" data-action="save" style="flex:1 1 0;height:60px;border:none;border-radius:16px;font-family:'Manrope',system-ui,sans-serif;font-size:17px;font-weight:800;background:#0284C7;color:#FFFFFF;cursor:pointer">${isEdit ? 'Guardar cambios' : 'Registrar refugio'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const payload = {
          nombre: overlay.querySelector('[data-field="nombre"]').value,
          descripcion: overlay.querySelector('[data-field="descripcion"]').value,
          lat: overlay.querySelector('[data-field="lat"]').value,
          lon: overlay.querySelector('[data-field="lon"]').value
        };
        try {
          let saved;
          if (isEdit) {
            saved = await apiRequest('PUT', `/api/refugios/${encodeURIComponent(refugio.id)}`, payload);
          } else {
            saved = await apiRequest('POST', '/api/refugios', payload);
          }
          overlay.remove();
          estado = await apiRequest('GET', '/api/estado');
          userCleared = false;
          selectedId = saved?.id || refugio?.id || null;
          miniMap?.updateState(estado);
          render();
        } catch (err) {
          const p = err.payload || {};
          showWarningModal({ titulo: p.title || 'Datos no válidos', mensaje: p.detail || err.message });
        }
      });
    };

    const render = () => {
      const q = (inSearch?.value || '').trim().toLowerCase();
      const filtered = estado.refugios.filter((r) => {
        return !q || r.nombre.toLowerCase().includes(q) || (r.descripcion || '').toLowerCase().includes(q);
      });

      if (!userCleared && (!selectedId || !filtered.some((r) => r.id === selectedId))) {
        selectedId = filtered[0]?.id || null;
      }

      clearTableRows(table.inner, table.headerRow);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 20px;border-top:1px solid #EAE2D5;color:#6F5E51;text-align:center';
        empty.textContent = 'No se encontraron refugios que coincidan con la búsqueda.';
        table.inner.appendChild(empty);
      } else {
        filtered.forEach((r) => {
          const row = document.createElement('div');
          row.setAttribute('data-row-selectable', 'true');
          row.dataset.rowId = r.id;
          row.style.cssText = 'display:grid;grid-template-columns:minmax(160px,1.3fr) minmax(190px,1.8fr) minmax(150px,1fr) 92px;gap:12px;align-items:center;min-height:64px;padding:4px 16px;border-top:1px solid #EAE2D5';
          row.innerHTML = `
            <div style="min-width:0"><span style="font-weight:700">${escapeHtml(r.nombre)}</span></div>
            <div style="min-width:0"><span style="color:#6F5E51">${escapeHtml(r.descripcion)}</span></div>
            <div style="min-width:0"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px">${escapeHtml(formatCoords(r.lat, r.lon))}</span></div>
            <div style="min-width:0"><div style="display:flex;gap:6px;justify-content:flex-end">
              <button type="button" data-edit-refugio="${escapeHtml(r.id)}" aria-label="Modificar ${escapeHtml(r.nombre)}" title="Modificar refugio" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#2B1D14;border:none;cursor:pointer;padding:0">${ICONS.edit}</button>
              <button type="button" data-delete-refugio="${escapeHtml(r.id)}" aria-label="Eliminar ${escapeHtml(r.nombre)}" title="Eliminar refugio" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:#EAE3D6;color:#8B1A1A;border:none;cursor:pointer;padding:0">${ICONS.trash}</button>
            </div></div>
          `;
          row.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            userCleared = false;
            selectedId = r.id;
            syncRowHighlight();
            miniMap?.selectTarget({ type: 'refugio', id: r.id });
          });
          table.inner.appendChild(row);
        });

        table.inner.querySelectorAll('[data-edit-refugio]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const r = estado.refugios.find((x) => x.id === btn.dataset.editRefugio);
            if (r) openRefugioModal(r);
          });
        });

        table.inner.querySelectorAll('[data-delete-refugio]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const r = estado.refugios.find((x) => x.id === btn.dataset.deleteRefugio);
            if (!r) return;
            showConfirmModal({
              titulo: 'Eliminar refugio',
              pregunta: `¿Eliminar ${r.nombre}?`,
              detalle: 'El punto de resguardo dejará de mostrarse en el mapa de situación.',
              textoConfirmar: 'Sí, eliminar refugio',
              onConfirm: async () => {
                await apiRequest('DELETE', `/api/refugios/${encodeURIComponent(r.id)}`);
                estado = await apiRequest('GET', '/api/estado');
                if (selectedId === r.id) selectedId = null;
                miniMap?.updateState(estado);
                render();
              }
            });
          });
        });
      }

      syncRowHighlight();
      if (miniMap && selectedId && filtered.some((r) => r.id === selectedId)) {
        miniMap.selectTarget({ type: 'refugio', id: selectedId });
      } else if (miniMap && !userCleared && filtered.length === 0) {
        miniMap.selectTarget(null);
      }
    };

    if (btnNuevo) {
      btnNuevo.addEventListener('click', (e) => {
        e.preventDefault();
        openRefugioModal(null);
      });
    }
    if (inSearch) inSearch.addEventListener('input', () => { userCleared = false; render(); });
    render();
  }

  // ---------------- PAGES: Msg*.html ----------------
  function initMsgPage(expectedType) {
    const ctx = getMsgContext();
    if (!ctx || ctx.type !== expectedType) return;

    const h1 = document.querySelector('[role="dialog"] h1');
    const p = document.querySelector('[role="dialog"] p');
    const actionsDiv = document.querySelector('[role="dialog"] > div:last-child');

    if (h1 && ctx.title) h1.textContent = ctx.title;
    if (p) {
      if (ctx.detailHtml) p.innerHTML = ctx.detailHtml;
      else if (ctx.detail) p.textContent = ctx.detail;
    }

    if (actionsDiv) {
      const btns = [];
      if (ctx.secondaryHref && ctx.secondaryText) {
        btns.push(`<a href="${escapeHtml(ctx.secondaryHref)}" style="flex:1 1 0;display:flex;align-items:center;justify-content:center;height:60px;border-radius:16px;font-size:17px;font-weight:800;background:#EAE3D6;color:#2B1D14">${escapeHtml(ctx.secondaryText)}</a>`);
      } else if (ctx.cancelHref && ctx.cancelText) {
        btns.push(`<a href="${escapeHtml(ctx.cancelHref)}" style="flex:1 1 0;display:flex;align-items:center;justify-content:center;height:60px;border-radius:16px;font-size:17px;font-weight:800;background:#EAE3D6;color:#2B1D14">${escapeHtml(ctx.cancelText)}</a>`);
      }
      if (ctx.primaryHref && ctx.primaryText) {
        btns.push(`<a href="${escapeHtml(ctx.primaryHref)}" style="flex:1 1 0;display:flex;align-items:center;justify-content:center;height:60px;border-radius:16px;font-size:17px;font-weight:800;background:#0284C7;color:#FFFFFF">${escapeHtml(ctx.primaryText)}</a>`);
      }
      if (btns.length > 0) {
        actionsDiv.innerHTML = btns.join('');
        actionsDiv.querySelectorAll('a').forEach((a) => {
          a.addEventListener('click', () => clearMsgContext());
        });
      }
    }
  }

  // ---------------- ROUTER ----------------
  async function boot() {
    const file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    try {
      if (file === '' || file === 'index.html') await initMapaPage();
      else if (file === 'zonas.html') await initZonasPage();
      else if (file === 'dlgzona.html') await initDlgZonaPage();
      else if (file === 'dlgasociarsensores.html') await initDlgAsociarSensoresPage();
      else if (file === 'dlgeliminarzona.html') await initDlgEliminarZonaPage();
      else if (file === 'sensores.html') await initSensoresPage();
      else if (file === 'dlgsensor.html') await initDlgSensorPage();
      else if (file === 'umbrales.html') await initUmbralesPage();
      else if (file === 'dlgumbral.html') await initDlgUmbralPage();
      else if (file === 'mediciones.html') await initMedicionesPage();
      else if (file === 'dlgmedicion.html') await initDlgMedicionPage();
      else if (file === 'msgprogreso.html') await initMsgProgresoPage();
      else if (file === 'alertas.html') await initAlertasPage();
      else if (file === 'dlgestadoalerta.html') await initDlgEstadoAlertaPage();
      else if (file === 'refugios.html') await initRefugiosPage();
      else if (file === 'msgadvertencia.html') initMsgPage('advertencia');
      else if (file === 'msgerror.html') initMsgPage('error');
      else if (file === 'msginformacion.html') initMsgPage('informacion');
    } catch (err) {
      console.error('Error inicializando pantalla SIGRI:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
