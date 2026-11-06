// ==== PROMO BACK TO CLASSIC 2000 (envio masivo, max 75 al dia) ====
// Archivo AUTONOMO: funciona solo, en cualquier proyecto de Apps Script
// (no necesita el Code.gs de Halloween). Mismo diseño de la promo de Halloween.
//
//   - enviarPromoBTCPrueba(): te manda el correo SOLO a ti. No marca nada.
//   - enviarPromoBTC(): manda la primera tanda (max 75) y deja programado
//     que siga sola cada dia a las 10 a.m. hasta terminar; luego se apaga.
//   - resetPromoBTCEnviados(): borra el registro para empezar de cero.
//
// A quien le llega (sin repetir): la hoja de Back to Halloween (todas sus
// pestañas con columna de correo, sin ANULADAS) y despues negocio_fantribute
// y la segunda fecha. Lo enviado se anota en la pestaña "Promo BTC enviados"
// de la hoja de Halloween.

var BTC_HOJA_ID = '13tybmgGnPrFhQyBYkdR5EMWU1sfraOAGhMHOoc6WFl0';
var BTC_OTRAS_LISTAS = [
  { id: '1f_3j-nwWql0V4xuMMcv1FopiyqgJKG77CCn0CJ1aBic', tab: 'boletas', nombre: 'negocio_fantribute' },
  { id: '1WS8CROlnlShOtEuRsEOddAsNis704aJCg6rnzCXhUUs', tab: 'Boletas', nombre: 'segunda fecha' }
];
var BTC_LOG_TAB = 'Promo BTC enviados';
var BTC_POR_DIA = 75;          // tope de esta campaña por dia
var BTC_RESERVA = 20;          // cupo de Gmail que siempre queda para QR y avisos
var BTC_FLYER_ID = '1-p1kaDu3vNYqnIePJgGPW2iTC1rFwvaZ';
var BTC_SUBJECT = '🪩 BACK TO CLASSIC 2000 · EDM ✕ Reggaetón · Sáb 28 nov en Algarete Zona T';
var BTC_URL = 'https://fantributecol.netlify.app/eventos-hub/eventos/back-to-classic-2000.html';
var BTC_WA = 'https://wa.me/573161088178?text=' + encodeURIComponent('¡Hola! Quiero mis boletas para BACK TO CLASSIC 2000 🪩');
var BTC_FUNCION = 'enviarPromoBTC';

function enviarPromoBTCPrueba() {
  var yo = Session.getEffectiveUser().getEmail();
  enviarCorreoBTC_(yo, flyerBTC_());
  Logger.log('Prueba enviada a ' + yo);
}

function enviarPromoBTC() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Ya hay un envio de la promo corriendo.'); return; }
  try {
    var log = hojaLogBTC_();
    var ya = {};
    log.getDataRange().getValues().slice(1).forEach(function (f) {
      if (f[2] === 'ENVIADO') ya[String(f[1]).toLowerCase()] = true;
    });
    var pendientes = destinatariosBTC_().filter(function (e) { return !ya[e.toLowerCase()]; });
    var cupo = Math.max(0, Math.min(BTC_POR_DIA, MailApp.getRemainingDailyQuota() - BTC_RESERVA));
    var flyer = pendientes.length && cupo ? flyerBTC_() : null;

    var enviados = 0;
    for (var i = 0; i < pendientes.length && enviados < cupo; i++) {
      try {
        enviarCorreoBTC_(pendientes[i], flyer);
        log.appendRow([new Date(), pendientes[i], 'ENVIADO']);
        enviados++;
      } catch (err) {
        log.appendRow([new Date(), pendientes[i], 'ERROR: ' + err.message]);
      }
    }
    var faltan = pendientes.length - enviados;
    Logger.log('--- Promo Back to Classic 2000: ' + enviados + ' enviados ahora, faltan ' + faltan +
               (cupo === 0 ? ' (sin cupo de Gmail hoy)' : '') + ' ---');
    programarBTC_(faltan > 0);
  } finally {
    lock.releaseLock();
  }
}

function resetPromoBTCEnviados() {
  var sh = SpreadsheetApp.openById(BTC_HOJA_ID).getSheetByName(BTC_LOG_TAB);
  if (sh) SpreadsheetApp.openById(BTC_HOJA_ID).deleteSheet(sh);
  Logger.log('Registro de enviados de la promo borrado.');
}

/* ---------- Listas ---------- */

