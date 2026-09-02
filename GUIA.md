# Guia de comandos Basilico POS

## Prompt Audit

Copia este prompt completo al iniciar una auditoria con otro agente de IA:

```text
Actua como un programador senior full stack, auditor de sistemas POS y especialista en React, TypeScript, Node.js, Express y PostgreSQL. Trabajas sobre Basilico POS, un sistema de pizzeria con frontend web/React, app movil Expo/React Native, backend Express y base de datos PostgreSQL local. Tu prioridad es preservar la integridad de comandas, pagos, vueltos, caja, tasas y datos historicos.

Reglas obligatorias:
1. No asumas. Lee el codigo y sigue el flujo real de datos antes de editar.
2. No borres, reviertas ni formatees cambios locales existentes que no hayas creado. Primero ejecuta `git status --short` y trata el arbol de trabajo como potencialmente modificado por otro desarrollador.
3. Nunca uses comandos destructivos como `git reset --hard`, `git checkout --`, limpieza de base de datos o borrado masivo sin autorizacion explicita del usuario.
4. Mantiene los cambios pequenos, aislados y compatibles con el estilo existente. Si agregas logica reutilizable, ubicala en helpers, componentes o rutas especializadas; no sobrecargues componentes o archivos principales.
5. No marques una comanda como pagada, entregada, cancelada o reactivada sin validar las reglas del negocio y el estado persistido en PostgreSQL.
6. No ocultes errores de API con actualizaciones locales optimistas que cambien pagos, saldos o estados financieros. Propaga el error y conserva la fuente de verdad del servidor.
7. Cada edicion debe tener una validacion inmediata y enfocada. Al finalizar, ejecuta validacion de tipos, sintaxis backend y build web.
8. El sistema debe mantenerse siempre en tiempo real: PostgreSQL es la fuente de verdad, el backend confirma toda escritura y Socket.IO sincroniza web, APK y caja. No crees comandas, pagos, estados, tasas, catalogos, mesas o movimientos de caja solo en estado local cuando falle la red.
9. Al conectar o reconectar un cliente, verifica que reciba la instantanea Socket.IO y los eventos posteriores de comandas, productos, ingredientes, mesas, tasas y caja. Muestra un error visible si se pierde la conexion; no presentes un cambio como guardado hasta que el servidor responda correctamente.
10. Antes de hacer una modificacion que el usuario no haya explicado claramente, que amplie el alcance, cambie reglas de negocio, borre codigo, afecte datos, API, esquema, permisos o interfaz, detente y pregunta primero. No inventes requisitos ni tomes decisiones de producto sin autorizacion.
11. No elimines codigo antiguo hasta comprobar sus consumidores y confirmar que su retiro corresponde a una solicitud del usuario. Si una correccion requiere migracion, datos de prueba, limpieza o una accion irreversible, solicita autorizacion expresa.

Contexto del repositorio:
- Frontend web: `src/`, principalmente `src/pages/CajaPage.tsx`, `src/context/AppContext.tsx`, `src/components/` y `src/data/mockData.ts`.
- App movil: `src/App.native.tsx` y `src/native/`.
- Backend: `server/index.js`, `server/db.js`, `server/routes/`, `server/helpers/` y `server/schema.sql`.
- La base de datos usada en esta PC es PostgreSQL local, normalmente `sdmaia`. El backend aplica migraciones idempotentes al iniciar desde `server/db.js` mediante `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Las tasas vienen de `exchange_rates`; COP y Bs se convierten desde USD usando la tasa vigente o la tasa guardada por movimiento.
- El build web se sirve desde el backend por el puerto 3001. Desarrollo web normalmente usa el puerto 3000.

Orden obligatorio de auditoria:
1. Estado y configuracion: revisa `package.json`, `server/package.json`, `git status --short`, configuracion LAN y scripts disponibles. Identifica como levantar frontend, backend y build.
2. Modelos y persistencia: revisa `src/data/mockData.ts`, `server/schema.sql`, `server/db.js` y los mapeos de `server/helpers/fetchAll.js`. Confirma tablas, columnas, tipos, conversiones y migraciones antes de tocar rutas.
3. Backend: empieza en `server/index.js`, sigue las rutas registradas y luego revisa la ruta propietaria del comportamiento. Para cobros revisa `server/routes/payments.js`, `server/helpers/paymentLedger.js`, `server/routes/orders.js`, `server/routes/caja.js` y sus transacciones PostgreSQL.
4. Frontend: sigue desde el boton o pantalla afectada hasta `AppContext`. Para caja/cobros revisa `CajaPage.tsx`, `PaymentLedgerModal.tsx`, `OrderDetailModal.tsx` y las acciones HTTP de `AppContext.tsx`.
5. UI movil y otros consumidores: verifica que los contratos de tipos y API no rompan `App.native.tsx`, `src/native/` ni las pantallas de mesero, cocina, historico y reportes.
6. Base de datos instalada: si necesitas confirmar el esquema real, inicia el backend o usa una consulta de solo lectura. No modifiques datos productivos para probar. Reporta claramente cualquier aviso de migracion, puerto ocupado o discrepancia entre esquema y base instalada.

Reglas de negocio criticas de cobro:
- La modal de cobro debe mostrar tres tarjetas: monto total de la comanda, total pagado y vuelto pendiente. Cada una debe mostrar USD, COP y Bs con la tasa correspondiente.
- Un registro es de tipo `payment` o `change` (vuelto); no son el mismo movimiento. Un pago acredita como maximo la deuda de la venta, pero conserva el dinero realmente recibido. El vuelto debe quedar registrado por separado.
- Metodos validos: USD = Efectivo USD, Binance, Zelle. COP = Efectivo COP, Bancolombia, Nequi. Bs = Pago Movil, Tarjeta de Debito, Tarjeta de Credito. El cliente no puede elegir un metodo de otra moneda.
- No se puede cerrar una comanda si existe deuda pendiente o vuelto pendiente. Cerrar la modal debe conservar los registros ya guardados. El cierre final no debe crear un pago ficticio de monto cero.
- Los pagos divididos deben usar las mismas validaciones. No pueden marcar items como pagados si el pago no cubre los items seleccionados.
- Anular un registro debe actualizar pago acumulado, estado de pago, movimientos de caja asociados y marcas de items pagados individualmente.
- Reactivar una comanda entregada debe devolverla al flujo activo para editarla sin borrar su historial de pagos. Cambiar estados no debe destruir datos financieros.

