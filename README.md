# SIGRI · Sistema de Gestión de Riesgo de Inundaciones
**Defensa Civil · La Plata**

Prototipo funcional del sistema de monitoreo, detección temprana y alertas de inundaciones para el partido de La Plata.

---

## 📋 Descripción general

SIGRI es un sistema de gestión y monitoreo telemétrico diseñado para centralizar y evaluar en tiempo real la situación hidrometeorológica:
- **Mapa de situación:** Visualización georreferenciada interactiva con capas de zonas de riesgo, sensores, refugios de evacuación y alertas activas. Permite zoom, paneo, visualización de coordenadas en vivo y popover de detalle al hacer clic sobre los dispositivos y refugios.
- **Zonas de riesgo:** Gestión y delimitación de áreas circulares críticas (centro, diámetro y radio calculado automáticamente) con su nivel de riesgo (Alto, Medio, Bajo).
- **Asociación de sensores:** Cálculo geodésico automático (Haversine) de la distancia de cada sensor al centro de la zona para determinar si se encuentra dentro o fuera del área de cobertura.
- **Sensores telemétricos:** Monitoreo y estado operativo (Activo, Inactivo, En mantenimiento, Desconectado, Baja) por tipo de dispositivo:
  - Nivel de agua (`m`)
  - Pluviómetro (`mm/h`)
  - Caudal (`m³/s`)
- **Umbrales:** Configuración de límites mínimos y máximos por zona y tipo de sensor, con asignación del nivel de alerta que dispara su superación.
- **Mediciones y simulación:** Registro histórico con filtros avanzados, carga manual de mediciones con previsualización del umbral, y simulación automática de lecturas que evalúa umbrales y dispara alertas en tiempo real.
- **Alertas activas e históricas:** Gestión del ciclo de vida de las alertas (`Activa` ➔ `En análisis` ➔ `Atendida` ➔ `Cerrada` / `Descartada`).
- **Refugios:** Centros de resguardo para la comunidad georreferenciados en el mapa.

---

## 🚀 Cómo ejecutar el sistema

El proyecto cuenta con un backend HTTP en Node.js que gestiona el estado en memoria y sirve el frontend completo. No requiere base de datos externa ni instalación de paquetes adicionales (`0 dependencies`).

### Requisitos
- **Node.js** v18 o superior.

### Pasos
1. Clonar el repositorio o ingresar a la carpeta del proyecto:
   ```bash
   cd sigri-html
   ```

2. Iniciar el servidor:
   ```bash
   npm start
   ```
   *(o `node server.js`)*

3. Abrir en el navegador:
   **[http://localhost:3001](http://localhost:3001)**
   *(si el puerto 3001 estuviera en uso, el servidor buscará automáticamente el siguiente puerto libre disponible e imprimirá la URL en la consola)*.

---

## 🛠️ Arquitectura técnica

- **Backend (`server.js`):**
  - Servidor HTTP nativo en Node.js sin dependencias externas (`node:http`, `node:fs`, `node:path`, `node:url`).
  - Almacén de datos en memoria precargado con datos semilla representativos de la ciudad de La Plata.
  - API REST completa (`/api/estado`, `/api/zonas`, `/api/sensores`, `/api/umbrales`, `/api/mediciones`, `/api/alertas`, `/api/refugios`).
  - Lógica de dominio: cálculo geodésico de distancias (Haversine), evaluación automática de mediciones contra umbrales y generación de alertas.
  - Endpoint de reinicio: `POST /api/reset` para restaurar el estado inicial en cualquier momento.

- **Frontend (`app.js` + 18 pantallas HTML):**
  - Vistas HTML puras con estilos modernos, accesibles y responsivos.
  - Módulo cliente `app.js` que se comunica asíncronamente con la API REST.
  - Respaldo automático en `localStorage` si se abre directamente como archivo local (`file://`).

---

## 📂 Estructura de archivos

```
sigri-html/
├── index.html               # Mapa de situación interactivo
├── Zonas.html               # Listado y gestión de zonas de riesgo
├── DlgZona.html             # Diálogo de alta/edición de zona
├── DlgAsociarSensores.html  # Diálogo de asociación de sensores a zona
├── DlgEliminarZona.html     # Diálogo de confirmación de eliminación de zona
├── Sensores.html            # Listado y gestión de sensores telemétricos
├── DlgSensor.html           # Diálogo de alta/edición de sensor
├── Mediciones.html          # Registro histórico y control de simulación
├── DlgMedicion.html         # Diálogo de carga manual de medición
├── Umbrales.html            # Configuración de límites y niveles de alerta
├── DlgUmbral.html           # Diálogo de alta/edición de umbral
├── Alertas.html             # Listado y seguimiento de alertas
├── DlgEstadoAlerta.html     # Diálogo de actualización de estado de alerta
├── Refugios.html            # Listado y administración de refugios
├── MsgAdvertencia.html      # Pantalla modal de advertencia/validación
├── MsgError.html            # Pantalla modal de error (código duplicado)
├── MsgInformacion.html      # Pantalla modal de información (alerta generada)
├── MsgProgreso.html         # Pantalla modal de progreso de simulación
├── app.js                   # Lógica e integración interactiva del frontend
├── server.js                # Servidor backend en memoria y API REST
├── package.json             # Configuración del proyecto y scripts
└── README.md                # Documentación del proyecto
```