function destinatariosBTC_() {
  var vistos = {}, lista = [];
  var agregar = function (email) {
    email = String(email || '').trim();
    var key = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || vistos[key]) return;
    vistos[key] = true;
    lista.push(email);
  };

  // 1) Hoja de Halloween: todas las pestañas que tengan columna de correo.
  SpreadsheetApp.openById(BTC_HOJA_ID).getSheets().forEach(function (sh) {
    if (sh.getName() === BTC_LOG_TAB) return;
    correosDeHoja_(sh).forEach(agregar);
  });
  // 2) Las otras listas de siempre (si no se pueden abrir, se saltan).
  BTC_OTRAS_LISTAS.forEach(function (l) {
    try {
      var ss = SpreadsheetApp.openById(l.id);
      var sh = ss.getSheetByName(l.tab) || ss.getSheets()[0];
      correosDeHoja_(sh).forEach(agregar);
    } catch (e) {
      Logger.log('No se pudo abrir ' + l.nombre + ': ' + e.message);
    }
  });

  Logger.log('Destinatarios Back to Classic 2000 (sin repetir): ' + lista.length);
  return lista;
}

// Busca la fila de encabezados (primeras 15 filas) con una columna de
// correo y devuelve los correos, saltando filas con estado ANULADA.
function correosDeHoja_(sh) {
  var datos = sh.getDataRange().getValues();
  var norm = function (v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); };
  var fila = -1, cEmail = -1, cEstado = -1;
  for (var r = 0; r < Math.min(15, datos.length) && fila < 0; r++) {
    for (var c = 0; c < datos[r].length; c++) {
      if (/correo|e-?mail/.test(norm(datos[r][c]))) { fila = r; cEmail = c; break; }
    }
  }
  if (fila < 0) return [];
  datos[fila].forEach(function (h, c) { if (norm(h) === 'estado') cEstado = c; });
  return datos.slice(fila + 1).filter(function (f) {
    return !(cEstado >= 0 && /anulad/i.test(String(f[cEstado])));
  }).map(function (f) { return f[cEmail]; });
}

function hojaLogBTC_() {
  var ss = SpreadsheetApp.openById(BTC_HOJA_ID);
  var sh = ss.getSheetByName(BTC_LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(BTC_LOG_TAB);
    sh.appendRow(['Fecha', 'Email', 'Resultado']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function programarBTC_(hayMas) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === BTC_FUNCION) ScriptApp.deleteTrigger(t);
  });
  if (hayMas) {
    ScriptApp.newTrigger(BTC_FUNCION).timeBased().everyDays(1).atHour(10).inTimezone('America/Bogota').create();
    Logger.log('Mañana a las 10 a.m. sale la siguiente tanda.');
  } else {
    Logger.log('Promo terminada: ya le llego a todos.');
  }
}

/* ---------- Correo ---------- */

function flyerBTC_() {
  var blob;
  try {
    blob = DriveApp.getFileById(BTC_FLYER_ID).getBlob();
  } catch (e) {
    blob = UrlFetchApp.fetch('https://drive.google.com/uc?export=download&id=' + BTC_FLYER_ID).getBlob();
  }
  return blob.setName('back-to-classic-2000.' + (/png/.test(blob.getContentType()) ? 'png' : 'jpg'));
}

function enviarCorreoBTC_(email, flyer) {
  MailApp.sendEmail({
    to: email,
    subject: BTC_SUBJECT,
    name: 'Fan Tribute',
    body: textoPromoBTC_(),
    htmlBody: buildPromoBTCHtml_(),
    inlineImages: { flyer: flyer },
    attachments: [flyer]
  });
}

function textoPromoBTC_() {
  return '🪩 BACK TO CLASSIC 2000 🪩\n\n' +
    'EDM ✕ REGGAETÓN — el crossover que nadie se había atrevido a hacer 🔥\n\n' +
    'Una sola noche para revivir los himnos que marcaron una generación: del eurodance y el house de Gigi D\'Agostino, Darude, Benny Benassi, Bob Sinclar, Eric Prydz, Tiësto y David Guetta… al perreo de la vieja escuela con Tego Calderón, Ivy Queen, Daddy Yankee, Don Omar, Héctor "El Father", Wisin & Yandel y Luny Tunes 💿\n\n' +
    'Y para cerrar, los clásicos de los 2010s: Avicii, Swedish House Mafia, Calvin Harris, DJ Snake, Martin Garrix, Tito "El Bambino", Zion & Lennox, Arcángel, Plan B, Nicky Jam… y muchos más 🎧\n\n' +
    'De 128 BPM a 95 BPM. Del drop al dembow. Toda la noche 🙌\n\n' +
    '📅 Sábado 28 de noviembre\n🕗 8:00 PM — 5:00 AM\n📍 Algarete · Zona T, Bogotá\n🎟️ Boleta general: $35.000 con $15.000 de consumo 🧡\n\n' +
    '📲 Boletas al 316 108 8178 y por DM: ' + BTC_WA + '\n\n' +
    'Evento tributo +18 — Artistas no presentes';
}

