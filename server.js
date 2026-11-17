const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const DEFAULT_PORT = Number(process.env.PORT) || 3001;
const ROOT_DIR = __dirname;

const SENSOR_UNITS = {
  'Nivel de agua': 'm',
  'Pluviómetro': 'mm/h',
  'Caudal': 'm³/s'
};

const VALID_NIVELES = ['Bajo', 'Medio', 'Alto'];
const VALID_ESTADOS_SENSOR = ['Activo', 'Inactivo', 'En mantenimiento', 'Desconectado', 'Baja'];
const VALID_ESTADOS_ALERTA = ['Activa', 'En análisis', 'Atendida', 'Cerrada', 'Descartada'];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createInitialState() {
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
      minutosActuales: 17 * 60, // 17:00
      ultimaEjecucionMinutos: 16 * 60 + 55, // 16:55
      ultimaEjecucionFechaISO: '2026-11-15'
    },
    zonas: [
      {
        id: 'Z-001',
        nombre: 'Arroyo del Gato – Tolosa',
        descripcion: 'Cuenca baja del arroyo, anegamientos frecuentes',
        nivelRiesgo: 'Alto',
        lat: -34.898500,
        lon: -57.977200,
        diametro: 2400,
        radio: 1200
      },
      {
        id: 'Z-002',
        nombre: 'Arroyo Maldonado – Villa Elvira',
        descripcion: 'Márgenes del arroyo y calles linderas',
        nivelRiesgo: 'Medio',
        lat: -34.941200,
        lon: -57.910500,
        diametro: 1800,
        radio: 900
      },
      {
        id: 'Z-003',
        nombre: 'Arroyo Pérez – Los Hornos',
        descripcion: 'Tramo a cielo abierto del arroyo',
        nivelRiesgo: 'Medio',
        lat: -34.943000,
        lon: -57.983800,
        diametro: 1500,
        radio: 750
      },
      {
        id: 'Z-004',
        nombre: 'Casco urbano – Parque Castelli',
        descripcion: 'Zona baja del casco con desagües exigidos',
        nivelRiesgo: 'Bajo',
        lat: -34.927900,
        lon: -57.969800,
        diametro: 1000,
        radio: 500
      }
    ],
    sensores: [
      {
        codigo: 'SN-001',
        tipo: 'Nivel de agua',
        unidad: 'm',
        lat: -34.897100,
        lon: -57.979000,
        estado: 'Activo',
        zonasIds: ['Z-001'],
        ultimaMedicion: { valor: 2.84, fechaHora: '15/11/2026 16:55:00' }
      },
      {
        codigo: 'SN-002',
        tipo: 'Pluviómetro',
        unidad: 'mm/h',
        lat: -34.904000,
        lon: -57.970000,
        estado: 'Activo',
        zonasIds: ['Z-001'],
        ultimaMedicion: { valor: 38.5, fechaHora: '15/11/2026 16:55:00' }
      },
      {
        codigo: 'SN-003',
        tipo: 'Caudal',
        unidad: 'm³/s',
        lat: -34.893000,
        lon: -57.985000,
        estado: 'En mantenimiento',
        zonasIds: ['Z-001'],
        ultimaMedicion: { valor: 19.4, fechaHora: '14/11/2026 08:15:00' }
      },
      {
        codigo: 'SN-004',
        tipo: 'Nivel de agua',
        unidad: 'm',
        lat: -34.942000,
        lon: -57.909200,
        estado: 'Activo',
        zonasIds: ['Z-002'],
        ultimaMedicion: { valor: 1.62, fechaHora: '15/11/2026 16:55:00' }
      },
      {
        codigo: 'SN-005',
        tipo: 'Pluviómetro',
        unidad: 'mm/h',
        lat: -34.937000,
        lon: -57.916000,
        estado: 'Desconectado',
        zonasIds: ['Z-002'],
        ultimaMedicion: { valor: 21.0, fechaHora: '15/11/2026 11:40:00' }
      },
      {
        codigo: 'SN-006',
        tipo: 'Nivel de agua',
        unidad: 'm',
        lat: -34.944000,
        lon: -57.985100,
        estado: 'Activo',
        zonasIds: ['Z-003'],
        ultimaMedicion: { valor: 1.95, fechaHora: '15/11/2026 16:55:00' }
      },
      {
        codigo: 'SN-007',
        tipo: 'Pluviómetro',
        unidad: 'mm/h',
        lat: -34.927500,
        lon: -57.970200,
        estado: 'Inactivo',
        zonasIds: ['Z-004'],
        ultimaMedicion: null
      },
      {
        codigo: 'SN-008',
        tipo: 'Caudal',
        unidad: 'm³/s',
        lat: -34.915000,
        lon: -57.948000,
        estado: 'Activo',
        zonasIds: [],
        ultimaMedicion: { valor: 9.4, fechaHora: '15/11/2026 16:55:00' }
      },
      {
        codigo: 'SN-009',
        tipo: 'Nivel de agua',
        unidad: 'm',
        lat: -34.921000,
        lon: -57.930000,
        estado: 'Baja',
        zonasIds: [],
        ultimaMedicion: null
      }
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
      {
        id: 'M-008',
        fechaHora: '15/11/2026 16:55:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-001',
        tipo: 'Nivel de agua',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        valor: 2.84,
        unidad: 'm',
        origen: 'Automática',
        evaluacionTipo: 'alerta',
        alertaCodigo: 'A-0042',
        evaluacionTexto: 'Generó alerta A-0042'
      },
      {
        id: 'M-007',
        fechaHora: '15/11/2026 16:55:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-002',
        tipo: 'Pluviómetro',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        valor: 38.5,
        unidad: 'mm/h',
        origen: 'Automática',
        evaluacionTipo: 'alerta',
        alertaCodigo: 'A-0041',
        evaluacionTexto: 'Generó alerta A-0041'
      },
      {
        id: 'M-006',
        fechaHora: '15/11/2026 16:55:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-004',
        tipo: 'Nivel de agua',
        zonaNombre: 'Arroyo Maldonado – Villa Elvira',
        valor: 1.62,
        unidad: 'm',
        origen: 'Automática',
        evaluacionTipo: 'ok',
        alertaCodigo: null,
        evaluacionTexto: 'Dentro de umbral'
      },
      {
        id: 'M-005',
        fechaHora: '15/11/2026 16:55:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-006',
        tipo: 'Nivel de agua',
        zonaNombre: 'Arroyo Pérez – Los Hornos',
        valor: 1.95,
        unidad: 'm',
        origen: 'Automática',
        evaluacionTipo: 'alerta',
        alertaCodigo: 'A-0040',
        evaluacionTexto: 'Generó alerta A-0040'
      },
      {
        id: 'M-004',
        fechaHora: '15/11/2026 16:55:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-008',
        tipo: 'Caudal',
        zonaNombre: 'Sin zona asociada',
        valor: 9.4,
        unidad: 'm³/s',
        origen: 'Automática',
        evaluacionTipo: 'sin_umbral',
        alertaCodigo: null,
        evaluacionTexto: 'Sin umbral definido'
      },
      {
        id: 'M-003',
        fechaHora: '15/11/2026 16:50:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-001',
        tipo: 'Nivel de agua',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        valor: 2.41,
        unidad: 'm',
        origen: 'Automática',
        evaluacionTipo: 'ok',
        alertaCodigo: null,
        evaluacionTexto: 'Dentro de umbral'
      },
      {
        id: 'M-002',
        fechaHora: '15/11/2026 16:50:00',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-002',
        tipo: 'Pluviómetro',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        valor: 27.9,
        unidad: 'mm/h',
        origen: 'Automática',
        evaluacionTipo: 'ok',
        alertaCodigo: null,
        evaluacionTexto: 'Dentro de umbral'
      },
      {
        id: 'M-001',
        fechaHora: '15/11/2026 16:42:30',
        fechaISO: '2026-11-15',
        sensorCodigo: 'SN-004',
        tipo: 'Nivel de agua',
        zonaNombre: 'Arroyo Maldonado – Villa Elvira',
        valor: 1.70,
        unidad: 'm',
        origen: 'Manual',
        evaluacionTipo: 'ok',
        alertaCodigo: null,
        evaluacionTexto: 'Dentro de umbral'
      }
    ],
    alertas: [
      {
        codigo: 'A-0042',
        fechaHora: '15/11/2026 16:55',
        fechaISO: '2026-11-15',
        nivel: 'Alto',
        zonaId: 'Z-001',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        condicion: 'Nivel de agua supera el máximo de 2,50 m',
        detalleCorto: 'nivel de agua 2,84 m, supera el máximo de 2,50 m',
        sensorCodigo: 'SN-001',
        valor: 2.84,
        unidad: 'm',
        estado: 'Activa'
      },
      {
        codigo: 'A-0041',
        fechaHora: '15/11/2026 16:55',
        fechaISO: '2026-11-15',
        nivel: 'Medio',
        zonaId: 'Z-001',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        condicion: 'Lluvia supera el máximo de 30,0 mm/h',
        detalleCorto: 'lluvia 38,5 mm/h, supera el máximo de 30,0 mm/h',
        sensorCodigo: 'SN-002',
        valor: 38.5,
        unidad: 'mm/h',
        estado: 'Activa'
      },
      {
        codigo: 'A-0040',
        fechaHora: '15/11/2026 16:55',
        fechaISO: '2026-11-15',
        nivel: 'Medio',
        zonaId: 'Z-003',
        zonaNombre: 'Arroyo Pérez – Los Hornos',
        condicion: 'Nivel de agua supera el máximo de 1,80 m',
        detalleCorto: 'nivel de agua 1,95 m, supera el máximo de 1,80 m',
        sensorCodigo: 'SN-006',
        valor: 1.95,
        unidad: 'm',
        estado: 'Activa'
      },
      {
        codigo: 'A-0039',
        fechaHora: '14/11/2026 22:10',
        fechaISO: '2026-11-14',
        nivel: 'Alto',
        zonaId: 'Z-002',
        zonaNombre: 'Arroyo Maldonado – Villa Elvira',
        condicion: 'Nivel de agua supera el máximo de 2,20 m',
        detalleCorto: 'nivel de agua 2,31 m, supera el máximo de 2,20 m',
        sensorCodigo: 'SN-004',
        valor: 2.31,
        unidad: 'm',
        estado: 'Atendida'
      },
      {
        codigo: 'A-0038',
        fechaHora: '14/11/2026 08:15',
        fechaISO: '2026-11-14',
        nivel: 'Alto',
        zonaId: 'Z-001',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        condicion: 'Caudal supera el máximo de 18,0 m³/s',
        detalleCorto: 'caudal 19,4 m³/s, supera el máximo de 18,0 m³/s',
        sensorCodigo: 'SN-003',
        valor: 19.4,
        unidad: 'm³/s',
        estado: 'Cerrada'
      },
      {
        codigo: 'A-0037',
        fechaHora: '13/11/2026 17:40',
        fechaISO: '2026-11-13',
        nivel: 'Medio',
        zonaId: 'Z-001',
        zonaNombre: 'Arroyo del Gato – Tolosa',
        condicion: 'Lluvia supera el máximo de 30,0 mm/h',
        detalleCorto: 'lluvia 31,2 mm/h, supera el máximo de 30,0 mm/h',
        sensorCodigo: 'SN-002',
        valor: 31.2,
        unidad: 'mm/h',
        estado: 'Descartada'
      },
      {
        codigo: 'A-0036',
        fechaHora: '13/11/2026 09:05',
        fechaISO: '2026-11-13',
        nivel: 'Medio',
        zonaId: 'Z-003',
        zonaNombre: 'Arroyo Pérez – Los Hornos',
        condicion: 'Nivel de agua supera el máximo de 1,80 m',
        detalleCorto: 'nivel de agua 1,88 m, supera el máximo de 1,80 m',
        sensorCodigo: 'SN-006',
        valor: 1.88,
        unidad: 'm',
        estado: 'En análisis'
      }
    ],
    refugios: [
      {
        id: 'R-001',
        nombre: 'Polideportivo Tolosa',
        descripcion: 'Gimnasio cubierto con sanitarios y cocina',
        lat: -34.908500,
        lon: -57.954000
      },
      {
        id: 'R-002',
        nombre: 'Club Social Villa Elvira',
        descripcion: 'Salón principal en planta alta',
        lat: -34.933500,
        lon: -57.926300
      },
      {
        id: 'R-003',
        nombre: 'Centro Comunitario Los Hornos',
        descripcion: 'Dos salones con acceso sin escalones',
        lat: -34.939500,
        lon: -57.964000
      }
    ]
  };
}