Reglas de interfaz:
- Conserva el lenguaje visual existente. En fondos claros usa texto negro o verde oscuro; nunca texto blanco o gris claro sobre blanco.
- Usa controles claros, estados deshabilitados cuando aplique, mensajes de error visibles y tablas legibles para el historial de movimientos.
- Evita duplicar modales o flujos de cobro. Si existe codigo antiguo inutilizado, retiralo solo despues de comprobar que no tenga consumidores.
- Nunca uses texto, iconos, bordes o indicadores del mismo color, transparencia o luminosidad que su fondo. Revisa estados normal, hover, activo, deshabilitado, error, exito, lista, pagado y responsive en web y APK.
- Ningun texto, boton, modal, tooltip, tarjeta, tabla o indicador puede taparse, quedar debajo de otra modal ni superponerse de forma ilegible. Define capas `z-index` coherentes, dimensiones estables y prueba vistas movil y escritorio.
- Cuando una accion dependa de la conexion en tiempo real, comunica claramente si esta sincronizada, reconectando o fallida. No cierres formularios ni borres carritos ante un error de red; conserva los datos para reintentar.

Validacion minima antes de finalizar:
```powershell
npx tsc --noEmit --pretty false
node --check server/routes/payments.js
node --check server/routes/orders.js
npm run build
```

Para cambios de cobro, valida tambien manualmente este escenario sin modificar datos reales: pago parcial, pago exacto, pago con excedente, registro de vuelto, intento de cierre con vuelto pendiente, anulacion de pago/vuelto, pago dividido por items y reactivacion desde historico.

Para cambios de sincronizacion, valida sin modificar datos reales: conexion Socket.IO desde web y APK, recepcion de instantanea inicial, propagacion de eventos hacia otro cliente, desconexion visible, reconexion automatica y recuperacion del estado desde PostgreSQL.

Entrega final esperada:
- Explica el problema y su causa raiz.
- Lista los archivos modificados y el impacto de cada uno.
- Indica las migraciones aplicadas o pendientes y si se tocaron datos existentes.
- Muestra los comandos de validacion ejecutados y sus resultados.
- Menciona riesgos, advertencias preexistentes o validaciones manuales pendientes.
```

Ejecuta los comandos desde la carpeta raiz del proyecto `basilico` en PowerShell.

## Generar ejecutable y acceso directo de PC

Cada vez que cambies el sistema y quieras actualizar los archivos para la PC, ejecuta:

```powershell
npm run build:export
```

El comando compila la version web de produccion y genera o actualiza en `export/`:

- `BasilicoPOS.vbs`: inicio silencioso del POS.
- `BasilicoPOS_Con_Consola.bat`: inicio del POS con consola del servidor.
- `Basilico Pizzeria.lnk`: acceso directo de Windows.
- `pizza_icon.ico`: icono del acceso directo.

Tambien puedes hacer doble clic en `Actualizar_Accesos_Directos.bat`. Ese archivo ejecuta solo el generador de exportacion; para incluir cambios nuevos de la interfaz usa primero `npm run build` o, preferiblemente, `npm run build:export`.

## Abrir el sistema en desarrollo

En una consola:

```powershell
cd server
npm run start
```

En otra consola:

```powershell
npm run start
```

El POS de caja queda en `http://localhost:3000/caja` durante desarrollo. La version exportada abre `http://localhost:3001` porque el backend sirve la carpeta `build/`.

## Inicio confiable desde el acceso directo

El acceso directo `Basilico Pizzeria.lnk` abre el POS por la IP LAN actual del backend, por ejemplo `http://192.168.1.5:3001`. La interfaz y Socket.IO se conectan siempre por esa dirección LAN, incluso cuando se abre el POS desde la PC servidor.

Al abrir el acceso directo, Basilico inicia el backend si hace falta y consulta su dirección LAN vigente antes de abrir el navegador. No debes ejecutar `ipconfig`, copiar IP ni editar archivos: `npm run build:export` y el acceso directo detectan automáticamente la IP privada de la interfaz Wi-Fi/Ethernet activa.

Si el router cambia la IP mientras el sistema está apagado, el acceso directo vuelve a consultar la IP al iniciar. Para que tablets, celulares u otras PCs puedan conservar una dirección fija, crea una reserva DHCP para la PC servidor en el router usando la dirección MAC de su adaptador Wi-Fi.

## Generar APK Android

```powershell
npm run build:apk
```

El resultado se copia a `export/BasilicoPizzeria.apk` cuando la compilacion Android finaliza correctamente.

## Verificar antes de exportar

```powershell
npx tsc --noEmit --pretty false
npm run build
node --check server/routes/payments.js
```

## Impresora térmica LAN FREMORT FRM-8330 (80 mm)

La FRM-8330 usa papel térmico de 80 mm y se integra por LAN con comandos ESC/POS. Las comandas no se convierten a PDF: se imprimen como tickets ESC/POS de 80 mm, con corte automático, para que el texto llegue completo y legible. Esto es más fiable que enviar un PDF a una térmica de este tipo.

Al crear una comanda que requiere cocina, Basilico la guarda primero en PostgreSQL. Solo después intenta imprimirla. Un fallo de impresora nunca borra ni modifica la comanda; el POS muestra una alerta visible para reintentar tras corregir la conexión.

### Configuración manual inicial

1. Conecta la impresora y la PC servidor a la misma red Wi-Fi o LAN. No uses una red de invitados.
2. Enciende la impresora, coloca el rollo térmico de 80 mm y verifica que haga su autoprueba manteniendo presionado `FEED` mientras la enciendes. Anota la dirección IP que aparezca en el ticket de autoprueba.
3. En Windows, instala el controlador que suministró FREMORT para la FRM-8330. En `Configuración > Bluetooth y dispositivos > Impresoras y escáneres`, agrega la impresora por dirección TCP/IP si el controlador lo solicita.
4. En las propiedades de impresión de Windows, configura papel de `80 mm`, orientación vertical, escala `100 %` o `Tamaño real` y activa el corte automático si el controlador lo ofrece. Imprime una página de prueba de Windows.
5. Abre [server/config/thermal-printer.json](server/config/thermal-printer.json) y completa la IP obtenida en la autoprueba. Conserva el puerto `9100` salvo que el ticket de autoprueba o el manual indique otro:

```json
{
	"enabled": true,
	"host": "192.168.1.200",
	"port": 9100,
	"timeoutMs": 5000,
	"copies": 1
}
```

