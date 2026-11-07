/**
 * END OF SUMMER 2016 · MEDELLÍN — boletería automática
 * =====================================================
 * Proyecto de Apps Script aparte, solo para Medellín, pegado en una Google
 * Sheet nueva (Extensiones > Apps Script desde esa hoja).
 *
 * Qué hace:
 *   1. VIP y Backstage se pagan con los links de Wompi (x1 a x4). Igual que en
 *      Halloween, el script lee cada 5 minutos los correos "APROBADA" que Wompi
 *      manda a Gmail: si el link es de Medellín, crea las boletas en la hoja
 *      "Repositorio QR" y le manda al comprador un correo con un QR por boleta.
 *      No hay que configurar nada en Wompi.
 *   2. Las ventas por WhatsApp (Preventa 1, Preventa 2, General o cualquier
 *      tipo) se registran desde el formulario del staff
 *      (herramientas-qr/venta-medellin.html): misma hoja, mismo correo con QR.
 *   3. Cupos: Preventa 1 = 50, Preventa 2 = 100, VIP = 50, Backstage = 50,
 *      General sin límite. La página pregunta los cupos al cargar y marca
 *      AGOTADO sola; cuando se acaba Preventa 1 pasa a Preventa 2, y luego a
 *      General.
 *   4. Escáner de la puerta (eventos/escanear-medellin.html): marca cada QR
 *      como usado en la misma hoja.
 *
 * IMPORTANTE: la Sheet y este Apps Script deben estar en la cuenta de Gmail
 * donde llegan los correos de Wompi (o en una cuenta a la que se reenvíen).
 *
 * Propiedades de secuencia de comandos (Configuración del proyecto ⚙ >
 * Propiedades de secuencia de comandos):
 *   STAFF_PIN   el PIN del formulario de WhatsApp y del escáner (obligatorio)
 *   Opcionales, solo si algún día se quiere el aviso directo de Wompi (webhook)
 *   o el checkout con cantidad libre: WOMPI_EVENTS_SECRET, WOMPI_PUBLIC_KEY,
 *   WOMPI_INTEGRITY_SECRET, WOMPI_PRIVATE_KEY, REENVIAR_WEBHOOK_URL.
 *
 * Después de pegar el código: ejecuta una vez instalarRevisores() desde el
 * editor (acepta los permisos de Gmail y Sheets). Luego Implementar > Nueva
 * implementación > Aplicación web (Ejecutar como: Yo · Quién tiene acceso:
 * Cualquier persona). Esa URL va en la página, en el formulario del staff y
 * en el escáner.
 */

const EVENTO = 'End of Summer 2016 Medellín';
const EVENTO_CORTO = 'END OF SUMMER 2016 · MEDELLÍN';
const FECHA_EVENTO = 'Sábado 12 de diciembre';
const LUGAR_EVENTO = 'Xero Club · Cl. 25 #43G-29, Medellín';
const SITIO = 'https://end-of-summer-2016-medellin.netlify.app';
const AVISO_EMAIL = 'fantributeco@gmail.com';   // recibe un aviso por cada venta
const PREFIJO_REF = 'EOSMDE';                   // referencias del checkout: EOSMDE-VIP-2-xxxx
const MAX_POR_COMPRA = 4;
const RESERVA_MIN = 20;   // minutos que un checkout sin pagar aparta cupo

// Tipos de boleta. "online": se puede pagar por Wompi desde la página.
const TIPOS = {
  P1:  { tipo: 'Preventa 1', precio: 35000, cupo: 50,   consumo: 15000, shot: false, online: false, detalle: 'General · A pie', agotado: true }, // agotada a mano
  P2:  { tipo: 'Preventa 2', precio: 40000, cupo: 100,  consumo: 15000, shot: false, online: false, detalle: 'General · A pie' },
  GEN: { tipo: 'General',    precio: 45000, cupo: null, consumo: 15000, shot: false, online: false, detalle: 'A pie' },
  VIP: { tipo: 'VIP',        precio: 85000, cupo: 50,   consumo: 20000, shot: true,  online: true,  detalle: 'A pie · Tarima VIP' },
  BKS: { tipo: 'Backstage',  precio: 95000, cupo: 50,   consumo: 20000, shot: true,  online: true,  detalle: 'A pie · Junto al DJ' }
};
const ORDEN_ETAPAS = ['P1', 'P2', 'GEN'];

// Links de pago de Wompi (uno por cantidad). La página abre el que corresponde
// a la cantidad elegida; cuando el pago se aprueba se generan esa cantidad de QR.
// El precio lo fija cada link en Wompi, por eso no se exige un monto exacto.
const LINKS_FIJOS = {
  kj5Nkr:   { key: 'VIP', cantidad: 1 },
  py5Cbe:   { key: 'VIP', cantidad: 2 },
  YH90PE:   { key: 'VIP', cantidad: 3 },
  KxCEFE:   { key: 'VIP', cantidad: 4 },
  '8EDAxF': { key: 'BKS', cantidad: 1 },
  hfFUoF:   { key: 'BKS', cantidad: 2 },
  pv9Uxf:   { key: 'BKS', cantidad: 3 },
  BtXI7L:   { key: 'BKS', cantidad: 4 },
  // Preventa 2 ($40.000 c/u)
  uIBaAU:   { key: 'P2',  cantidad: 1 },
  EwJjdk:   { key: 'P2',  cantidad: 2 },
  uo5HvV:   { key: 'P2',  cantidad: 3 },
  uXST6w:   { key: 'P2',  cantidad: 4 },
  aRnpk2:   { key: 'P2',  cantidad: 5 },
  wME6sq:   { key: 'P2',  cantidad: 1 }   // link x1 anterior, por si alguien paga con él
};

const SHEET_NAME = 'Repositorio QR';
const HEADERS = [
  'Fecha', 'Evento', 'Tipo de entrada', 'Numero', 'Ticket ID',
  'Transaccion ID', 'Referencia', 'Nombre', 'Email', 'Telefono',
  'Monto COP', 'Estado', 'Email enviado', 'Escaneado', 'Fecha escaneo'
];
const CHECKOUT_SHEET = 'Checkouts Wompi';
const CHECKOUT_HEADERS = ['Fecha', 'Referencia', 'Tipo de entrada', 'Cantidad', 'Monto COP', 'Estado', 'Transaccion ID'];

