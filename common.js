module.exports.AILyricTaskStatus = {
  NONE: 0, // 非法状态
  PENDING: 1, // 任务待申领
  TRASCRIPTING: 2, // 任务已被申领，并等待执行完成
  SUCCESS: 3, // 翻译成功
  ERROR: 4, // 翻译失败
  COUNT: 5, // 状态总数
}