6. Guarda el archivo, reinicia el backend desde `server/` con `npm run start` y ejecuta desde la raíz del proyecto:

```powershell
npm run print:test
```

7. El comando imprime un ticket de prueba sin crear ni cambiar datos de la base. Confirma que el ancho, el corte y el texto se leen correctamente antes de activar el uso operativo.
8. Envía una comanda real de prueba. El ticket incluye número, fecha/hora, tipo de servicio, mesa/cliente, mesero, cada ítem, cantidad, tamaño, mitad y mitad, ingredientes retirados, extras, preferencias, para llevar, notas individuales, nota general, número de ítems y total.

### Reportes en la misma impresora

Todos los botones de reportes de Caja envían de inmediato una versión ESC/POS de 80 mm a la FRM-8330 configurada en [server/config/thermal-printer.json](server/config/thermal-printer.json). El reporte incluye cobros y egresos en USD, COP y Bs con sus métodos de pago. Al mismo tiempo se abre una vista optimizada para rollo de 80 mm; desde su diálogo puedes seleccionar `Microsoft Print to PDF` si necesitas una copia PDF.

Si la térmica está apagada, fuera de red o deshabilitada, el POS muestra el error y no genera una impresión falsa. Verifica primero la conexión con `npm run print:test`.

## Base de datos y migraciones

Las migraciones son automaticas: al iniciar el backend, `server/db.js` ejecuta los `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` necesarios. No ejecutes el esquema manualmente para una actualizacion normal.

En esta PC se inicio el backend el 11 de agosto de 2026 y se conecto a PostgreSQL en la base local `sdmaia`; las migraciones se ejecutaron. Esto incluye las columnas de bolivares del libro de pagos: `cash_tendered_bs` y `change_given_bs` en `order_payments`.

El puerto `3001` estaba ocupado por una instancia previa. Para que esa instancia use el codigo nuevo, detenla y vuelve a iniciar el backend desde `server/` con `npm run start`.

## Limpiar pedidos de prueba

Atencion: elimina comandas y movimientos. No lo uses para una limpieza operativa sin respaldo.

```powershell
node scripts/clean-database.js
```

## Separación e Independencia Total de Turnos (Mañana y Noche)

El sistema opera con dos entornos 100% aislados e independientes:
1. **Turnos**: `manana` y `noche` (con usuario Dueño para visualización global `ambos`).
2. **Comandas y Correlativos**: Cada turno cuenta con su propia numeración correlativa (`#1`, `#2`, `#3`...).
3. **Catálogo de Menú**: Los productos, bebidas e ingredientes están aislados por turno en base de datos (`products.shift` e `ingredients.shift`).
4. **Mesas**: El estado de ocupación (`ocupada` vs `libre`) se calcula dinámicamente según las comandas activas del turno en curso.
5. **Caja Chica y Arqueos**: Las aperturas de caja, ingresos, egresos y cierres contables se gestionan de forma exclusiva para el turno logueado.
6. **Realtime WebSockets**: Los eventos Socket.IO se canalizan mediante salas dedicadas (`shift:manana`, `shift:noche`, `shift:ambos`).

## Cuentas a Crédito y Gestión de Deudas por Cobrar

1. **Cerrar a Crédito**: Desde el modal de cobro unificado (`PaymentLedgerModal`) o la vista de Caja POS, cualquier comanda puede ser cerrada bajo la modalidad de **Crédito / Cuenta por Cobrar**.
2. **Nombre de Deudor Obligatorio**: Al pulsar "📝 Cerrar a Crédito", el sistema exige de forma estricta ingresar el nombre del cliente o deudor responsable de la cuenta (no se admiten nombres vacíos ni genéricos). Opcionalmente se puede adjuntar una nota o referencia.
3. **Aislamiento Contable de Caja Chica**: Las comandas a crédito **NO** generan registros de ingresos ni egresos en `caja_chica_transactions` ni suman dinero físico en la gaveta.
4. **Desglose de Créditos en Reportes y PDF**: En los reportes contables del intervalo y exportaciones de Excel, las cuentas a crédito se reflejan en su propia sección detallada: **"DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR"**, mostrando Comanda #, Fecha/Hora, Deudor, Ítems solicitados y Monto total adeudado en USD (con sus equivalencias informativas en COP y Bs).
5. **Exclusión en Pago por Personas**: La opción de "Cerrar a Crédito" aplica exclusivamente al cierre de la comanda completa; en la modalidad de "Pago por Personas" (cobro dividido por comensal o ítem) el botón de crédito queda automáticamente deshabilitado para preservar la integridad de cobros individuales.

## Formato de Reportes y Apertura sin Impresión Forzada

1. **Tablas con Moneda y Monto**: Todas las tablas de desglose (Totales por Moneda, Desglose por Método de Pago, Historial por Método, Ingresos y Vueltos) presentan una estructura limpia de **Moneda | Monto Recibido**, eliminando las 3 columnas en paralelo para mayor legibilidad y claridad contable.
2. **Apertura de Reportes Bajo Demanda**: Al consultar los reportes en pantalla, el sistema abre la vista previa en el navegador sin disparar órdenes directas a la impresora térmica. La impresión o guardado en PDF se realiza únicamente cuando el usuario presiona el botón "🖨️ IMPRIMIR / PDF".
3. **Exportación a Excel**: Incluye una hoja dedicada para **Créditos** con los detalles del cliente, comanda e ítems facturados a crédito.

## Toma de Pedidos Habilitada para Rol Caja

El usuario con rol `caja` dispone de permisos completos de mesonero:
- Puede crear pedidos nuevos directamente desde `/mesonero` o mediante el botón de acceso rápido en la cabecera de comanda de Caja POS.
- Dispone del selector rápido en la barra lateral para alternar cómodamente entre `💳 Caja POS` y `🍽️ Mesero`.

## Impresión de Comandas de Cocina y Pre-Cuenta con Tipografía Ampliada (+30%)

1. **Filtro de Ítems de Cocina**: Al enviarse la orden a la impresora térmica de cocina o KDS, el sistema filtra y procesa **únicamente** los ítems que requieren preparación:
   - **Pizzas**: Con tamaños (Grande / Pequeña), detalle de mitades (1ra y 2da mitad), ingredientes retirados (`SIN`), extras agregados (`EXTRA`) y notas de personalización.
   - **Jugos y Bebidas Preparadas**: Con su nivel de endulzante (`AZÚCAR: Sin azúcar / Con azúcar / Poca azúcar`) e indicación de para llevar (`*** PARA LLEVAR ***`).