// ---------------------------------------------------------------- entradas

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'cupos') return json_(resumenCupos_());
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, status: 'peticion_invalida' });
  }

  try {
    if (body.event && body.signature && body.data) return webhookWompi_(body, e.postData.contents);
    switch (body.action) {
      case 'cupos':     return json_(resumenCupos_());
      case 'checkout':  return json_(crearCheckout_(body));
      case 'confirmar': return json_(confirmarPago_(body));
      case 'manual':    return json_(ventaManual_(body));
      case 'scan':      return json_(escanear_(body));
      default:          return json_({ ok: false, status: 'accion_desconocida' });
    }
  } catch (err) {
    Logger.log('doPost error: ' + (err && err.stack || err));
    return json_({ ok: false, status: 'error_interno' });
  }
}

// ---------------------------------------------------------------- cupos

function resumenCupos_() {
  const vendidas = contarVendidas_();
  const reservadas = contarReservadas_();
  const tipos = {};
  Object.keys(TIPOS).forEach(function (k) {
    const t = TIPOS[k];
    const usadas = (vendidas[k] || 0) + (reservadas[k] || 0);
    tipos[k] = {
      tipo: t.tipo, precio: t.precio, cupo: t.cupo,
      vendidas: vendidas[k] || 0,
      disponibles: t.cupo == null ? null : Math.max(0, t.cupo - usadas),
      agotado: !!t.agotado || (t.cupo != null && usadas >= t.cupo),
      online: t.online
    };
  });
  let etapa = 'GEN';
  for (let i = 0; i < ORDEN_ETAPAS.length; i++) {
    if (!tipos[ORDEN_ETAPAS[i]].agotado) { etapa = ORDEN_ETAPAS[i]; break; }
  }
  return { ok: true, etapa: etapa, tipos: tipos, max: MAX_POR_COMPRA };
}

function contarVendidas_() {
  const data = hoja_().getDataRange().getValues();
  const n = {};
  for (let i = 1; i < data.length; i++) {
    const key = keyDeTipo_(data[i][2]);
    const estado = String(data[i][11]).toUpperCase();
    if (key && estado !== 'ANULADA') n[key] = (n[key] || 0) + 1;
  }
  return n;
}

function contarReservadas_() {
  const data = hojaCheckouts_().getDataRange().getValues();
  const limite = Date.now() - RESERVA_MIN * 60000;
  const n = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] !== 'PENDIENTE') continue;
    const f = data[i][0] instanceof Date ? data[i][0].getTime() : 0;
    if (f < limite) continue;
    const key = keyDeTipo_(data[i][2]);
    if (key) n[key] = (n[key] || 0) + Number(data[i][3] || 0);
  }
  return n;
}

function keyDeTipo_(nombre) {
  const s = String(nombre || '').trim().toLowerCase();
  for (const k in TIPOS) if (TIPOS[k].tipo.toLowerCase() === s) return k;
  return null;
}

// ---------------------------------------------------------------- checkout Wompi

function crearCheckout_(b) {
  const key = String(b.tipo || '').toUpperCase();
  const t = TIPOS[key];
  const cantidad = parseInt(b.cantidad, 10);
  if (!t || !t.online) return { ok: false, status: 'tipo_invalido' };
  if (!(cantidad >= 1 && cantidad <= MAX_POR_COMPRA)) return { ok: false, status: 'cantidad_invalida' };

  const props = PropertiesService.getScriptProperties();
  const pub = props.getProperty('WOMPI_PUBLIC_KEY');
  const integridad = props.getProperty('WOMPI_INTEGRITY_SECRET');
  if (!pub || !integridad) return { ok: false, status: 'wompi_sin_configurar' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cupos = resumenCupos_().tipos[key];
    if (cupos.disponibles != null && cupos.disponibles < cantidad) {
      return { ok: false, status: cupos.disponibles === 0 ? 'agotado' : 'sin_cupo', disponibles: cupos.disponibles };
    }
    const referencia = nuevaReferencia_(key, cantidad);
    const centavos = t.precio * cantidad * 100;
    const firma = sha256Hex_(referencia + centavos + 'COP' + integridad).toLowerCase();
    hojaCheckouts_().appendRow([new Date(), referencia, t.tipo, cantidad, t.precio * cantidad, 'PENDIENTE', '']);
    SpreadsheetApp.flush();

    const volver = String(b.volver || '').indexOf('https://') === 0 ? b.volver : SITIO + '/eventos-hub/eventos/confirmacion-medellin.html';
    const url = 'https://checkout.wompi.co/p/?' + [
      'public-key=' + encodeURIComponent(pub),
      'currency=COP',
      'amount-in-cents=' + centavos,
      'reference=' + encodeURIComponent(referencia),
      'signature:integrity=' + firma,
      'redirect-url=' + encodeURIComponent(volver)
    ].join('&');
    return { ok: true, url: url, referencia: referencia, total: t.precio * cantidad };
  } finally {
    lock.releaseLock();
  }
}

function nuevaReferencia_(key, cantidad) {
  const azar = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  return PREFIJO_REF + '-' + key + '-' + cantidad + '-' + Date.now().toString(36).toUpperCase() + azar;
}

/** Lee "EOSMDE-VIP-2-XXXX" o "kj5Nkr_..." y devuelve { key, cantidad } o null. */
function leerReferencia_(ref) {
  ref = String(ref || '');
  const m = ref.match(/^EOSMDE-([A-Z0-9]+)-(\d+)-[A-Z0-9]+$/);
  if (m && TIPOS[m[1]]) return { key: m[1], cantidad: parseInt(m[2], 10) };
  const fijo = LINKS_FIJOS[ref.split('_')[0]];
  return fijo ? { key: fijo.key, cantidad: fijo.cantidad, link: true } : null;
}

// ---------------------------------------------------------------- pagos aprobados

/** Aviso de Wompi (URL de eventos). */
function webhookWompi_(body, crudo) {
  const tx = body.data && body.data.transaction;
  const esNuestra = tx && leerReferencia_(tx.reference);

  if (!esNuestra) {
    // No es de Medellín: se reenvía al Apps Script anterior, si está configurado.
    const otra = PropertiesService.getScriptProperties().getProperty('REENVIAR_WEBHOOK_URL');
    if (otra) {
      try {
        UrlFetchApp.fetch(otra, { method: 'post', contentType: 'application/json', payload: crudo, muteHttpExceptions: true });
      } catch (err) {
        Logger.log('No se pudo reenviar el aviso de Wompi: ' + err);
      }
    }
    return json_({ ok: true, status: 'no_es_medellin' });
  }
  if (!firmaWompiValida_(body)) {
    Logger.log('Aviso de Wompi con firma inválida, referencia ' + tx.reference);
    return json_({ ok: false, status: 'firma_invalida' });
  }
  return json_({ ok: true, status: procesarTransaccion_(tx).status });
}