let state = createInitialState();

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

function formatDecimalsByUnit(valor, unidad) {
  const decimals = unidad === 'm' ? 2 : 1;
  return Number(valor).toFixed(decimals).replace('.', ',');
}

function formatValorUnidad(valor, unidad) {
  return `${formatDecimalsByUnit(valor, unidad)} ${unidad}`;
}

function formatDateFromISO(fechaISO) {
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

function formatHHMM(totalMinutes) {
  const mins = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function advanceFechaISO(fechaISO, days) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function advanceClock(minutesDelta) {
  let total = state.simulacion.minutosActuales + minutesDelta;
  let extraDays = Math.floor(total / 1440);
  if (extraDays > 0) {
    state.simulacion.fechaISO = advanceFechaISO(state.simulacion.fechaISO, extraDays);
    total = total % 1440;
  }
  state.simulacion.minutosActuales = total;
}

function getSimulacionView() {
  const s = state.simulacion;
  const fechaStr = formatDateFromISO(s.fechaISO);
  const hhmm = formatHHMM(s.minutosActuales);
  const ultFechaStr = formatDateFromISO(s.ultimaEjecucionFechaISO);
  const ultHHMM = formatHHMM(s.ultimaEjecucionMinutos);
  let proxMin = s.ultimaEjecucionMinutos + s.intervaloMinutos;
  if (proxMin <= s.minutosActuales && s.fechaISO === s.ultimaEjecucionFechaISO) {
    proxMin = s.minutosActuales + s.intervaloMinutos;
  }
  return {
    activa: s.activa,
    intervaloMinutos: s.intervaloMinutos,
    fechaISO: s.fechaISO,
    relojSistema: `${fechaStr} · ${hhmm}`,
    ultimaEjecucion: `${ultFechaStr} ${ultHHMM}`,
    proximaEjecucion: formatHHMM(proxMin)
  };
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const raw = R * c;
  return Math.round(raw / 10) * 10;
}

function getSensorConditionLabels(tipo) {
  if (tipo === 'Pluviómetro') return { cap: 'Lluvia', lower: 'lluvia' };
  if (tipo === 'Caudal') return { cap: 'Caudal', lower: 'caudal' };
  return { cap: 'Nivel de agua', lower: 'nivel de agua' };
}

function evaluarMedicion(sensor, valorNum, origen, fechaISO, hhmm, ss = '00') {
  const fechaStr = formatDateFromISO(fechaISO);
  const fechaHoraCompleta = `${fechaStr} ${hhmm}:${ss}`;
  const fechaHoraCorta = `${fechaStr} ${hhmm}`;

  sensor.ultimaMedicion = {
    valor: valorNum,
    fechaHora: fechaHoraCompleta
  };

  const zonasAsociadas = state.zonas.filter((z) => sensor.zonasIds.includes(z.id));
  const zonaNombre = zonasAsociadas.length > 0
    ? zonasAsociadas.map((z) => z.nombre).join(', ')
    : 'Sin zona asociada';

  let huboUmbralDefinido = false;
  const alertasGeneradas = [];
  const labels = getSensorConditionLabels(sensor.tipo);

  for (const zona of zonasAsociadas) {
    const umbralesZona = state.umbrales.filter((u) => u.zonaId === zona.id && u.tipo === sensor.tipo);
    if (umbralesZona.length > 0) {
      huboUmbralDefinido = true;
    }
    for (const u of umbralesZona) {
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
        const codigoAlerta = `A-${String(state.nextAlertNum++).padStart(4, '0')}`;
        const nuevaAlerta = {
          codigo: codigoAlerta,
          fechaHora: fechaHoraCorta,
          fechaISO,
          nivel: u.nivelAlerta,
          zonaId: zona.id,
          zonaNombre: zona.nombre,
          condicion,
          detalleCorto,
          sensorCodigo: sensor.codigo,
          valor: valorNum,
          unidad: sensor.unidad,
          estado: 'Activa',
          umbralMaximo: u.maximo,
          umbralMinimo: u.minimo
        };
        state.alertas.unshift(nuevaAlerta);
        alertasGeneradas.push(nuevaAlerta);
      }
    }
  }

  let evaluacionTipo = 'sin_umbral';
  let alertaCodigo = null;
  let evaluacionTexto = 'Sin umbral definido';

  if (alertasGeneradas.length > 0) {
    evaluacionTipo = 'alerta';
    alertaCodigo = alertasGeneradas[0].codigo;
    evaluacionTexto = alertasGeneradas.length === 1
      ? `Generó alerta ${alertaCodigo}`
      : `Generó ${alertasGeneradas.length} alertas (${alertasGeneradas.map((a) => a.codigo).join(', ')})`;
  } else if (huboUmbralDefinido) {
    evaluacionTipo = 'ok';
    evaluacionTexto = 'Dentro de umbral';
  }

  const medicion = {
    id: `M-${String(state.nextMedicionNum++).padStart(3, '0')}`,
    fechaHora: fechaHoraCompleta,
    fechaISO,
    sensorCodigo: sensor.codigo,
    tipo: sensor.tipo,
    zonaNombre,
    valor: valorNum,
    unidad: sensor.unidad,
    origen,
    evaluacionTipo,
    alertaCodigo,
    evaluacionTexto
  };

  state.mediciones.unshift(medicion);

  return { medicion, alertasGeneradas };
}

function buildEnrichedState() {
  const zonasEnriched = state.zonas.map((z) => {
    const sensoresAsociados = state.sensores.filter((s) => s.zonasIds.includes(z.id));
    const umbralesZona = state.umbrales.filter((u) => u.zonaId === z.id);
    const alertasActivas = state.alertas.filter((a) => a.zonaId === z.id && a.estado === 'Activa');
    return {
      ...z,
      sensoresCount: sensoresAsociados.length,
      umbralesCount: umbralesZona.length,
      alertasActivasCount: alertasActivas.length
    };
  });

  const zonaMap = new Map(state.zonas.map((z) => [z.id, z]));
  const sensoresEnriched = state.sensores.map((s) => ({
    ...s,
    zonasNombres: s.zonasIds.map((id) => zonaMap.get(id)?.nombre).filter(Boolean)
  }));

  const umbralesEnriched = state.umbrales.map((u) => ({
    ...u,
    zonaNombre: zonaMap.get(u.zonaId)?.nombre || 'Zona eliminada',
    unidad: SENSOR_UNITS[u.tipo] || ''
  }));

  const resumen = {
    zonasTotal: state.zonas.length,
    sensoresTotal: state.sensores.length,
    sensoresActivos: state.sensores.filter((s) => s.estado === 'Activo').length,
    alertasActivas: state.alertas.filter((a) => a.estado === 'Activa').length,
    refugiosTotal: state.refugios.length
  };

  return {
    simulacion: getSimulacionView(),
    resumen,
    zonas: zonasEnriched,
    sensores: sensoresEnriched,
    umbrales: umbralesEnriched,
    mediciones: state.mediciones,
    alertas: state.alertas,
    refugios: state.refugios
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function generarValorSimulado(sensor) {
  const uMax = state.umbrales
    .filter((u) => sensor.zonasIds.includes(u.zonaId) && u.tipo === sensor.tipo && u.maximo !== null)
    .map((u) => u.maximo);
  const refMax = uMax.length > 0 ? Math.min(...uMax) : null;
  const base = sensor.ultimaMedicion ? sensor.ultimaMedicion.valor : (
    sensor.tipo === 'Nivel de agua' ? 1.50 :
    sensor.tipo === 'Pluviómetro' ? 22.0 : 10.0
  );

  // Variación realista alrededor de la última lectura, tendiendo levemente hacia zona de monitoreo
  let next;
  if (sensor.tipo === 'Nivel de agua') {
    const delta = (Math.random() - 0.45) * 0.45;
    next = Math.max(0.25, base + delta);
    if (refMax !== null && Math.random() < 0.25) {
      next = refMax * (0.95 + Math.random() * 0.20);
    }
    return Number(next.toFixed(2));
  }
  if (sensor.tipo === 'Pluviómetro') {
    const delta = (Math.random() - 0.45) * 8.0;
    next = Math.max(0.0, base + delta);
    if (refMax !== null && Math.random() < 0.25) {
      next = refMax * (0.92 + Math.random() * 0.22);
    }
    return Number(next.toFixed(1));
  }
  const delta = (Math.random() - 0.45) * 3.5;
  next = Math.max(0.5, base + delta);
  return Number(next.toFixed(1));
}

async function handleApi(req, res, pathname, urlObj) {
  const method = req.method.toUpperCase();

  try {
    // GET /api/estado
    if (method === 'GET' && pathname === '/api/estado') {
      return sendJson(res, 200, buildEnrichedState());
    }

    // POST /api/reset
    if (method === 'POST' && pathname === '/api/reset') {
      state = createInitialState();
      return sendJson(res, 200, { ok: true, estado: buildEnrichedState() });
    }

    // ---------------- ZONAS ----------------
    if (method === 'GET' && pathname === '/api/zonas') {
      const data = buildEnrichedState().zonas;
      return sendJson(res, 200, data);
    }

    const zonaSensoresMatch = pathname.match(/^\/api\/zonas\/([^/]+)\/sensores$/);
    if (zonaSensoresMatch) {
      const zonaId = decodeURIComponent(zonaSensoresMatch[1]);
      const zona = state.zonas.find((z) => z.id === zonaId);
      if (!zona) return sendJson(res, 404, { error: 'Zona no encontrada' });

      if (method === 'GET') {
        const sensores = state.sensores
          .filter((s) => s.estado !== 'Baja')
          .map((s) => {
            const distancia = calcularDistanciaMetros(zona.lat, zona.lon, s.lat, s.lon);
            return {
              ...s,
              distanciaMetros: distancia,
              dentroDeZona: distancia <= zona.radio,
              asociado: s.zonasIds.includes(zona.id)
            };
          })
          .sort((a, b) => a.distanciaMetros - b.distanciaMetros);
        return sendJson(res, 200, { zona, sensores });
      }

      if (method === 'PUT') {
        const body = await readRequestBody(req);
        const codigos = Array.isArray(body.sensoresCodigos) ? body.sensoresCodigos : [];
        const setCodigos = new Set(codigos);
        for (const s of state.sensores) {
          const tiene = s.zonasIds.includes(zona.id);
          const quiere = setCodigos.has(s.codigo);
          if (quiere && !tiene) {
            s.zonasIds.push(zona.id);
          } else if (!quiere && tiene) {
            s.zonasIds = s.zonasIds.filter((id) => id !== zona.id);
          }
        }
        return sendJson(res, 200, { ok: true, zonaId: zona.id, asociados: codigos.length });
      }
    }

    const zonaMatch = pathname.match(/^\/api\/zonas\/([^/]+)$/);
    if (zonaMatch) {
      const zonaId = decodeURIComponent(zonaMatch[1]);
      const idx = state.zonas.findIndex((z) => z.id === zonaId);
      if (idx === -1) return sendJson(res, 404, { error: 'Zona no encontrada' });

      if (method === 'GET') {
        const enriched = buildEnrichedState().zonas.find((z) => z.id === zonaId);
        return sendJson(res, 200, enriched);
      }

      if (method === 'PUT') {
        const body = await readRequestBody(req);
        const nombre = String(body.nombre || '').trim();
        const descripcion = String(body.descripcion || '').trim();
        const nivelRiesgo = VALID_NIVELES.includes(body.nivelRiesgo) ? body.nivelRiesgo : state.zonas[idx].nivelRiesgo;
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);
        const diametro = parseNumero(body.diametro);

        if (!nombre) {
          return sendJson(res, 400, {
            error: 'Nombre requerido',
            title: 'Nombre requerido',
            detail: 'Ingresá un nombre para la zona de riesgo.'
          });
        }
        if (diametro === null || Number.isNaN(diametro) || diametro <= 0) {
          return sendJson(res, 400, {
            error: 'Diámetro no válido',
            title: 'Diámetro no válido',
            detail: 'El diámetro de la zona tiene que ser mayor a 0 metros. Revisalo e ingresalo de nuevo.'
          });
        }
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          return sendJson(res, 400, {
            error: 'Coordenadas no válidas',
            title: 'Coordenadas no válidas',
            detail: 'Ingresá valores numéricos válidos para la latitud (-90 a 90) y la longitud (-180 a 180).'
          });
        }

        const oldName = state.zonas[idx].nombre;
        state.zonas[idx] = {
          ...state.zonas[idx],
          nombre,
          descripcion,
          nivelRiesgo,
          lat,
          lon,
          diametro: Math.round(diametro),
          radio: Math.round(diametro / 2)
        };
        if (oldName !== nombre) {
          for (const a of state.alertas) {
            if (a.zonaId === zonaId) a.zonaNombre = nombre;
          }
        }
        return sendJson(res, 200, state.zonas[idx]);
      }

      if (method === 'DELETE') {
        const deleted = state.zonas[idx];
        state.zonas.splice(idx, 1);
        for (const s of state.sensores) {
          s.zonasIds = s.zonasIds.filter((id) => id !== zonaId);
        }
        const umbralesEliminados = state.umbrales.filter((u) => u.zonaId === zonaId).length;
        state.umbrales = state.umbrales.filter((u) => u.zonaId !== zonaId);
        return sendJson(res, 200, { ok: true, deleted, umbralesEliminados });
      }
    }

    if (method === 'POST' && pathname === '/api/zonas') {
      const body = await readRequestBody(req);
      const nombre = String(body.nombre || '').trim();
      const descripcion = String(body.descripcion || '').trim();
      const nivelRiesgo = VALID_NIVELES.includes(body.nivelRiesgo) ? body.nivelRiesgo : 'Medio';
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);
      const diametro = parseNumero(body.diametro);

      if (!nombre) {
        return sendJson(res, 400, {
          error: 'Nombre requerido',
          title: 'Nombre requerido',
          detail: 'Ingresá un nombre para la zona de riesgo.'
        });
      }
      if (diametro === null || Number.isNaN(diametro) || diametro <= 0) {
        return sendJson(res, 400, {
          error: 'Diámetro no válido',
          title: 'Diámetro no válido',
          detail: 'El diámetro de la zona tiene que ser mayor a 0 metros. Revisalo e ingresalo de nuevo.'
        });
      }
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return sendJson(res, 400, {
          error: 'Coordenadas no válidas',
          title: 'Coordenadas no válidas',
          detail: 'Ingresá valores numéricos válidos para la latitud (-90 a 90) y la longitud (-180 a 180).'
        });
      }

      const nuevaZona = {
        id: `Z-${String(state.nextZonaNum++).padStart(3, '0')}`,
        nombre,
        descripcion,
        nivelRiesgo,
        lat,
        lon,
        diametro: Math.round(diametro),
        radio: Math.round(diametro / 2)
      };
      state.zonas.push(nuevaZona);
      return sendJson(res, 201, nuevaZona);
    }

    // ---------------- SENSORES ----------------
    if (method === 'GET' && pathname === '/api/sensores') {
      return sendJson(res, 200, buildEnrichedState().sensores);
    }

    if (method === 'POST' && pathname === '/api/sensores') {
      const body = await readRequestBody(req);
      const codigo = String(body.codigo || '').trim().toUpperCase();
      const tipo = SENSOR_UNITS[body.tipo] ? body.tipo : null;
      const estado = VALID_ESTADOS_SENSOR.includes(body.estado) ? body.estado : 'Activo';
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);

      if (!codigo) {
        return sendJson(res, 400, {
          error: 'Código requerido',
          title: 'Código no válido',
          detail: 'Ingresá un código identificador para el sensor (por ejemplo, SN-010).'
        });
      }
      if (state.sensores.some((s) => s.codigo.toUpperCase() === codigo)) {
        return sendJson(res, 409, {
          error: 'Código duplicado',
          title: 'No se pudo registrar el sensor',
          codigo,
          detail: `Ya existe un sensor con el código ${codigo}. Ingresá un código distinto para continuar.`
        });
      }
      if (!tipo) {
        return sendJson(res, 400, {
          error: 'Tipo no válido',
          title: 'Tipo de sensor no válido',
          detail: 'Seleccioná un tipo de sensor válido.'
        });
      }
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return sendJson(res, 400, {
          error: 'Coordenadas no válidas',
          title: 'Ubicación no válida',
          detail: 'Ingresá coordenadas numéricas válidas para latitud y longitud.'
        });
      }

      const nuevoSensor = {
        codigo,
        tipo,
        unidad: SENSOR_UNITS[tipo],
        lat,
        lon,
        estado,
        zonasIds: [],
        ultimaMedicion: null
      };
      state.sensores.push(nuevoSensor);
      return sendJson(res, 201, nuevoSensor);
    }

    const sensorMatch = pathname.match(/^\/api\/sensores\/([^/]+)$/);
    if (sensorMatch) {
      const codigoParam = decodeURIComponent(sensorMatch[1]).toUpperCase();
      const idx = state.sensores.findIndex((s) => s.codigo.toUpperCase() === codigoParam);
      if (idx === -1) return sendJson(res, 404, { error: 'Sensor no encontrado' });

      if (method === 'GET') {
        return sendJson(res, 200, buildEnrichedState().sensores.find((s) => s.codigo.toUpperCase() === codigoParam));
      }

      if (method === 'PUT') {
        const body = await readRequestBody(req);
        const nuevoCodigo = String(body.codigo || codigoParam).trim().toUpperCase();
        const tipo = SENSOR_UNITS[body.tipo] ? body.tipo : state.sensores[idx].tipo;
        const estado = VALID_ESTADOS_SENSOR.includes(body.estado) ? body.estado : state.sensores[idx].estado;
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);

        if (!nuevoCodigo) {
          return sendJson(res, 400, {
            error: 'Código requerido',
            title: 'Código no válido',
            detail: 'Ingresá un código identificador para el sensor.'
          });
        }
        if (nuevoCodigo !== codigoParam && state.sensores.some((s) => s.codigo.toUpperCase() === nuevoCodigo)) {
          return sendJson(res, 409, {
            error: 'Código duplicado',
            title: 'No se pudo actualizar el sensor',
            codigo: nuevoCodigo,
            detail: `Ya existe un sensor con el código ${nuevoCodigo}. Ingresá un código distinto para continuar.`
          });
        }
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          return sendJson(res, 400, {
            error: 'Coordenadas no válidas',
            title: 'Ubicación no válida',
            detail: 'Ingresá coordenadas numéricas válidas para latitud y longitud.'
          });
        }

        const oldCodigo = state.sensores[idx].codigo;
        state.sensores[idx] = {
          ...state.sensores[idx],
          codigo: nuevoCodigo,
          tipo,
          unidad: SENSOR_UNITS[tipo],
          lat,
          lon,
          estado
        };
        if (oldCodigo !== nuevoCodigo) {
          for (const m of state.mediciones) {
            if (m.sensorCodigo === oldCodigo) m.sensorCodigo = nuevoCodigo;
          }
          for (const a of state.alertas) {
            if (a.sensorCodigo === oldCodigo) a.sensorCodigo = nuevoCodigo;
          }
        }
        return sendJson(res, 200, state.sensores[idx]);
      }

      if (method === 'DELETE') {
        const deleted = state.sensores[idx];
        state.sensores.splice(idx, 1);
        return sendJson(res, 200, { ok: true, deleted });
      }
    }

    // ---------------- UMBRALES ----------------
    if (method === 'GET' && pathname === '/api/umbrales') {
      return sendJson(res, 200, buildEnrichedState().umbrales);
    }

    if (method === 'POST' && pathname === '/api/umbrales') {
      const body = await readRequestBody(req);
      const zonaId = String(body.zonaId || '').trim();
      const tipo = SENSOR_UNITS[body.tipo] ? body.tipo : null;
      const minimo = parseNumero(body.minimo);
      const maximo = parseNumero(body.maximo);
      const nivelAlerta = VALID_NIVELES.includes(body.nivelAlerta) ? body.nivelAlerta : 'Medio';

      const zona = state.zonas.find((z) => z.id === zonaId);
      if (!zona) {
        return sendJson(res, 400, {
          error: 'Zona inválida',
          title: 'Zona no válida',
          detail: 'Seleccioná una zona de riesgo existente.'
        });
      }
      if (!tipo) {
        return sendJson(res, 400, {
          error: 'Tipo inválido',
          title: 'Tipo de sensor no válido',
          detail: 'Seleccioná un tipo de sensor válido.'
        });
      }
      if (Number.isNaN(minimo) || Number.isNaN(maximo)) {
        return sendJson(res, 400, {
          error: 'Valor numérico inválido',
          title: 'Valores de umbral no válidos',
          detail: 'Revisá los valores ingresados; deben ser números válidos.'
        });
      }
      if (minimo === null && maximo === null) {
        return sendJson(res, 400, {
          error: 'Umbral vacío',
          title: 'Valores de umbral requeridos',
          detail: 'Tenés que definir un valor mínimo, un valor máximo o ambos.'
        });
      }
      if (minimo !== null && minimo < 0 || maximo !== null && maximo <= 0) {
        return sendJson(res, 400, {
          error: 'Rango no válido',
          title: 'Valores de umbral no válidos',
          detail: 'Los límites del umbral no pueden ser negativos y el valor máximo debe ser mayor a 0.'
        });
      }
      if (minimo !== null && maximo !== null && minimo >= maximo) {
        return sendJson(res, 400, {
          error: 'Mínimo mayor o igual a máximo',
          title: 'Rango de umbral no válido',
          detail: 'El valor mínimo tiene que ser menor al valor máximo configurado.'
        });
      }

      const nuevoUmbral = {
        id: `U-${String(state.nextUmbralNum++).padStart(3, '0')}`,
        zonaId: zona.id,
        tipo,
        minimo,
        maximo,
        nivelAlerta
      };
      state.umbrales.push(nuevoUmbral);
      return sendJson(res, 201, {
        ...nuevoUmbral,
        zonaNombre: zona.nombre,
        unidad: SENSOR_UNITS[tipo]
      });
    }

    const umbralMatch = pathname.match(/^\/api\/umbrales\/([^/]+)$/);
    if (umbralMatch) {
      const umbralId = decodeURIComponent(umbralMatch[1]);
      const idx = state.umbrales.findIndex((u) => u.id === umbralId);
      if (idx === -1) return sendJson(res, 404, { error: 'Umbral no encontrado' });

      if (method === 'GET') {
        return sendJson(res, 200, buildEnrichedState().umbrales.find((u) => u.id === umbralId));
      }

      if (method === 'PUT') {
        const body = await readRequestBody(req);
        const zonaId = String(body.zonaId || state.umbrales[idx].zonaId).trim();
        const tipo = SENSOR_UNITS[body.tipo] ? body.tipo : state.umbrales[idx].tipo;
        const minimo = parseNumero(body.minimo);
        const maximo = parseNumero(body.maximo);
        const nivelAlerta = VALID_NIVELES.includes(body.nivelAlerta) ? body.nivelAlerta : state.umbrales[idx].nivelAlerta;

        const zona = state.zonas.find((z) => z.id === zonaId);
        if (!zona) {
          return sendJson(res, 400, {
            error: 'Zona inválida',
            title: 'Zona no válida',
            detail: 'Seleccioná una zona de riesgo existente.'
          });
        }
        if (Number.isNaN(minimo) || Number.isNaN(maximo)) {
          return sendJson(res, 400, {
            error: 'Valor numérico inválido',
            title: 'Valores de umbral no válidos',
            detail: 'Revisá los valores ingresados; deben ser números válidos.'
          });
        }
        if (minimo === null && maximo === null) {
          return sendJson(res, 400, {
            error: 'Umbral vacío',
            title: 'Valores de umbral requeridos',
            detail: 'Tenés que definir un valor mínimo, un valor máximo o ambos.'
          });
        }
        if (minimo !== null && minimo < 0 || maximo !== null && maximo <= 0) {
          return sendJson(res, 400, {
            error: 'Rango no válido',
            title: 'Valores de umbral no válidos',
            detail: 'Los límites del umbral no pueden ser negativos y el valor máximo debe ser mayor a 0.'
          });
        }
        if (minimo !== null && maximo !== null && minimo >= maximo) {
          return sendJson(res, 400, {
            error: 'Mínimo mayor o igual a máximo',
            title: 'Rango de umbral no válido',
            detail: 'El valor mínimo tiene que ser menor al valor máximo configurado.'
          });
        }

        state.umbrales[idx] = {
          ...state.umbrales[idx],
          zonaId,
          tipo,
          minimo,
          maximo,
          nivelAlerta
        };
        return sendJson(res, 200, {
          ...state.umbrales[idx],
          zonaNombre: zona.nombre,
          unidad: SENSOR_UNITS[tipo]
        });
      }

      if (method === 'DELETE') {
        const deleted = state.umbrales[idx];
        state.umbrales.splice(idx, 1);
        return sendJson(res, 200, { ok: true, deleted });
      }
    }

    // ---------------- MEDICIONES Y SIMULACIÓN ----------------
    if (method === 'GET' && pathname === '/api/mediciones') {
      return sendJson(res, 200, {
        simulacion: getSimulacionView(),
        mediciones: state.mediciones
      });
    }

    if (method === 'POST' && pathname === '/api/mediciones') {
      const body = await readRequestBody(req);
      const sensorCodigo = String(body.sensorCodigo || '').trim().toUpperCase();
      const valor = parseNumero(body.valor);

      const sensor = state.sensores.find((s) => s.codigo.toUpperCase() === sensorCodigo);
      if (!sensor) {
        return sendJson(res, 404, {
          error: 'Sensor no encontrado',
          title: 'Sensor no encontrado',
          detail: 'El sensor seleccionado no existe en el sistema.'
        });
      }
      if (valor === null || Number.isNaN(valor) || valor < 0) {
        return sendJson(res, 400, {
          error: 'Valor no válido',
          title: 'Valor medido no válido',
          detail: 'El valor de la medición debe ser un número mayor o igual a 0.'
        });
      }

      const valorRedondeado = sensor.unidad === 'm'
        ? Number(valor.toFixed(2))
        : Number(valor.toFixed(1));

      const hhmm = formatHHMM(state.simulacion.minutosActuales);
      const result = evaluarMedicion(sensor, valorRedondeado, 'Manual', state.simulacion.fechaISO, hhmm, '00');
      advanceClock(1);

      return sendJson(res, 201, {
        medicion: result.medicion,
        alertasGeneradas: result.alertasGeneradas,
        simulacion: getSimulacionView()
      });
    }

    if (method === 'POST' && pathname === '/api/mediciones/simular') {
      const activos = state.sensores.filter((s) => s.estado === 'Activo');
      const hhmm = formatHHMM(state.simulacion.minutosActuales);
      const fechaISO = state.simulacion.fechaISO;

      const medicionesGeneradas = [];
      const alertasGeneradas = [];

      for (const sensor of activos) {
        const valor = generarValorSimulado(sensor);
        const resEval = evaluarMedicion(sensor, valor, 'Automática', fechaISO, hhmm, '00');
        medicionesGeneradas.push(resEval.medicion);
        alertasGeneradas.push(...resEval.alertasGeneradas);
      }

      state.simulacion.ultimaEjecucionMinutos = state.simulacion.minutosActuales;
      state.simulacion.ultimaEjecucionFechaISO = fechaISO;
      advanceClock(state.simulacion.intervaloMinutos);

      return sendJson(res, 200, {
        sensoresSimulados: activos.length,
        medicionesGeneradas,
        alertasGeneradas,
        simulacion: getSimulacionView()
      });
    }

    if (method === 'PATCH' && pathname === '/api/simulacion') {
      const body = await readRequestBody(req);
      if (typeof body.activa === 'boolean') {
        state.simulacion.activa = body.activa;
      }
      return sendJson(res, 200, getSimulacionView());
    }

    // ---------------- ALERTAS ----------------
    if (method === 'GET' && pathname === '/api/alertas') {
      return sendJson(res, 200, state.alertas);
    }

    const alertaMatch = pathname.match(/^\/api\/alertas\/([^/]+)$/);
    if (alertaMatch) {
      const codigo = decodeURIComponent(alertaMatch[1]).toUpperCase();
      const alerta = state.alertas.find((a) => a.codigo.toUpperCase() === codigo);
      if (!alerta) return sendJson(res, 404, { error: 'Alerta no encontrada' });

      if (method === 'GET') {
        return sendJson(res, 200, alerta);
      }

      if (method === 'PATCH') {
        const body = await readRequestBody(req);
        const estado = String(body.estado || '').trim();
        if (!VALID_ESTADOS_ALERTA.includes(estado)) {
          return sendJson(res, 400, {
            error: 'Estado no válido',
            title: 'Estado no válido',
            detail: 'Seleccioná un estado válido para la alerta.'
          });
        }
        alerta.estado = estado;
        return sendJson(res, 200, alerta);
      }
    }

    // ---------------- REFUGIOS ----------------
    if (method === 'GET' && pathname === '/api/refugios') {
      return sendJson(res, 200, state.refugios);
    }

    if (method === 'POST' && pathname === '/api/refugios') {
      const body = await readRequestBody(req);
      const nombre = String(body.nombre || '').trim();
      const descripcion = String(body.descripcion || '').trim();
      const lat = parseNumero(body.lat);
      const lon = parseNumero(body.lon);

      if (!nombre) {
        return sendJson(res, 400, {
          error: 'Nombre requerido',
          title: 'Nombre requerido',
          detail: 'Ingresá un nombre para el refugio.'
        });
      }
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return sendJson(res, 400, {
          error: 'Coordenadas no válidas',
          title: 'Ubicación no válida',
          detail: 'Ingresá coordenadas numéricas válidas para latitud y longitud.'
        });
      }

      const nuevoRefugio = {
        id: `R-${String(state.nextRefugioNum++).padStart(3, '0')}`,
        nombre,
        descripcion,
        lat,
        lon
      };
      state.refugios.push(nuevoRefugio);
      return sendJson(res, 201, nuevoRefugio);
    }

    const refugioMatch = pathname.match(/^\/api\/refugios\/([^/]+)$/);
    if (refugioMatch) {
      const id = decodeURIComponent(refugioMatch[1]);
      const idx = state.refugios.findIndex((r) => r.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'Refugio no encontrado' });

      if (method === 'GET') return sendJson(res, 200, state.refugios[idx]);

      if (method === 'PUT') {
        const body = await readRequestBody(req);
        const nombre = String(body.nombre || '').trim();
        const descripcion = String(body.descripcion || '').trim();
        const lat = parseNumero(body.lat);
        const lon = parseNumero(body.lon);

        if (!nombre) {
          return sendJson(res, 400, {
            error: 'Nombre requerido',
            title: 'Nombre requerido',
            detail: 'Ingresá un nombre para el refugio.'
          });
        }
        if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          return sendJson(res, 400, {
            error: 'Coordenadas no válidas',
            title: 'Ubicación no válida',
            detail: 'Ingresá coordenadas numéricas válidas para latitud y longitud.'
          });
        }

        state.refugios[idx] = {
          ...state.refugios[idx],
          nombre,
          descripcion,
          lat,
          lon
        };
        return sendJson(res, 200, state.refugios[idx]);
      }

      if (method === 'DELETE') {
        const deleted = state.refugios[idx];
        state.refugios.splice(idx, 1);
        return sendJson(res, 200, { ok: true, deleted });
      }
    }

    return sendJson(res, 404, { error: `Endpoint no encontrado: ${method} ${pathname}` });
  } catch (err) {
    return sendJson(res, 400, { error: err.message || 'Error en la solicitud' });
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let target = pathname === '/' ? '/index.html' : pathname;
  try {
    target = decodeURIComponent(target);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  const safePath = path.normalize(path.join(ROOT_DIR, target));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(safePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Archivo no encontrado');
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Error interno del servidor');
    }

    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, urlObj);
  }
  return serveStatic(req, res, pathname);
});

let currentPort = DEFAULT_PORT;

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && currentPort < DEFAULT_PORT + 20) {
    console.warn(`Puerto ${currentPort} ocupado, probando puerto ${currentPort + 1}...`);
    currentPort += 1;
    server.listen(currentPort);
    return;
  }
  console.error('Error iniciando el servidor SIGRI:', err);
  process.exit(1);
});

server.listen(currentPort, () => {
  console.log(`SIGRI backend + frontend escuchando en http://localhost:${currentPort}`);
});
