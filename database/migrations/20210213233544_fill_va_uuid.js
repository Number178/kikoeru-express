const { v5: uuidv5 } = require('uuid');

exports.up = async function(knex) {
  const nameToUUID = (name) => {
    const namespace =  '699d9c07-b965-4399-bafd-18a3cacf073c'; 
    return uuidv5(name, namespace);
  };

  const records = await knex('t_va').select('id', 'name');
  try {
    await knex.transaction(async (trx) => {
      for (const item of records) {
        // Note: foreign key integrity checks and actions are disabled by default in SQLite
        // I keep them disabled in migrations.
        const oldHash = item['id'];
        const name = item['name'];
        const newHash = nameToUUID(name);
        await trx('t_va').update('id', newHash).where('name', name);
        await trx('r_va_work').update('va_id', newHash).where('va_id', oldHash);
      }
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
};

exports.down = async function(knex) {
  const hashNameIntoInt = (name) => {
    let hash = '';
    
    for (let i = 0; i < name.length; i += 1) {
      const char = name.charCodeAt(i);
      // eslint-disable-next-line no-bitwise
      hash = ((hash << 5) - hash) + char;
    }
    
    // eslint-disable-next-line no-bitwise
    hash |= 0;
    hash = Math.abs(Math.round(hash / 1000));
    return hash;
  };

  const records = await knex('t_va').select('id', 'name');
  try {
    await knex.transaction(async (trx) => {
      for (const item of records) {
        const name = item['name'];
        await trx('t_va').update('id', hashNameIntoInt(name)).where('name', name);
        await trx('r_va_work').update('va_id', hashNameIntoInt(name)).where('va_id', item['id']);
      }
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
};