/** La página de confirmación llama esto con el ?id= que Wompi le pone al volver. */
function confirmarPago_(b) {
  const id = String(b.id || '').trim();
  if (!/^[\w-]{6,80}$/.test(id)) return { ok: false, status: 'id_invalido' };
  const tx = consultarTransaccion_(id);
  if (!tx) return { ok: false, status: 'no_encontrada' };
  if (!leerReferencia_(tx.reference)) return { ok: false, status: 'no_es_medellin' };
  if (tx.status === 'PENDING') return { ok: true, status: 'pendiente' };
  if (tx.status !== 'APPROVED') {
    marcarCheckout_(tx.reference, tx.status, tx.id);
    return { ok: true, status: 'rechazada', estado: tx.status };
  }
  const r = procesarTransaccion_(tx);
  return { ok: true, status: r.status, cantidad: r.cantidad, tipo: r.tipo };
}

/** Consulta pública de Wompi: no necesita llave. */
function consultarTransaccion_(id) {
  const res = UrlFetchApp.fetch('https://production.wompi.co/v1/transactions/' + encodeURIComponent(id), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const data = JSON.parse(res.getContentText()).data;
  return data || null;
}

/**
 * Crea las boletas de una transacción aprobada y manda el correo.
 * Si ya estaba procesada (llegó por el aviso y por la página), no repite nada.
 */
function procesarTransaccion_(tx) {
  const info = leerReferencia_(tx.reference);
  if (!info) return { status: 'no_es_medellin' };
  if (tx.status !== 'APPROVED') return { status: 'no_aprobada' };
  const t = TIPOS[info.key];
  const esperado = t.precio * info.cantidad * 100;
  if (!info.link && Number(tx.amount_in_cents) < esperado) {
    avisar_('Revisar pago de Medellín: monto no coincide',
      'La transacción ' + tx.id + ' (ref. ' + tx.reference + ') pagó ' + (tx.amount_in_cents / 100) +
      ' COP pero ' + info.cantidad + ' x ' + t.tipo + ' cuesta ' + (esperado / 100) + ' COP. No se generaron boletas.');
    marcarCheckout_(tx.reference, 'MONTO_NO_COINCIDE', tx.id);
    return { status: 'monto_no_coincide' };
  }
  const cd = tx.customer_data || {};
  const email = String(tx.customer_email || '').trim();
  if (!email) {
    avisar_('Revisar pago de Medellín: sin correo', 'La transacción ' + tx.id + ' (ref. ' + tx.reference + ') no trae correo del comprador.');
    return { status: 'sin_email' };
  }
  const r = registrarBoletas_({
    key: info.key, cantidad: info.cantidad, txId: tx.id, referencia: tx.reference,
    nombre: cd.full_name || cd.legal_id_name || 'Sin nombre', email: email,
    telefono: cd.phone_number || '', montoTotal: Number(tx.amount_in_cents) / 100, estado: 'APPROVED'
  });
  marcarCheckout_(tx.reference, 'APROBADA', tx.id);
  if (r.status === 'procesada') {
    avisar_('Venta Wompi Medellín: ' + info.cantidad + ' x ' + t.tipo,
      r.nombre + ' (' + email + ') compró ' + info.cantidad + ' x ' + t.tipo + ' por $' + formato_(r.montoTotal) +
      '.\nBoletas: ' + r.ticketIds.join(', ') + '\nCorreo con QR enviado: ' + (r.enviado ? 'sí' : 'NO, revisar'));
  }
  return { status: r.status, cantidad: info.cantidad, tipo: t.tipo };
}

/** Revisor automático: confirma checkouts pendientes (necesita WOMPI_PRIVATE_KEY). */
function revisarPagosPendientes() {
  const llave = PropertiesService.getScriptProperties().getProperty('WOMPI_PRIVATE_KEY');
  if (!llave) return;
  const sh = hojaCheckouts_();
  const data = sh.getDataRange().getValues();
  const hace2dias = Date.now() - 48 * 3600000;
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] !== 'PENDIENTE') continue;
    const f = data[i][0] instanceof Date ? data[i][0].getTime() : 0;
    if (f < hace2dias) { sh.getRange(i + 1, 6).setValue('VENCIDA'); continue; }
    const res = UrlFetchApp.fetch('https://production.wompi.co/v1/transactions?reference=' + encodeURIComponent(data[i][1]),
      { headers: { Authorization: 'Bearer ' + llave }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) continue;
    const lista = JSON.parse(res.getContentText()).data || [];
    const aprobada = lista.filter(function (x) { return x.status === 'APPROVED'; })[0];
    if (aprobada) procesarTransaccion_(aprobada);
    else if (lista.length && lista.every(function (x) { return ['DECLINED', 'VOIDED', 'ERROR'].indexOf(x.status) !== -1; })) {
      sh.getRange(i + 1, 6).setValue(lista[0].status);
    }
  }
}

/**
 * Ejecutar UNA vez desde el editor: lee los correos de Wompi cada 5 minutos
 * (y revisa checkouts pendientes cada 10 si hay WOMPI_PRIVATE_KEY).
 */
function instalarRevisores() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const f = tr.getHandlerFunction();
    if (f === 'revisarPagosPendientes' || f === 'revisarCorreosWompi') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('revisarCorreosWompi').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('revisarPagosPendientes').timeBased().everyMinutes(10).create();
  hoja_(); hojaCheckouts_();
  try { prepararHojaVentas_(); } catch (err) { Logger.log('No se pudo preparar la hoja: ' + err); }
  [LABEL_OK, LABEL_REVISAR, LABEL_OTRO].forEach(etiqueta_);
  revisarCorreosWompi();
  Logger.log('Listo: lector de correos de Wompi cada 5 minutos y hojas creadas.');
}
function instalarRevisorDePagos() { instalarRevisores(); }

// ---------------------------------------------------------------- correos de Wompi (como Halloween)

const LABEL_OK = 'MDE-QR-Procesado';
const LABEL_REVISAR = 'MDE-QR-Revisar';
const LABEL_OTRO = 'MDE-No-es-Medellin';
// Ventas de antes de esta fecha no se tocan.
const CORREOS_DESDE = '2026/11/01';
const BUSQUEDA_WOMPI = '"APROBADA" "ref." after:' + CORREOS_DESDE +
  ' -subject:"Revisar pago de Medellín" -label:' + LABEL_OK + ' -label:' + LABEL_REVISAR + ' -label:' + LABEL_OTRO;

