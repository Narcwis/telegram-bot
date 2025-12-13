// Controller for the home route
const homeController = (req, res) => {
  res.send("Welcome to the Telegram Bot Express Server!");
};

module.exports = { homeController };
