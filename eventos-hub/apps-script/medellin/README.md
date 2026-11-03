# Boletería automática · End of Summer 2016 Medellín

Proyecto de Apps Script **aparte** (no toca el de Halloween ni el de los formularios de interesados).

## Archivos
- `Code.gs`: el código del Apps Script.
- `eventos-hub/eventos/medellin-2016.html`: página con mapa de precios, cupos automáticos y pago Wompi (VIP/Backstage con links de Wompi x1 a x4).
- `eventos-hub/eventos/confirmacion-medellin.html`: adonde vuelve el comprador después de pagar.
- `eventos-hub/herramientas-qr/venta-medellin.html`: formulario del staff para ventas por WhatsApp (con PIN).
- `eventos-hub/eventos/escanear-medellin.html`: escáner de la puerta (con PIN).

## Puesta en marcha (una sola vez)
Funciona igual que Halloween: lee los correos "APROBADA" que Wompi manda a Gmail. **No hay que configurar nada en Wompi.**
1. En la cuenta de Google donde llegan los correos de Wompi: crear una Google Sheet nueva (ej. "Boletería Medellín") → Extensiones → Apps Script → pegar `Code.gs` → Guardar.
2. Configuración del proyecto ⚙ → Propiedades de secuencia de comandos → agregar `STAFF_PIN` (el PIN del formulario y del escáner).
3. Ejecutar `instalarRevisores` una vez y aceptar los permisos (lee los correos de Wompi cada 5 minutos).
4. Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo · Acceso: **Cualquier persona** → copiar la URL.
5. Pegar esa URL en `MDE_API` / `APPS_SCRIPT_URL` de las 4 páginas (cupos automáticos, formulario y escáner).

Correos de Wompi que el script deja etiquetados en Gmail: `MDE-QR-Procesado` (boletas enviadas), `MDE-QR-Revisar` (no se pudo, llega un aviso a fantributeco@gmail.com), `MDE-No-es-Medellin` (ventas de otros links, no se tocan).

## Cupos
Preventa 1 = 50 · Preventa 2 = 100 · VIP = 50 · Backstage = 50 · General sin límite (constante `TIPOS` en `Code.gs`).
Para anular una boleta: en la hoja, columna Estado = `ANULADA` (libera el cupo y el escáner la rechaza).