2. **Exclusión de Ítems Comerciales**: Refrescos enlatados, aguas embotelladas, licores comerciales o adicionales empaquetados que no se preparan en cocina quedan excluidos de la comanda térmica de cocina. Si una orden consta exclusivamente de bebidas comerciales, el sistema no emite ticket en la estación de cocina.
3. **Tipografía Térmica Ampliada (+30%)**: Tanto las comandas de cocina como las pre-cuentas de consumo emplean escalado ESC/POS con mayor presencia horizontal y doble altura en encabezados e ítems para lectura rápida a distancia en cocina y salón.
4. **Ticket de Pre-Cuenta y Consumo desde Caja**: Botón instantáneo `🧾 IMPRIMIR PRE-CUENTA` en cada tarjeta de comanda activa que genera el ticket de consumo con todos los ítems y totales desglosados en **USD ($)**, **COP (Pesos)** y **Bs (Bolívares)** al tipo de cambio del turno.

## Sistema de Autorización con PIN de Seguridad (4 Dígitos)

El sistema protege las operaciones críticas y administrativas permitiendo al rol `caja` operar con total autonomía en sus funciones directas y exigiendo autorización mediante un PIN de 4 dígitos (por defecto `1234`, configurable por el Administrador):

1. **Operaciones Directas SIN Clave**:
   - 💱 **Editar tasas de cambio**: Actualización inmediata de tasas COP y Bs.
   - 🍽️ **Crear comandas y tomar pedidos (Mesero)**: Envío de pedidos a cocina.
   - 💳 **Cobranza de comandas**: Cobro unificado (Ledger), abonos y cierre a crédito.
   - 👥 **Pagar por personas**: Cobro dividido por comensal o ítem.
   - 📦 **Entregar comandas**: Despacho de comandas preparadas.
   - 🔥 **Marcar comanda como lista**: Control del flujo de preparación.
   - 🧾 **Imprimir ticket / pre-cuenta**: Emisión de comprobante al cliente.
   - 💰 **Caja Chica**: Registro de vueltos o egresos manuales en efectivo.

2. **Operaciones Administrativas CON Clave PIN**:
   - ✏️ **Editar Comanda**: Modificación de ítems o notas de comanda abierta.
   - 🗑️ **Anular / Borrar Comanda**: Eliminación total y liberación del correlativo.
   - 🔗 **Unificar Comandas**: Fusión de múltiples comandas en una máster.
   - 📂 **Pestaña HISTORIAL**: Consulta de comandas cobradas en días o turnos anteriores.
   - 📊 **Pestaña REPORTES & CIERRE**: Consulta de reportes contables e intervalos y realización de arqueos/cierres.
   - ⚙️ **Caja Chica - Apertura**: Modificación del fondo inicial de apertura.
   - 🔄 **Reactivar Comanda**: Reapertura de comandas finalizadas desde el historial.
   - 📋 **Menú Admin (`/menu-admin`)**: Administración del catálogo de pizzas, bebidas, ingredientes, mesas o PIN de seguridad.

3. **Configuración del PIN**: En el panel de administración (`/menu-admin` -> pestaña `🔐 PIN DE SEGURIDAD`), el Administrador puede visualizar el PIN activo y cambiarlo en cualquier momento.

## Jerarquía Visual, Tipografía y Código de Colores de Monedas

1. **Diferenciación Clara entre Pago y Vuelto**:
   - **Pago del Cliente (Ingreso)**: Botón y tarjeta en Verde Esmeralda de alto impacto (`🟢 REGISTRANDO: PAGO DEL CLIENTE / INGRESO A CAJA`).
   - **Vuelto al Cliente (Egreso)**: Botón y tarjeta en Ámbar / Naranja vibrante (`🟠 REGISTRANDO: VUELTO AL CLIENTE / EGRESO DE CAJA`).
2. **Visualización de Monedas en Grande**:
   - **💵 USD**: Verde Esmeralda (`text-emerald-400 / text-emerald-800`).
   - **🇨🇴 COP**: Azul Cielo (`text-sky-300 / text-sky-800`).
   - **🇻🇪 Bs**: Ámbar Dorado (`text-amber-300 / text-amber-800`).
   Todas las monedas se muestran con tipografía amplia y tarjetas con alto contraste para una percepción visual instantánea sin fatiga.

## Arqueo, Cierre de Turno y Purga Automática con Preservación de Créditos

1. **Seguridad en el Cierre**: El rol `caja` requiere autorización mediante PIN de 4 dígitos para realizar el arqueo y cierre del turno; el rol `admin` accede de forma directa.
2. **Impresión Térmica Automática**: Al confirmar el arqueo de efectivo (contado físico USD y COP), el sistema emite de manera automática el ticket térmico de cierre detallando la apertura, los totales desglosados por método de pago, el resumen de créditos y el cuadre de caja chica (esperado vs contado vs diferencia).
3. **Purga Automática Limpia**: Se eliminan de la base de datos las comandas finalizadas/cobradas al 100% (`payment_status = 'pagado'`), sus pagos e ítems, así como las transacciones y aperturas del turno cerrado, garantizando un inicio de ciclo limpio y sin necesidad de ejecutar scripts SQL manuales.
4. **Preservación de Cuentas a Crédito**: Las comandas con deuda pendiente (`payment_status = 'credito'`) **NO** se borran del sistema; se conservan y se renumeran consecutivamente a las primeras posiciones (`#1`, `#2`, etc.) para mantener el histórico de cobro pendiente hasta que sean reactivadas y saldadas.
5. **Continuidad Correlativa**: Los nuevos pedidos creados en el siguiente ciclo inician su numeración correlativa a continuación de los créditos preservados (o en `#1` si no existen créditos pendientes).
6. **Integridad de Catálogos**: La purga del turno no altera bajo ninguna circunstancia los catálogos de menú (`products`), ingredientes (`ingredients`), mesas (`tables_config`), usuarios (`users`), tasas de cambio ni configuración del PIN.
7. **Comprobación en Vivo del Arqueo**: En el modal de arqueo, al ingresar el conteo físico en USD y COP, el sistema valida en tiempo real si el efectivo cuadra exacto o si presenta sobrante/faltante con badges visuales de alto contraste antes de confirmar el cierre definitivo.