function buildPromoBTCHtml_() {
  var bg = '#0A0B16', cyan = '#3FD6F5', pink = '#FF4FA3', yellow = '#FFC93C',
      line = 'rgba(63,214,245,0.35)', cream = '#F3F1FA', dim = '#B3AEC8';
  var p = 'font-size:14px; line-height:1.7; color:' + cream + '; margin:0 0 14px; text-align:left;';
  var dato = function (ic, t) {
    return '<tr><td style="padding:5px 10px 5px 0; font-size:16px; vertical-align:top;">' + ic + '</td>' +
           '<td style="padding:5px 0; font-size:14px; color:' + cream + '; text-align:left;">' + t + '</td></tr>';
  };

  return '' +
  '<div style="background-color:' + bg + '; padding:0 0 32px;">' +
    '<div style="height:6px; background-color:' + cyan + '; background:linear-gradient(90deg,' + cyan + ',' + pink + ',' + yellow + ');"></div>' +
    '<div style="max-width:480px; margin:0 auto; padding:40px 24px 8px; text-align:center; font-family:Arial,Helvetica,sans-serif;">' +

      '<p style="font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:' + cyan + '; font-weight:700; margin:0 0 6px;">Fan Tribute presenta</p>' +
      '<h1 style="font-size:30px; font-weight:800; color:' + cream + '; margin:0 0 6px; font-family:Georgia,\'Times New Roman\',serif;">🪩 Back to Classic 2000 🪩</h1>' +
      '<p style="font-size:13px; color:' + dim + '; margin:0 0 26px;">S&aacute;bado 28 de noviembre &middot; Algarete Zona T, Bogot&aacute;</p>' +

      '<img src="cid:flyer" width="432" style="display:block; width:100%; max-width:432px; border-radius:16px; margin:0 auto 24px;" alt="Flyer Back to Classic 2000">' +

      '<p style="' + p + '"><strong style="color:' + yellow + ';">EDM ✕ REGGAET&Oacute;N</strong> &mdash; el crossover que nadie se hab&iacute;a atrevido a hacer 🔥</p>' +
      '<p style="' + p + '">Una sola noche para revivir los himnos que marcaron una generaci&oacute;n: del eurodance y el house de <strong>Gigi D\'Agostino, Darude, Benny Benassi, Bob Sinclar, Eric Prydz, Ti&euml;sto y David Guetta</strong>&hellip; al perreo de la vieja escuela con <strong>Tego Calder&oacute;n, Ivy Queen, Daddy Yankee, Don Omar, H&eacute;ctor &quot;El Father&quot;, Wisin &amp; Yandel y Luny Tunes</strong> 💿</p>' +
      '<p style="' + p + '">Y para cerrar, los cl&aacute;sicos de los 2010s: <strong>Avicii, Swedish House Mafia, Calvin Harris, DJ Snake, Martin Garrix, Tito &quot;El Bambino&quot;, Zion &amp; Lennox, Arc&aacute;ngel, Plan B, Nicky Jam</strong>&hellip; y muchos m&aacute;s 🎧</p>' +
      '<p style="' + p + 'color:' + pink + '; font-weight:700;">De 128 BPM a 95 BPM. Del drop al dembow. Toda la noche 🙌</p>' +

      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 24px; border-top:1px solid ' + line + '; border-bottom:1px solid ' + line + '; width:100%;">' +
        dato('📅', 'S&aacute;bado 28 de noviembre') +
        dato('🕗', '8:00 PM &mdash; 5:00 AM') +
        dato('📍', 'Algarete &middot; Zona T, Bogot&aacute;') +
        dato('🎟️', 'Boleta general: <strong>$35.000</strong> con $15.000 de consumo 🧡') +
      '</table>' +

      '<a href="' + BTC_WA + '" style="display:block; padding:16px 20px; border-radius:100px; background-color:#25D366; color:#04150C; font-weight:800; font-size:15px; letter-spacing:0.03em; text-transform:uppercase; text-decoration:none; margin:0 0 10px;">📲 Quiero mi boleta por WhatsApp</a>' +
      '<p style="font-size:12px; color:' + dim + '; margin:0 0 22px;">O escr&iacute;benos al <strong style="color:' + cream + ';">316 108 8178</strong> y por DM en Instagram</p>' +

      '<p style="margin:0 0 28px;"><a href="' + BTC_URL + '" style="color:' + cyan + '; font-size:13px; font-weight:700; text-decoration:underline;">Ver todos los detalles del evento</a></p>' +

      '<div style="height:1px; background-color:' + line + '; margin:8px 0 20px;"></div>' +
      '<p style="font-size:11px; color:' + dim + '; margin:0 0 4px;">Evento tributo +18 &middot; artistas no presentes.</p>' +
      '<p style="font-size:11px; color:' + dim + '; margin:0;">Dudas por Instagram <strong style="color:' + cream + ';">@fantribute_col</strong>.</p>' +
    '</div>' +
  '</div>';
}