/** Disparador cada 5 min: procesa los correos "APROBADA" de Wompi de los links de Medellín. */
function revisarCorreosWompi() {
  const ok = etiqueta_(LABEL_OK), revisar = etiqueta_(LABEL_REVISAR), otro = etiqueta_(LABEL_OTRO);
  const hilos = GmailApp.search(BUSQUEDA_WOMPI, 0, 30);
  hilos.forEach(function (hilo) {
    let esMedellin = false, problema = false;
    hilo.getMessages().forEach(function (msg) {
      const p = leerCorreoWompi_(msg);
      if (!p || !LINKS_FIJOS[p.linkId]) return;
      esMedellin = true;
      try {
        const info = LINKS_FIJOS[p.linkId];
        if (!p.email) {
          problema = true;
          avisar_('Revisar pago de Medellín: sin correo del comprador',
            'No se encontró el correo del comprador en el aviso de Wompi.\nAsunto: ' + msg.getSubject() + '\nFecha: ' + msg.getDate() +
            '\nRegístralo a mano desde el formulario de ventas.');
          return;
        }
        const r = registrarBoletas_({
          key: info.key, cantidad: info.cantidad, txId: p.txId || p.referencia, referencia: p.referencia,
          nombre: p.nombre || 'Sin nombre', email: p.email, telefono: p.telefono,
          montoTotal: p.monto || TIPOS[info.key].precio * info.cantidad, estado: 'APPROVED'
        });
        if (r.status === 'procesada') {
          avisar_('Venta Wompi Medellín: ' + info.cantidad + ' x ' + TIPOS[info.key].tipo,
            r.nombre + ' (' + p.email + ') compró ' + info.cantidad + ' x ' + TIPOS[info.key].tipo + ' por $' + formato_(r.montoTotal) +
            '.\nBoletas: ' + r.ticketIds.join(', ') + '\nCorreo con QR enviado: ' + (r.enviado ? 'sí' : 'NO, revisar'));
        }
      } catch (err) {
        problema = true;
        Logger.log('Error con el correo "' + msg.getSubject() + '": ' + err);
      }
    });
    hilo.addLabel(!esMedellin ? otro : (problema ? revisar : ok));
  });
}

/** Lee del correo de Wompi: link, referencia, monto, comprador, transacción, correo y teléfono. */
function leerCorreoWompi_(msg) {
  const m = (msg.getSubject() || '').match(/ref\.\s*(\S+)/i);
  if (!m) return null;
  const cuerpo = msg.getPlainBody() || '';
  const correo = cuerpo.match(/escribiendo a\s*([^\s@]+@[^\s]+?)\s+o llamando al/i);
  const tel = cuerpo.match(/o llamando al\s*(\+?\d[\d ]*)/i);
  const monto = cuerpo.match(/COP\s*\$\s*([\d.,]+)/);
  return {
    referencia: m[1], linkId: m[1].split('_')[0],
    monto: monto ? Math.round(parseFloat(monto[1].replace(/\./g, '').replace(/,/g, ''))) : 0,
    nombre: valorTabla_(cuerpo, 'Comprador'),
    txId: valorTabla_(cuerpo, 'Transacción #') || valorTabla_(cuerpo, 'Transaccion #'),
    email: correo ? correo[1].trim() : '',
    telefono: tel ? tel[1].trim() : ''
  };
}

function valorTabla_(cuerpo, etiqueta) {
  const esc = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const misma = cuerpo.match(new RegExp(esc + '[ \\t]+([^\\r\\n]+)'));
  if (misma && misma[1].trim()) return misma[1].trim();
  const lineas = cuerpo.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim() === etiqueta) {
      for (let j = i + 1; j < Math.min(i + 4, lineas.length); j++) if (lineas[j].trim()) return lineas[j].trim();
    }
  }
  return '';
}

function etiqueta_(nombre) { return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre); }

function marcarCheckout_(referencia, estado, txId) {
  const sh = hojaCheckouts_();
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === referencia) {
      if (data[i][5] === 'APROBADA' && estado !== 'APROBADA') return;
      sh.getRange(i + 1, 6, 1, 2).setValues([[estado, txId || data[i][6]]]);
      return;
    }
  }
}

function firmaWompiValida_(body) {
  const secreto = PropertiesService.getScriptProperties().getProperty('WOMPI_EVENTS_SECRET');
  if (!secreto) { Logger.log('Falta WOMPI_EVENTS_SECRET.'); return false; }
  const props = (body.signature && body.signature.properties) || [];
  const recibido = String((body.signature && body.signature.checksum) || '').toUpperCase();
  if (!recibido || !props.length) return false;
  let cadena = '';
  props.forEach(function (ruta) {
    let v = body.data;
    ruta.split('.').forEach(function (p) { v = v == null ? null : v[p]; });
    cadena += v == null ? '' : String(v);
  });
  return sha256Hex_(cadena + body.timestamp + secreto).toUpperCase() === recibido;
}

// ---------------------------------------------------------------- ventas por WhatsApp

function ventaManual_(b) {
  const error = pinInvalido_(b.pin);
  if (error) return error;
  const key = String(b.tipo || '').toUpperCase();
  const t = TIPOS[key];
  const cantidad = parseInt(b.cantidad, 10);
  const nombre = limpiar_(b.nombre, 80);
  const email = limpiar_(b.email, 120).toLowerCase();
  if (!t) return { ok: false, status: 'tipo_invalido' };
  if (!(cantidad >= 1 && cantidad <= 20)) return { ok: false, status: 'cantidad_invalida' };
  if (!nombre) return { ok: false, status: 'falta_nombre' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, status: 'email_invalido' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cupos = resumenCupos_().tipos[key];
    if (cupos.disponibles != null && cupos.disponibles < cantidad && !b.forzar) {
      return { ok: false, status: 'sin_cupo', disponibles: cupos.disponibles };
    }
  } finally {
    lock.releaseLock();
  }

  const monto = Number(String(b.monto || '').replace(/[^\d]/g, '')) || t.precio * cantidad;
  const r = registrarBoletas_({
    key: key, cantidad: cantidad,
    txId: 'WA-' + Date.now().toString(36).toUpperCase() + Utilities.getUuid().slice(0, 4).toUpperCase(),
    referencia: limpiar_(b.referencia, 80) || 'WhatsApp',
    nombre: nombre, email: email, telefono: limpiar_(b.telefono, 30),
    montoTotal: monto, estado: 'MANUAL', noEnviar: b.enviar === false
  });
  return { ok: true, status: r.status, ticketIds: r.ticketIds, enviado: r.enviado, cupos: resumenCupos_() };
}