## Validación Obligatoria de Delivery y PickUp
1. **Órdenes Delivery**:
   - Es **OBLIGATORIO** especificar el **Nombre del Cliente** (o contacto) y seleccionar/ingresar el **Monto del Delivery ($ USD > 0)**.
   - Si falta alguno de los dos, el sistema bloquea el envío de la comanda con avisos visuales claros en rojo (`⚠️ Ingrese Nombre y Monto de Delivery`).
   - El monto del delivery se computa como ítem explícito (`🛵 SERVICIO DELIVERY`) en el total de la comanda, en el KDS de cocina, en Caja y en los tickets térmicos.
2. **Órdenes PickUp / Para Llevar**:
   - Es **OBLIGATORIO** especificar el **Nombre o Referencia del Cliente**.
   - El sistema bloquea el envío si el campo se encuentra vacío (`⚠️ Ingrese Nombre del Cliente`).

## Reubicación y Cambio de Mesa en Tiempo Real
1. En comandas de salón (`type === 'mesa'`) activas, tanto en Mesero como en Caja se dispone del botón `🔄 Cambiar Mesa`.
2. Al presionarlo se despliega la modal interactiva `ChangeTableModal` mostrando el catálogo de mesas disponibles en verde (`Libre`), mientras que las ocupadas por otras comandas se muestran en rojo/deshabilitadas.
3. Al confirmar el traslado, el endpoint `PATCH /api/orders/:id/change-table` ejecuta una transacción en PostgreSQL que:
   - Reasigna el `table_number` de la comanda a la nueva mesa.
   - Marca la nueva mesa como `ocupada`.
   - Verifica si la mesa anterior quedó sin pedidos activos y la libera automáticamente (`libre`).
   - Emite los eventos `orders:sync` y `tables:sync` por Socket.IO en tiempo real a todos los dispositivos conectados.

## Sidebar Colapsable a Modo Solo Iconos y Tarjetas Compactas
1. **Modo Colapsable en Sidebar (`Sidebar.tsx`)**:
   - Botón toggle `[ ⏪ / ⏩ ]` en la cabecera superior del menú lateral.
   - Alterna entre el modo extendido (`w-72`) y el modo compacto de solo iconos (`w-20`), permitiendo maximizar el espacio útil de la pantalla para comandas y mesas.
En otra consola:

```powershell
npm run start
```

El POS de caja queda en `http://localhost:3000/caja` durante desarrollo. La version exportada abre `http://localhost:3001` porque el backend sirve la carpeta `build/`.

## Inicio confiable desde el acceso directo

El acceso directo `Basilico Pizzeria.lnk` abre el POS por la IP LAN actual del backend, por ejemplo `http://192.168.1.5:3001`. La interfaz y Socket.IO se conectan siempre por esa dirección LAN, incluso cuando se abre el POS desde la PC servidor.

Al abrir el acceso directo, Basilico inicia el backend si hace falta y consulta su dirección LAN vigente antes de abrir el navegador. No debes ejecutar `ipconfig`, copiar IP ni editar archivos: `npm run build:export` y el acceso directo detectan automáticamente la IP privada de la interfaz Wi-Fi/Ethernet activa.

Si el router cambia la IP mientras el sistema está apagado, el acceso directo vuelve a consultar la IP al iniciar. Para que tablets, celulares u otras PCs puedan conservar una dirección fija, crea una reserva DHCP para la PC servidor en el router usando la dirección MAC de su adaptador Wi-Fi.

## Generar APK Android

```powershell
npm run build:apk
```

El resultado se copia a `export/BasilicoPizzeria.apk` cuando la compilacion Android finaliza correctamente.

## Verificar antes de exportar

```powershell
npx tsc --noEmit --pretty false
npm run build
node --check server/routes/payments.js
```

## Impresora térmica LAN FREMORT FRM-8330 (80 mm)

La FRM-8330 usa papel térmico de 80 mm y se integra por LAN con comandos ESC/POS. Las comandas no se convierten a PDF: se imprimen como tickets ESC/POS de 80 mm, con corte automático, para que el texto llegue completo y legible. Esto es más fiable que enviar un PDF a una térmica de este tipo.

Al crear una comanda que requiere cocina, Basilico la guarda primero en PostgreSQL. Solo después intenta imprimirla. Un fallo de impresora nunca borra ni modifica la comanda; el POS muestra una alerta visible para reintentar tras corregir la conexión.

### Configuración manual inicial

1. Conecta la impresora y la PC servidor a la misma red Wi-Fi o LAN. No uses una red de invitados.
2. Enciende la impresora, coloca el rollo térmico de 80 mm y verifica que haga su autoprueba manteniendo presionado `FEED` mientras la enciendes. Anota la dirección IP que aparezca en el ticket de autoprueba.
3. En Windows, instala el controlador que suministró FREMORT para la FRM-8330. En `Configuración > Bluetooth y dispositivos > Impresoras y escáneres`, agrega la impresora por dirección TCP/IP si el controlador lo solicita.
4. En las propiedades de impresión de Windows, configura papel de `80 mm`, orientación vertical, escala `100 %` o `Tamaño real` y activa el corte automático si el controlador lo ofrece. Imprime una página de prueba de Windows.
5. Abre [server/config/thermal-printer.json](server/config/thermal-printer.json) y completa la IP obtenida en la autoprueba. Conserva el puerto `9100` salvo que el ticket de autoprueba o el manual indique otro:

```json
{
	"enabled": true,
	"host": "192.168.1.200",
	"port": 9100,
	"timeoutMs": 5000,
	"copies": 1
}
```

6. Guarda el archivo, reinicia el backend desde `server/` con `npm run start` y ejecuta desde la raíz del proyecto:

```powershell
npm run print:test
```

7. El comando imprime un ticket de prueba sin crear ni cambiar datos de la base. Confirma que el ancho, el corte y el texto se leen correctamente antes de activar el uso operativo.
8. Envía una comanda real de prueba. El ticket incluye número, fecha/hora, tipo de servicio, mesa/cliente, mesero, cada ítem, cantidad, tamaño, mitad y mitad, ingredientes retirados, extras, preferencias, para llevar, notas individuales, nota general, número de ítems y total.

### Reportes en la misma impresora

Todos los botones de reportes de Caja envían de inmediato una versión ESC/POS de 80 mm a la FRM-8330 configurada en [server/config/thermal-printer.json](server/config/thermal-printer.json). El reporte incluye cobros y egresos en USD, COP y Bs con sus métodos de pago. Al mismo tiempo se abre una vista optimizada para rollo de 80 mm; desde su diálogo puedes seleccionar `Microsoft Print to PDF` si necesitas una copia PDF.

