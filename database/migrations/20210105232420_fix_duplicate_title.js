exports.up = async function(knex) {
  await knex.raw(`UPDATE t_work SET title = trim(substr(title, 1, length(title)/2 + 1), X'0A' || ' ')
    WHERE trim(substr(title, 1, length(title)/2 + 1), X'0A' || ' ') = 
    trim(substr(title, length(title)/2 + 2, length(title)), X'0A' || ' ');`);
  //console.log(raw.toString());
};

exports.down = async function(knex) {
  // Do nothing
};