// ---------------------------------------------------------------- boletas + correo

/** Iniciales del comprador: "Juan Sebastián Parra" -> "JSP" (3 letras, como en Halloween). */
function iniciales_(nombre, email) {
  const sinTildes = function (x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  let limpio = sinTildes(nombre).replace(/[^a-z ]/g, ' ');
  if (limpio.trim() === 'sin nombre') limpio = '';
  const PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do'];
  const palabras = limpio.split(' ').filter(function (w) { return w && PARTICULAS.indexOf(w) === -1; });
  let ini = palabras.slice(0, 3).map(function (w) { return w.charAt(0); }).join('');
  if (ini.length < 3 && palabras.length) ini = (ini + palabras[palabras.length - 1].slice(1)).slice(0, 3);
  if (ini.length < 3) ini = (ini + sinTildes(email).split('@')[0].replace(/[^a-z]/g, '')).slice(0, 3);
  while (ini.length < 3) ini += 'X';
  return ini.toUpperCase();
}

/** Código de la boleta: MDE-<iniciales>-<tipo>-<número>, ej. MDE-JSP-VIP-0007. */
function codigoBoleta_(key, numero, nombre, email) {
  return 'MDE-' + iniciales_(nombre, email) + '-' + key + '-' + ('000' + numero).slice(-4);
}

function registrarBoletas_(v) {
  const t = TIPOS[v.key];
  const sh = hoja_();
  const ids = [];
  let inicio;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const data = sh.getDataRange().getValues();
    let maxNumero = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][5]) === String(v.txId)) return { status: 'ya_procesada', ticketIds: [], nombre: v.nombre, montoTotal: v.montoTotal };
      if (keyDeTipo_(data[i][2]) === v.key) {
        const n = parseInt(data[i][3], 10);
        if (!isNaN(n)) maxNumero = Math.max(maxNumero, n);
      }
    }
    const montoUnidad = Math.round(v.montoTotal / v.cantidad);
    const filas = [];
    for (let k = 0; k < v.cantidad; k++) {
      const numero = maxNumero + 1 + k;
      const ticketId = codigoBoleta_(v.key, numero, v.nombre, v.email);
      filas.push([new Date(), EVENTO, t.tipo, numero, ticketId, v.txId, v.referencia, v.nombre, v.email, v.telefono, montoUnidad, v.estado, false, false, '']);
      ids.push(ticketId);
    }
    inicio = ultimaFilaConDatos_(data) + 1;
    sh.getRange(inicio, 1, filas.length, HEADERS.length).setValues(filas);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  let enviado = false;
  if (!v.noEnviar) {
    try {
      enviarQR_({ email: v.email, nombre: v.nombre, key: v.key, ticketIds: ids });
      sh.getRange(inicio, 13, ids.length, 1).setValues(ids.map(function () { return [true]; }));
      enviado = true;
    } catch (err) {
      Logger.log('Boletas ' + ids.join(', ') + ' guardadas, pero el correo falló: ' + err + '. Corre reenviarCorreosPendientes().');
    }
  }
  return { status: 'procesada', ticketIds: ids, enviado: enviado, nombre: v.nombre, montoTotal: v.montoTotal };
}

// ---------------------------------------------------------------- ventas escritas en la hoja (como Halloween)

/** Menú "Boletería" en la Google Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎟️ Boletería')
    .addItem('Enviar QR de las ventas nuevas', 'enviarQRPendientes')
    .addItem('Reenviar correos que fallaron', 'reenviarCorreosPendientes')
    .addSeparator()
    .addItem('Enviarme un correo de prueba', 'enviarPrueba')
    .addItem('Preparar la hoja (listas y casillas)', 'prepararHojaVentas_')
    .addToUi();
}

/** Lista desplegable de tipos y casillas en "Repositorio QR". */
function prepararHojaVentas_() {
  const sh = hoja_();
  const filas = Math.max(sh.getMaxRows() - 1, 999);
  const tipos = Object.keys(TIPOS).map(function (k) { return TIPOS[k].tipo; });
  sh.getRange(2, 3, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(tipos, true).setAllowInvalid(false).build());
  sh.getRange(2, 13, filas, 2).insertCheckboxes();
  sh.getRange(1, 3).setNote('Elige el tipo de la lista. Una fila = una boleta.');
  sh.getRange(1, 8).setNote('Nombre completo: de aquí salen las iniciales del código (Juan Sebastián Parra → JSP).');
  sh.getRange(1, 9).setNote('Correo del comprador: ahí le llegan los QR.');
  sh.getRange(1, 11).setNote('Si lo dejas vacío se pone el precio del tipo.');
  sh.getRange(1, 5).setNote('NO lo escribas: se llena solo al enviar los QR.');
  sh.getRange(1, 1, 1, HEADERS.length).setBackground('#17121F').setFontColor('#F3EBDD');
  [3, 8, 9, 10, 11, 7].forEach(function (c) { sh.getRange(1, c).setBackground('#5B22D6'); });
}

/**
 * Menú "Enviar QR de las ventas nuevas": busca las filas que tú escribiste a
 * mano (con Tipo de entrada, Nombre y Email, pero sin Ticket ID), les pone
 * número y código con las iniciales, y manda el correo con los QR. Si el
 * mismo comprador tiene varias filas del mismo tipo, le llega un solo correo
 * con todas sus boletas.
 */