Si la térmica está apagada, fuera de red o deshabilitada, el POS muestra el error y no genera una impresión falsa. Verifica primero la conexión con `npm run print:test`.

## Base de datos y migraciones (Crispy POS)

Las migraciones son automáticas: al iniciar el backend, `server/db.js` ejecuta los `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` necesarios. No ejecutes el esquema manualmente para una actualización normal.

- **Base de datos local**: PostgreSQL `crispy` (usuario `postgres`, clave `sdmaia1.`, puerto `5432`).
- **Repositorio remoto**: `https://github.com/BurgosDeveloper/crispy.git`.
- **Esquema de datos**: `server/schema.sql` y `server/db.js` adaptados al catálogo de Hamburguesas, Bebidas y Acompañantes.
- **Historial de pagos**: Soporte multi-divisa (USD, COP, Bs, Binance) con columnas `cash_tendered_bs`, `change_given_bs`, `cop_rate`, `bs_rate` auditables.

El backend se ejecuta en el puerto `3001` (LAN y local). Para iniciar el servidor:
```powershell
cd server
npm start
```

## Limpiar pedidos de prueba

Atención: elimina comandas y movimientos. No lo uses para una limpieza operativa sin respaldo.

```powershell
node scripts/clean-database.js
```

## Arquitectura de Turno Único Unificado (Crispy POS)

Para optimizar y agilizar la operación en Crispy POS, el sistema se ha simplificado a un **Turno Único Unificado** (`ambos`):
1. **Turno Unificado**: Operación continua centralizada (`ambos`), eliminando la duplicación de ítems por turno (`-noche`) y permitiendo una gestión fluida de caja y cocina.
2. **Comandas y Correlativos**: Numeración correlativa continua (`#1`, `#2`, `#3`...) sin partición por turno.
3. **Catálogo de Menú (Hamburguesas)**: Catálogo unificado de Hamburguesas, Bebidas y Acompañantes. La personalización se basa en ingredientes base (que pueden removerse como `SIN: ...`) e ingredientes adicionales (`EXTRA: ...`), eliminando complejidades de tamaños de pizza y mitades.
4. **Mesas**: Ocupación en tiempo real calculada dinámicamente según las órdenes activas.
5. **Caja Chica y Arqueos**: Flujo directo de apertura de caja, transacciones (ingresos/egresos) y cierre contable con impresión térmica automática del arqueo.
6. **Realtime WebSockets**: Emisiones globales a todos los terminales conectados (`io.emit`), garantizando sincronización instantánea entre Caja, Mesero y Cocina.
7. **Cuentas del Sistema**: Accesos directos unificados:
   - `admin` (Administrador General)
   - `caja` (Cajero Principal)
   - `mesero` (Mesero Principal)
   - `cocina` (Jefe de Cocina)

## Cuentas a Crédito y Gestión de Deudas por Cobrar

1. **Cerrar a Crédito**: Desde el modal de cobro unificado (`PaymentLedgerModal`) o la vista de Caja POS, cualquier comanda puede ser cerrada bajo la modalidad de **Crédito / Cuenta por Cobrar**.
2. **Nombre de Deudor Obligatorio**: Al pulsar "📝 Cerrar a Crédito", el sistema exige de forma estricta ingresar el nombre del cliente o deudor responsable de la cuenta (no se admiten nombres vacíos ni genéricos). Opcionalmente se puede adjuntar una nota o referencia.
3. **Aislamiento Contable de Caja Chica**: Las comandas a crédito **NO** generan registros de ingresos ni egresos en `caja_chica_transactions` ni suman dinero físico en la gaveta.
4. **Desglose de Créditos en Reportes y PDF**: En los reportes contables del intervalo y exportaciones de Excel, las cuentas a crédito se reflejan en su propia sección detallada: **"DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR"**, mostrando Comanda #, Fecha/Hora, Deudor, Ítems solicitados y Monto total adeudado en USD (con sus equivalencias informativas en COP y Bs).
5. **Exclusión en Pago por Personas**: La opción de "Cerrar a Crédito" aplica exclusivamente al cierre de la comanda completa; en la modalidad de "Pago por Personas" (cobro dividido por comensal o ítem) el botón de crédito queda automáticamente deshabilitado para preservar la integridad de cobros individuales.

## Formato de Reportes y Apertura sin Impresión Forzada

1. **Tablas con Moneda y Monto**: Todas las tablas de desglose (Totales por Moneda, Desglose por Método de Pago, Historial por Método, Ingresos y Vueltos) presentan una estructura limpia de **Moneda | Monto Recibido**, eliminando las 3 columnas en paralelo para mayor legibilidad y claridad contable.
2. **Apertura de Reportes Bajo Demanda**: Al consultar los reportes en pantalla, el sistema abre la vista previa en el navegador sin disparar órdenes directas a la impresora térmica. La impresión o guardado en PDF se realiza únicamente cuando el usuario presiona el botón "🖨️ IMPRIMIR / PDF".
3. **Exportación a Excel**: Incluye una hoja dedicada para **Créditos** con los detalles del cliente, comanda e ítems facturados a crédito.

## Toma de Pedidos Habilitada para Rol Caja

El usuario con rol `caja` dispone de permisos completos de mesonero:
- Puede crear pedidos nuevos directamente desde `/mesonero` o mediante el botón de acceso rápido en la cabecera de comanda de Caja POS.
- Dispone del selector rápido en la barra lateral para alternar cómodamente entre `💳 Caja POS` y `🍽️ Mesero`.

## Impresión de Comandas de Cocina y Pre-Cuenta con Tipografía Ampliada (+30%)

1. **Filtro de Ítems de Cocina**: Al enviarse la orden a la impresora térmica de cocina o KDS, el sistema filtra y procesa **únicamente** los ítems que requieren preparación:
   - **Pizzas**: Con tamaños (Grande / Pequeña), detalle de mitades (1ra y 2da mitad), ingredientes retirados (`SIN`), extras agregados (`EXTRA`) y notas de personalización.
   - **Jugos y Bebidas Preparadas**: Con su nivel de endulzante (`AZÚCAR: Sin azúcar / Con azúcar / Poca azúcar`) e indicación de para llevar (`*** PARA LLEVAR ***`).
