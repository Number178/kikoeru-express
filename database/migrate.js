const fs = require('fs');
const path = require('path');
const { exit } = require('process');

const { getConfig } = require('../config');
const config = getConfig();

const databaseFolderDir = config.databaseFolderDir;
const filePath = path.join(databaseFolderDir, 'db.sqlite3');

if (!fs.existsSync(filePath)) {
    console.error(`数据库不存在`);
    exit(0);
}

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database(path.join(databaseFolderDir, 'db.sqlite3'), err => {
    if (err) {
        console.error(err.message);
    }
    console.log('连接到数据库。');
});

// 迁移脚本
// 修复v0.3.0数据库标题文字重复的问题
db.serialize(() => {
    db.each(`SELECT trim(substr(title, 1, length(title)/2 + 1), X'0A' || ' ') AS new_title
        FROM t_work
        WHERE new_title = trim(substr(title, length(title)/2 + 2, length(title)), X'0A' || ' ');`, (err, row) => {
        if (err) {
            console.error(err.message);
        }
        // console.log(row.new_title);
    }, () => {
        // console.log('开始数据库迁移');
    });
    db.run(`UPDATE t_work SET title = trim(substr(title, 1, length(title)/2 + 1), X'0A' || ' ')
        WHERE trim(substr(title, 1, length(title)/2 + 1), X'0A' || ' ') = 
        trim(substr(title, length(title)/2 + 2, length(title)), X'0A' || ' ');`, function(err) {
        if (err) {
            return console.error(err.message);
        }
    }, function(err) {
        console.log(`处理了${this.changes}行记录`);
        console.log('完成数据库迁移');
    });
});

db.close((err) => {
    if (err) {
      console.error(err.message);
    }
});