function enviarQRPendientes() {
  const sh = hoja_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const grupos = {}, orden = [], errores = [];
  try {
    const data = sh.getDataRange().getValues();
    const maxNum = {};
    for (let i = 1; i < data.length; i++) {
      const k = keyDeTipo_(data[i][2]), n = parseInt(data[i][3], 10);
      if (k && data[i][4] && !isNaN(n)) maxNum[k] = Math.max(maxNum[k] || 0, n);
    }
    for (let i = 1; i < data.length; i++) {
      const f = data[i];
      if (f[4] || (!f[2] && !f[7] && !f[8])) continue;          // ya tiene código o fila vacía
      const key = keyDeTipo_(f[2]);
      const nombre = limpiar_(f[7], 80), email = limpiar_(f[8], 120).toLowerCase();
      if (!key || !nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errores.push('Fila ' + (i + 1) + ': revisa ' + (!key ? 'el tipo de entrada' : !nombre ? 'el nombre' : 'el correo'));
        continue;
      }
      const g = key + '|' + email + '|' + nombre.toLowerCase();
      if (!grupos[g]) { grupos[g] = { key: key, nombre: nombre, email: email, filas: [], ids: [], tx: 'WA-' + Date.now().toString(36).toUpperCase() + orden.length }; orden.push(g); }
      const numero = (maxNum[key] = (maxNum[key] || 0) + 1);
      const id = codigoBoleta_(key, numero, nombre, email);
      const t = TIPOS[key];
      sh.getRange(i + 1, 1, 1, 12).setValues([[
        f[0] || new Date(), EVENTO, t.tipo, numero, id, grupos[g].tx, f[6] || 'WhatsApp',
        nombre, email, f[9], f[10] === '' || f[10] == null ? t.precio : f[10], 'MANUAL'
      ]]);
      grupos[g].filas.push(i + 1); grupos[g].ids.push(id);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  let enviados = 0, fallidos = 0;
  orden.forEach(function (g) {
    const x = grupos[g];
    try {
      enviarQR_({ email: x.email, nombre: x.nombre, key: x.key, ticketIds: x.ids });
      x.filas.forEach(function (r) { sh.getRange(r, 13).setValue(true); });
      enviados += x.ids.length;
    } catch (err) {
      fallidos += x.ids.length;
      Logger.log('No salió el correo de ' + x.email + ': ' + err);
    }
  });

  const msg = (enviados ? '✅ ' + enviados + (enviados === 1 ? ' boleta enviada' : ' boletas enviadas') + '. ' : 'No había ventas nuevas para enviar. ') +
    (fallidos ? '⚠️ ' + fallidos + ' no salieron (usa "Reenviar correos que fallaron"). ' : '') +
    (errores.length ? '\n\nFilas sin enviar:\n' + errores.join('\n') : '');
  try { SpreadsheetApp.getUi().alert('Boletería Medellín', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
  return msg;
}

/** Última fila (1 = encabezados) con algo escrito en las columnas A a L; ignora las casillas vacías. */
function ultimaFilaConDatos_(data) {
  for (let i = data.length - 1; i >= 1; i--) {
    for (let c = 0; c < 12; c++) if (data[i][c] !== '' && data[i][c] != null) return i + 1;
  }
  return 1;
}

/** Ejecutar a mano si algún correo falló: reenvía los QR con "Email enviado" en FALSE. */
function reenviarCorreosPendientes() {
  const sh = hoja_();
  const data = sh.getDataRange().getValues();
  const grupos = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][12] === true || !data[i][8] || !data[i][4]) continue;
    const g = data[i][5] + '|' + data[i][8];
    (grupos[g] = grupos[g] || { filas: [], email: data[i][8], nombre: data[i][7], key: keyDeTipo_(data[i][2]), ids: [] });
    grupos[g].filas.push(i + 1); grupos[g].ids.push(data[i][4]);
  }
  Object.keys(grupos).forEach(function (g) {
    const x = grupos[g];
    if (!x.key) return;
    try {
      enviarQR_({ email: x.email, nombre: x.nombre, key: x.key, ticketIds: x.ids });
      x.filas.forEach(function (f) { sh.getRange(f, 13).setValue(true); });
    } catch (err) {
      Logger.log('Sigue fallando el correo de ' + x.email + ': ' + err);
    }
  });
}

// Imágenes del correo (logos). Se descargan del repo público en GitHub, así
// no dependen de que Netlify esté publicando.
const IMG_CORREO = 'https://raw.githubusercontent.com/SebatjaUwU/fan-tribute-hub/master/edc-preparty/ASSETS/qr-medellin/';
const COLOR_TIPO = { P1: '#19E3FF', P2: '#4C7BFF', GEN: '#8B3DFF', VIP: '#A45BFF', BKS: '#D9B26B' };
var IMG_CACHE_ = {};
function imgCorreo_(nombre) {
  if (!(nombre in IMG_CACHE_)) {
    try {
      const r = UrlFetchApp.fetch(IMG_CORREO + nombre, { muteHttpExceptions: true });
      IMG_CACHE_[nombre] = r.getResponseCode() === 200 ? r.getBlob().setName(nombre) : null;
    } catch (err) {
      IMG_CACHE_[nombre] = null;
    }
  }
  return IMG_CACHE_[nombre];
}

function enviarQR_(d) {
  const t = TIPOS[d.key];
  const color = COLOR_TIPO[d.key] || '#8B3DFF';
  const F = "font-family:Roboto,'Helvetica Neue',Arial,sans-serif;";
  const inline = {};
  const adjuntos = [];

  const logo = imgCorreo_('eos-logo.png');
  const ft = imgCorreo_('fantribute-logo.png');
  const xero = imgCorreo_('xero-logo.png');
  if (logo) inline.logo = logo;
  if (ft) inline.ft = ft;
  if (xero) inline.xero = xero;

  const bloques = d.ticketIds.map(function (id, i) {
    const qr = UrlFetchApp.fetch('https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=10&data=' + encodeURIComponent(id))
      .getBlob().setName(id + '.png');
    inline['qr' + i] = qr;
    try {
      adjuntos.push(boletaPng_({ key: d.key, id: id, nombre: d.nombre, entrada: (i + 1) + ' de ' + d.ticketIds.length, qr: qr.copyBlob() }));
    } catch (err) {
      Logger.log('No se pudo armar la imagen de la boleta ' + id + ' (' + err + '); se adjunta solo el QR.');
      adjuntos.push(qr.copyBlob().setName('QR-' + id + '.png'));
    }
    return '<tr><td style="padding:0 0 14px;">' +
      '<table role="presentation" width="100%" style="border-collapse:collapse;background:#F3EBDD;border-left:6px solid ' + color + ';">' +
      '<tr><td style="padding:18px 20px 6px;' + F + 'font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#5B22D6;">' +
      'Entrada ' + (i + 1) + ' de ' + d.ticketIds.length + '</td>' +
      '<td style="padding:18px 20px 6px;text-align:right;' + F + 'font-size:20px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:#17121F;">' + esc_(t.tipo) + '</td></tr>' +
      '<tr><td colspan="2" style="padding:8px 20px 4px;text-align:center;">' +
      '<img src="cid:qr' + i + '" width="230" height="230" alt="QR ' + id + '" style="display:block;margin:0 auto;background:#ffffff;border:8px solid #ffffff;"></td></tr>' +
      '<tr><td colspan="2" style="padding:6px 20px 4px;text-align:center;font-family:\'Roboto Mono\',Menlo,Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:2px;color:#17121F;">' + id + '</td></tr>' +
      '<tr><td colspan="2" style="padding:2px 20px 18px;text-align:center;' + F + 'font-size:12px;color:#5c546b;">' + esc_(d.nombre) + ' · ' + esc_(t.detalle) + '</td></tr>' +
      '</table></td></tr>';
  }).join('');

  const extras = ['$' + formato_(t.consumo) + ' en consumo'];
  if (t.shot) extras.push('shot de bienvenida');
  const cabecera = logo
    ? '<img src="cid:logo" width="250" alt="End of Summer 2016 · Medellín · + EDM Party" style="display:block;margin:0 auto;width:250px;max-width:70%;height:auto;">'
    : '<div style="' + F + 'font-size:34px;font-weight:900;color:#F3EBDD;">END OF SUMMER <span style="color:#8B3DFF;">2016</span></div>';
  const logos = (ft || xero)
    ? '<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>' +
      (ft ? '<td style="text-align:center;padding:6px 10px;vertical-align:middle;"><div style="' + F + 'font-size:9px;font-weight:700;letter-spacing:2px;color:#6f6880;text-transform:uppercase;margin-bottom:8px;">Organiza</div><img src="cid:ft" width="130" alt="Fan Tribute" style="display:inline-block;width:130px;height:auto;"></td>' : '') +
      (xero ? '<td style="text-align:center;padding:6px 10px;vertical-align:middle;"><div style="' + F + 'font-size:9px;font-weight:700;letter-spacing:2px;color:#6f6880;text-transform:uppercase;margin-bottom:8px;">Lugar</div><img src="cid:xero" width="74" alt="Xero Club" style="display:inline-block;width:74px;height:auto;"></td>' : '') +
      '</tr></table>'
    : '';

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&family=Roboto+Mono:wght@700&display=swap" rel="stylesheet"></head>' +
    '<body style="margin:0;padding:0;background:#07060B;">' +
    '<div style="background:#07060B;padding:30px 12px;' + F + 'color:#F3EBDD;">' +
    '<table role="presentation" width="100%" style="max-width:540px;margin:0 auto;border-collapse:collapse;">' +
    '<tr><td style="text-align:center;padding:0 0 18px;">' + cabecera + '</td></tr>' +
    '<tr><td style="text-align:center;padding:0 0 24px;"><span style="display:inline-block;padding:9px 16px;border:1px solid #2f2a40;' + F +
    'font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#F3EBDD;">Sáb 12 dic · Xero Club · Medellín</span></td></tr>' +
    '<tr><td style="background:#0E0C15;border:1px solid #241f33;padding:26px 24px 10px;">' +
    '<p style="margin:0 0 4px;' + F + 'font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:' + color + ';">Tus boletas están listas</p>' +
    '<p style="margin:0 0 10px;' + F + 'font-size:24px;font-weight:900;color:#F3EBDD;">¡Hola, ' + esc_(d.nombre) + '!</p>' +
    '<p style="margin:0 0 20px;' + F + 'font-size:15px;line-height:1.6;color:#C9C2D6;">Gracias por estar en <strong style="color:#F3EBDD;">End of Summer 2016</strong>. ' +
    'Aquí tienes ' + (d.ticketIds.length === 1 ? 'tu boleta' : 'tus ' + d.ticketIds.length + ' boletas') + '. Muestra cada QR en la entrada desde el celular o impreso.</p>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 22px;">' +
    fila_('Boleta', d.ticketIds.length + ' x ' + t.tipo) + fila_('Incluye', t.detalle + ' · ' + extras.join(' + ')) +
    fila_('Cuándo', FECHA_EVENTO) + fila_('Dónde', LUGAR_EVENTO) + fila_('Edad', '+18 · trae tu documento de identidad') +
    '</table>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;">' + bloques + '</table>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;margin:6px 0 18px;"><tr><td style="padding:14px 16px;background:#14111D;border:1px solid #241f33;' + F + 'font-size:13px;line-height:1.7;color:#A9A2B6;">' +
    '• Cada QR sirve para <strong style="color:#F3EBDD;">una sola entrada</strong>; no lo compartas.<br>' +
    '• Cada boleta también va <strong style="color:#F3EBDD;">adjunta como imagen</strong> para que la guardes en tu celular.<br>' +
    '• ¿Dudas? WhatsApp <strong style="color:#F3EBDD;">316 108 8178</strong> · Instagram <strong style="color:#F3EBDD;">@fantribute_col</strong></td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 0 6px;">' + logos + '</td></tr>' +
    '<tr><td style="text-align:center;padding:10px 0 0;' + F + 'font-size:10px;letter-spacing:2px;color:#6f6880;text-transform:uppercase;">Evento tributo +18 · Artistas no presentes</td></tr>' +
    '</table></div></body></html>';

  const texto = 'Hola ' + d.nombre + ', tus boletas para ' + EVENTO + ' (' + d.ticketIds.length + ' x ' + t.tipo + '): ' +
    d.ticketIds.join(', ') + '. ' + FECHA_EVENTO + ', ' + LUGAR_EVENTO + '. Los QR van adjuntos.';
  GmailApp.sendEmail(d.email, 'Tus boletas · ' + EVENTO + ' · ' + t.tipo, texto, {
    htmlBody: html, inlineImages: inline, attachments: adjuntos, name: 'Fan Tribute', replyTo: AVISO_EMAIL
  });
}

/**
 * Arma la boleta (igual a la tarjeta del correo) como diapositiva de Google
 * Slides y la exporta como PNG, para adjuntarla. Como en End of Summer y
 * Halloween: se crea una presentación temporal y se manda a la papelera.
 */
function boletaPng_(b) {
  const t = TIPOS[b.key];
  const color = COLOR_TIPO[b.key] || '#8B3DFF';
  const CREAM = '#F3EBDD', INK = '#17121F', DIM = '#5c546b', NOCHE = '#07060B';
  const pres = SlidesApp.create('tmp-boleta-' + b.id);
  const presId = pres.getId();
  try {
    const W = pres.getPageWidth(), H = pres.getPageHeight();   // 720 x 405 (horizontal)
    const slide = pres.getSlides()[0];
    slide.getPageElements().forEach(function (e) { try { e.remove(); } catch (x) {} });
    slide.getBackground().setSolidFill(NOCHE);

    function caja(x, y, w, h, fondo) {
      const r = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, x, y, w, h);
      r.getFill().setSolidFill(fondo); r.getBorder().setTransparent(); return r;
    }
    function texto(txt, x, y, w, h, size, colorTxt, opts) {
      opts = opts || {};
      const tb = slide.insertTextBox(txt, x, y, w, h);
      tb.getFill().setTransparent(); tb.getBorder().setTransparent();
      const st = tb.getText().getTextStyle();
      st.setFontFamily(opts.font || 'Roboto').setFontSize(size).setForegroundColor(colorTxt).setBold(!!opts.bold);
      tb.getText().getParagraphStyle().setParagraphAlignment(opts.align || SlidesApp.ParagraphAlignment.START);
      if (opts.esp) try { st.setLetterSpacing(opts.esp); } catch (x) {}
      return tb;
    }

    // Tarjeta clara con borde de color, como en el correo
    const M = 22;
    caja(M, M, W - M * 2, H - M * 2, CREAM);
    caja(M, M, 10, H - M * 2, color);

    // QR a la derecha
    const qs = H - M * 2 - 70, qx = W - M - qs - 30, qy = M + 26;
    caja(qx - 8, qy - 8, qs + 16, qs + 16, '#FFFFFF');
    slide.insertImage(b.qr, qx, qy, qs, qs);
    texto(b.id, qx - 30, qy + qs + 14, qs + 60, 24, 13, INK, { font: 'Roboto Mono', bold: true, align: SlidesApp.ParagraphAlignment.CENTER });

    // Columna izquierda
    const lx = M + 34, lw = qx - lx - 30;
    const logo = imgCorreo_('eos-logo.png');
    let y = M + 18;
    caja(M + 10, M, qx - 26 - (M + 10), 118, NOCHE);   // franja oscura con el logo
    if (logo) { slide.insertImage(logo.copyBlob(), lx - 4, y - 6, 100, 97); }
    texto('ENTRADA ' + b.entrada.toUpperCase(), lx + 108, y + 18, lw - 108, 18, 10, color, { bold: true });
    texto('SÁB 12 DIC · XERO CLUB', lx + 108, y + 40, lw - 108, 18, 9, '#A9A2B6', { bold: true });
    y += 112;
    texto(t.tipo.toUpperCase(), lx, y, lw, 52, 40, INK, { font: 'Bebas Neue' });
    y += 54;
    texto(b.nombre, lx, y, lw, 28, 17, INK, { bold: true });
    y += 30;
    const extras = '$' + formato_(t.consumo) + ' en consumo' + (t.shot ? ' + shot de bienvenida' : '');
    texto(t.detalle + ' · ' + extras, lx, y, lw, 34, 10.5, DIM);
    y += 40;
    texto('Xero Club · Cl. 25 #43G-29, Medellín · +18 · Presenta tu documento', lx, y, lw, 30, 9, DIM);

    // Logos abajo
    const ft = imgCorreo_('fantribute-logo.png'), xero = imgCorreo_('xero-logo.png');
    caja(M + 10, H - M - 48, qx - 26 - (M + 10), 48, NOCHE);   // franja oscura con los logos
    if (ft) slide.insertImage(ft.copyBlob(), lx, H - M - 38, 96, 28.8);
    if (xero) slide.insertImage(xero.copyBlob(), qx - 26 - 46, H - M - 42, 36, 36);

    pres.saveAndClose();
    const url = 'https://docs.google.com/presentation/d/' + presId + '/export/png?id=' + presId + '&pageid=' + slide.getObjectId();
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Slides devolvió ' + res.getResponseCode());
    return res.getBlob().setName('Boleta-' + b.id + '.png');
  } finally {
    try { DriveApp.getFileById(presId).setTrashed(true); } catch (x) {}
  }
}