2. **Exclusión de Ítems Comerciales**: Refrescos enlatados, aguas embotelladas, licores comerciales o adicionales empaquetados que no se preparan en cocina quedan excluidos de la comanda térmica de cocina. Si una orden consta exclusivamente de bebidas comerciales, el sistema no emite ticket en la estación de cocina.
3. **Tipografía Térmica Ampliada (+30%)**: Tanto las comandas de cocina como las pre-cuentas de consumo emplean escalado ESC/POS con mayor presencia horizontal y doble altura en encabezados e ítems para lectura rápida a distancia en cocina y salón.
4. **Ticket de Pre-Cuenta y Consumo desde Caja**: Botón instantáneo `🧾 IMPRIMIR PRE-CUENTA` en cada tarjeta de comanda activa que genera el ticket de consumo con todos los ítems y totales desglosados en **USD ($)**, **COP (Pesos)** y **Bs (Bolívares)** al tipo de cambio del turno.

## Sistema de Autorización con PIN de Seguridad (4 Dígitos)

El sistema protege las operaciones críticas y administrativas permitiendo al rol `caja` operar con total autonomía en sus funciones directas y exigiendo autorización mediante un PIN de 4 dígitos (por defecto `1234`, configurable por el Administrador):

1. **Operaciones Directas SIN Clave**:
   - 💱 **Editar tasas de cambio**: Actualización inmediata de tasas COP y Bs.
   - 🍽️ **Crear comandas y tomar pedidos (Mesero)**: Envío de pedidos a cocina.
   - 💳 **Cobranza de comandas**: Cobro unificado (Ledger), abonos y cierre a crédito.
   - 👥 **Pagar por personas**: Cobro dividido por comensal o ítem.
   - 📦 **Entregar comandas**: Despacho de comandas preparadas.
   - 🔥 **Marcar comanda como lista**: Control del flujo de preparación.
   - 🧾 **Imprimir ticket / pre-cuenta**: Emisión de comprobante al cliente.
   - 💰 **Caja Chica**: Registro de vueltos o egresos manuales en efectivo.

2. **Operaciones Administrativas CON Clave PIN**:
   - ✏️ **Editar Comanda**: Modificación de ítems o notas de comanda abierta.
   - 🗑️ **Anular / Borrar Comanda**: Eliminación total y liberación del correlativo.
   - 🔗 **Unificar Comandas**: Fusión de múltiples comandas en una máster.
   - 📂 **Pestaña HISTORIAL**: Consulta de comandas cobradas en días o turnos anteriores.
   - 📊 **Pestaña REPORTES & CIERRE**: Consulta de reportes contables e intervalos y realización de arqueos/cierres.
   - ⚙️ **Caja Chica - Apertura**: Modificación del fondo inicial de apertura.
   - 🔄 **Reactivar Comanda**: Reapertura de comandas finalizadas desde el historial.
   - 📋 **Menú Admin (`/menu-admin`)**: Administración del catálogo de pizzas, bebidas, ingredientes, mesas o PIN de seguridad.

3. **Configuración del PIN**: En el panel de administración (`/menu-admin` -> pestaña `🔐 PIN DE SEGURIDAD`), el Administrador puede visualizar el PIN activo y cambiarlo en cualquier momento.

## Jerarquía Visual, Tipografía y Código de Colores de Monedas

1. **Diferenciación Clara entre Pago y Vuelto**:
   - **Pago del Cliente (Ingreso)**: Botón y tarjeta en Verde Esmeralda de alto impacto (`🟢 REGISTRANDO: PAGO DEL CLIENTE / INGRESO A CAJA`).
   - **Vuelto al Cliente (Egreso)**: Botón y tarjeta en Ámbar / Naranja vibrante (`🟠 REGISTRANDO: VUELTO AL CLIENTE / EGRESO DE CAJA`).
2. **Visualización de Monedas en Grande**:
   - **💵 USD**: Verde Esmeralda (`text-emerald-400 / text-emerald-800`).
   - **🇨🇴 COP**: Azul Cielo (`text-sky-300 / text-sky-800`).
   - **🇻🇪 Bs**: Ámbar Dorado (`text-amber-300 / text-amber-800`).
   Todas las monedas se muestran con tipografía amplia y tarjetas con alto contraste para una percepción visual instantánea sin fatiga.

## Arqueo, Cierre de Turno y Purga Automática con Preservación de Créditos

1. **Seguridad en el Cierre**: El rol `caja` requiere autorización mediante PIN de 4 dígitos para realizar el arqueo y cierre del turno; el rol `admin` accede de forma directa.
2. **Impresión Térmica Automática**: Al confirmar el arqueo de efectivo (contado físico USD y COP), el sistema emite de manera automática el ticket térmico de cierre detallando la apertura, los totales desglosados por método de pago, el resumen de créditos y el cuadre de caja chica (esperado vs contado vs diferencia).
3. **Purga Automática Limpia**: Se eliminan de la base de datos las comandas finalizadas/cobradas al 100% (`payment_status = 'pagado'`), sus pagos e ítems, así como las transacciones y aperturas del turno cerrado, garantizando un inicio de ciclo limpio y sin necesidad de ejecutar scripts SQL manuales.
4. **Preservación de Cuentas a Crédito**: Las comandas con deuda pendiente (`payment_status = 'credito'`) **NO** se borran del sistema; se conservan y se renumeran consecutivamente a las primeras posiciones (`#1`, `#2`, etc.) para mantener el histórico de cobro pendiente hasta que sean reactivadas y saldadas.
5. **Continuidad Correlativa**: Los nuevos pedidos creados en el siguiente ciclo inician su numeración correlativa a continuación de los créditos preservados (o en `#1` si no existen créditos pendientes).
6. **Integridad de Catálogos**: La purga del turno no altera bajo ninguna circunstancia los catálogos de menú (`products`), ingredientes (`ingredients`), mesas (`tables_config`), usuarios (`users`), tasas de cambio ni configuración del PIN.
7. **Comprobación en Vivo del Arqueo**: En el modal de arqueo, al ingresar el conteo físico en USD y COP, el sistema valida en tiempo real si el efectivo cuadra exacto o si presenta sobrante/faltante con badges visuales de alto contraste antes de confirmar el cierre definitivo.

## Validación Obligatoria de Delivery y PickUp
1. **Órdenes Delivery**:
   - Es **OBLIGATORIO** especificar el **Nombre del Cliente** (o contacto) y seleccionar/ingresar el **Monto del Delivery ($ USD > 0)**.
   - Si falta alguno de los dos, el sistema bloquea el envío de la comanda con avisos visuales claros en rojo (`⚠️ Ingrese Nombre y Monto de Delivery`).
   - El monto del delivery se computa como ítem explícito (`🛵 SERVICIO DELIVERY`) en el total de la comanda, en el KDS de cocina, en Caja y en los tickets térmicos.
