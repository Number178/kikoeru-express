const routers = require('./routes');
const authRoutes = require('./auth/routes')

module.exports = (app) => {
  app.use('/api', routers);
  app.use('/api', authRoutes);
};