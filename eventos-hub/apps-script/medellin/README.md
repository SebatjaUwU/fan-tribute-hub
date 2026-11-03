# Boletería automática · End of Summer 2016 Medellín

Proyecto de Apps Script **aparte** (no toca el de Halloween ni el de los formularios de interesados).

## Archivos
- `Code.gs`: el código del Apps Script.
- `eventos-hub/eventos/medellin-2016.html`: página con mapa de precios, cupos automáticos y pago Wompi (VIP/Backstage con links de Wompi x1 a x4).
- `eventos-hub/eventos/confirmacion-medellin.html`: adonde vuelve el comprador después de pagar.
- `eventos-hub/herramientas-qr/venta-medellin.html`: formulario del staff para ventas por WhatsApp (con PIN).
- `eventos-hub/eventos/escanear-medellin.html`: escáner de la puerta (con PIN).

## Puesta en marcha (una sola vez)
1. Crear una Google Sheet nueva (ej. "Boletería Medellín") → Extensiones → Apps Script → pegar `Code.gs` → Guardar.
2. Configuración del proyecto ⚙ → Propiedades de secuencia de comandos:
   - `WOMPI_PUBLIC_KEY` (Wompi → Desarrolladores → Llaves: pub_prod_…)
   - `WOMPI_INTEGRITY_SECRET` (Wompi → Desarrolladores → Secretos: Integridad)
   - `WOMPI_EVENTS_SECRET` (Wompi → Desarrolladores → Secretos: Eventos)
   - `STAFF_PIN` (el PIN del formulario y del escáner)
   - Opcional: `WOMPI_PRIVATE_KEY` (prv_prod_…) para confirmar pagos aunque el comprador cierre la pestaña.
   - Opcional: `REENVIAR_WEBHOOK_URL` = URL del Apps Script anterior, para no perder avisos de otros eventos.
3. Ejecutar `instalarRevisorDePagos` una vez (crea las hojas y el revisor cada 10 min; acepta los permisos).
4. Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo · Acceso: **Cualquier persona** → copiar la URL.
5. Pegar esa URL en `MDE_API` / `APPS_SCRIPT_URL` de las 4 páginas.
6. (Recomendado) Wompi → Desarrolladores → URL de eventos: poner la URL del paso 4.

## Cupos
Preventa 1 = 50 · Preventa 2 = 100 · VIP = 50 · Backstage = 50 · General sin límite (constante `TIPOS` en `Code.gs`).
Para anular una boleta: en la hoja, columna Estado = `ANULADA` (libera el cupo y el escáner la rechaza).
