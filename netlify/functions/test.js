exports.handler = async () => {
  // 数据库已经自动连接好了！
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "一切就绪！" })
  }
}
