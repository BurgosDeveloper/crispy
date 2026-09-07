const db = require('./db');

async function wipeDb() {
  try {
    await db.initDb();
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      console.log('🧹 Eliminando registros (órdenes, transacciones, etc) en PG (crispy)...');
      
      await client.query('TRUNCATE TABLE caja_chica_transactions RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE caja_chica_apertura RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE caja_chica_cierres RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE orders RESTART IDENTITY CASCADE');
      
      console.log('✅ Base de datos PG limpiada correctamente. Se mantuvieron usuarios, productos, mesas, ingredientes y tasas.');
      await client.query('COMMIT');
    } catch (err) {
      console.error('❌ Error al limpiar DB:', err);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      process.exit(0);
    }
  } catch (initErr) {
    console.error('❌ Error inicializando DB:', initErr);
    process.exit(1);
  }
}

wipeDb();
