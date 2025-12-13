const express = require("express");
const router = express.Router();
const { homeController } = require("../controllers");

// Define routes
router.get("/", homeController);

module.exports = router;