/** Link a la página que arma la boleta completa (flyer + QR) para descargar. */
function linkBoleta_(id, key, nombre, entrada) {
  return SITIO + '/eventos-hub/eventos/boleta-medellin.html?c=' + encodeURIComponent(id) + '&t=' + key +
    '&n=' + encodeURIComponent(nombre || '') + '&e=' + encodeURIComponent(entrada);
}

/** Ejecutar desde el editor para ver el diseño: manda un correo de prueba a tu cuenta (no guarda nada). */
function enviarPrueba() {
  enviarQR_({ email: Session.getActiveUser().getEmail(), nombre: 'Prueba Fan Tribute', key: 'VIP', ticketIds: ['MDE-PFT-VIP-0000', 'MDE-PFT-VIP-0001'] });
}

function fila_(k, v) {
  return '<tr><td style="padding:9px 0;border-top:1px solid #241f33;font-family:Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:#8B3DFF;text-transform:uppercase;width:92px;vertical-align:top;">' + k +
    '</td><td style="padding:9px 0;border-top:1px solid #241f33;font-family:Roboto,Arial,sans-serif;font-size:14px;color:#F3EBDD;">' + esc_(v) + '</td></tr>';
}

// ---------------------------------------------------------------- escáner

function escanear_(b) {
  const error = pinInvalido_(b.pin);
  if (error) return error;
  const id = String(b.ticketId || '').trim().toUpperCase();
  if (!id) return { ok: false, status: 'sin_codigo' };
  const sh = hoja_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4]).toUpperCase() !== id) continue;
    const base = { ok: true, ticketId: id, tipo: data[i][2], numero: data[i][3], nombre: data[i][7] };
    if (String(data[i][11]).toUpperCase() === 'ANULADA') return Object.assign(base, { status: 'anulada' });
    if (data[i][13] === true) {
      return Object.assign(base, { status: 'ya_escaneado', fechaEscaneo: data[i][14] ? new Date(data[i][14]).toISOString() : '' });
    }
    sh.getRange(i + 1, 14, 1, 2).setValues([[true, new Date()]]);
    return Object.assign(base, { status: 'valido' });
  }
  return { ok: true, status: 'no_encontrado', ticketId: id };
}

// ---------------------------------------------------------------- utilidades

function pinInvalido_(pin) {
  const real = PropertiesService.getScriptProperties().getProperty('STAFF_PIN');
  if (!real) return { ok: false, status: 'pin_sin_configurar' };
  return String(pin || '') === real ? null : { ok: false, status: 'pin_invalido' };
}

function hoja_() {
  return hojaCon_(SHEET_NAME, HEADERS);
}
function hojaCheckouts_() {
  return hojaCon_(CHECKOUT_SHEET, CHECKOUT_HEADERS);
}
function hojaCon_(nombre, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sha256Hex_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) { const h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; })
    .join('');
}

function avisar_(asunto, texto) {
  try { GmailApp.sendEmail(AVISO_EMAIL, asunto, texto, { name: 'Boletería Medellín' }); } catch (err) { Logger.log('Aviso no enviado: ' + err); }
}

function limpiar_(v, max) { return String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function formato_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
