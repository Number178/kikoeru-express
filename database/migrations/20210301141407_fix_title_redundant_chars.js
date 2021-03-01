// Issue #29
exports.up = async function(knex) {
  const fixTitle = (title) => {
    const pattern = /(円|日元)$/u;
    return title.replace(pattern, '');
  };

  const records = await knex('t_work').select('id', 'title');
  try {
    for (const item of records) {
      const oldTitle = item['title'];
      const newTitle = fixTitle(oldTitle);
      await knex('t_work').update('title', newTitle).where('id', item['id']);
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
};

// Cannot be reverted
// eslint-disable-next-line no-unused-vars
exports.down = async function(knex) {

};