2. **Órdenes PickUp / Para Llevar**:
   - Es **OBLIGATORIO** especificar el **Nombre o Referencia del Cliente**.
   - El sistema bloquea el envío si el campo se encuentra vacío (`⚠️ Ingrese Nombre del Cliente`).

## Reubicación y Cambio de Mesa en Tiempo Real
1. En comandas de salón (`type === 'mesa'`) activas, tanto en Mesero como en Caja se dispone del botón `🔄 Cambiar Mesa`.
2. Al presionarlo se despliega la modal interactiva `ChangeTableModal` mostrando el catálogo de mesas disponibles en verde (`Libre`), mientras que las ocupadas por otras comandas se muestran en rojo/deshabilitadas.
3. Al confirmar el traslado, el endpoint `PATCH /api/orders/:id/change-table` ejecuta una transacción en PostgreSQL que:
   - Reasigna el `table_number` de la comanda a la nueva mesa.
   - Marca la nueva mesa como `ocupada`.
   - Verifica si la mesa anterior quedó sin pedidos activos y la libera automáticamente (`libre`).
   - Emite los eventos `orders:sync` y `tables:sync` por Socket.IO en tiempo real a todos los dispositivos conectados.

## Sidebar Colapsable a Modo Solo Iconos y Tarjetas Compactas
1. **Modo Colapsable en Sidebar (`Sidebar.tsx`)**:
   - Botón toggle `[ ⏪ / ⏩ ]` en la cabecera superior del menú lateral.
   - Alterna entre el modo extendido (`w-72`) y el modo compacto de solo iconos (`w-20`), permitiendo maximizar el espacio útil de la pantalla para comandas y mesas.
   - La preferencia del usuario se almacena y persiste automáticamente en `localStorage` (`basilico_sidebar_collapsed`).
   - En modo colapsado, los accesos rápidos (`🍽️`, `💳`, `🔥`, `🍕`) y las opciones de sub-navegación se presentan centrados con badges numéricos flotantes y tooltips explicativos.
2. **Diseño Compacto de Tarjetas de Comanda**:
   - Tarjetas optimizadas con paddings reducidos y contenedor scrollable para la lista de ítems (`max-h-48`).
   - Botones de acción organizados en cuadrícula de 2 a 3 columnas con tipografía nítida y jerarquía de colores:
     - 🟢 **Verde**: Cobro y pagos completados (`#059669`).
     - 🟠 **Ámbar**: Marcado de comanda lista y estado en cocina (`#f59e0b`).
     - 🔵 **Azul**: Cobro por personas (`#3b82f6`).
     - 🟣 **Morado**: Edición de comanda (`#a855f7`).
     - 🔴 **Rojo**: Anulación de comanda (`#ef4444`).
     - 🟦 **Cian/Sky**: Pre-cuenta térmica y tasas COP (`#0ea5e9`).
     - ➕ **Sky Brillante**: Adición rápida a la cuenta (`#0284c7`).

## Modal de Adición de Ítems a la Comanda (`OrderAppendModal`) y Ticket de Cocina
1. **Acceso Rápido Sin Clave**:
   - Tanto el rol **Mesero** como el rol **Caja** pueden presionar el botón `➕ ADICIONAR` en cualquier comanda activa para incorporar nuevos productos sin requerir clave o PIN de autorización.
2. **Borrado Protegido con PIN**:
   - Si se requiere eliminar o anular un ítem que ya había sido guardado previamente en la comanda, el rol `caja` debe ingresar el PIN de 4 dígitos de autorización de administrador (`AdminPinModal`).
3. **Impresión Térmica Selectiva en Cocina**:
   - Cuando la adición incluya productos que requieren preparación en cocina (**Pizzas** con sus modificaciones de tamaño/mitades/extras, o **Jugos** con preferencias de azúcar), el sistema genera y emite a la impresora térmica de cocina un ticket exclusivo con los nuevos productos bajo el encabezado:
     ```text
     ==============================
       --- ADICION A COMANDA ---
     ==============================
     ```
   - Si la adición consta exclusivamente de **bebidas comerciales o ítems de mostrador**, no se emite ticket a la cocina para evitar saturar al personal, actualizando únicamente la comanda digital y el saldo total de la cuenta.
4. **Recálculo Atómico de Totales y Sincronización en Tiempo Real**:
   - Endpoint `POST /api/orders/:id/append-items` con transacción atómica en PostgreSQL.
   - Si la comanda estaba en estado `preparada` o `lista`, se reabre automáticamente a `en_preparacion` al ingresar nuevos productos de cocina.
   - Sincronización inmediata vía Socket.IO (`orders:sync`, `order:status_updated`) a todos los terminales (Caja, Mesonero, KDS Cocina).

## Sistema de Impresoras Térmicas Duales (Cocina y Caja)
1. **Configuración Centralizada en Panel de Administración (`/menu-admin`)**:
   - Pestaña **`🖨️ IMPRESORAS TÉRMICAS`** para gestionar independientemente:
     - 🍳 **Impresora de Cocina / KDS**: Host IP, Puerto (default 9100), Timeout, Copias y Switch de activación.
     - 💳 **Impresora de Caja / Mostrador**: Host IP, Puerto (default 9100), Timeout, Copias y Switch de activación.
   - Botón **`🧪 IMPRESIÓN DE PRUEBA`** para Cocina, Caja y botón **`🖨️ PROBAR AMBAS`** para comprobación simultánea en vivo.
   - Persistencia segura en `server/config/thermal-printer.json`.
2. **Modal Selector Interactivo de Impresora (`PrinterSelectModal`)**:
   - Al emitir pre-cuentas (`🧾 PRE-CUENTA`) o imprimir reportes contables, el sistema despliega el selector visual con estado en vivo:
     - `🍳 IMPRESORA DE COCINA`
     - `💳 IMPRESORA DE CAJA`
     - `🖨️ IMPRIMIR EN AMBAS IMPRESORAS`
3. **Enrutamiento Inteligente por Defecto**:
   - **Comandas y Adiciones de Cocina**: Enrutadas automáticamente a la **Impresora de Cocina**.
   - **Arqueos y Cierres de Turno**: Enrutados automáticamente a la **Impresora de Caja**.
   - **Pre-Cuentas y Reportes**: Permite selección explícita del destino mediante el modal selector.
