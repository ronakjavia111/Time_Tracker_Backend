const jsonServer = require("json-server");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const { log } = require("console");

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const userdb = JSON.parse(fs.readFileSync("db.json", "UTF-8"));

server.use(cors());
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

const SECRET_KEY = "2dd9e694de4439029ae569c47aaf457a";
const expIn = "20m";

function createToken(payload) {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: expIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (err) {
    throw err;
  }
}

// --- LOGIN ---
server.post("/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = userdb.users.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const token = createToken({ email: email, id: user.id, expiresIn: expIn });
  res.status(200).json({ token });
});

// --- REGISTER ---
server.post("/auth/register", (req, res) => {
  const { email, password } = req.body;

  if (email === "" || email === null || email === undefined)
    return res
      .status(400)
      .json({ message: "The Email is empty, null, or undefined." });

  if (password === "" || password === null || password === undefined)
    return res
      .status(400)
      .json({ message: "The Password is empty, null, or undefined." });

  if (userdb.users.find((u) => u.email === email)) {
    return res.status(400).json({ message: "User already exists." });
  }

  const newUser = {
    id: userdb.users.length + 1,
    email: email,
    password: password,
  };

  userdb.users.push(newUser);

  fs.writeFileSync("db.json", JSON.stringify(userdb, null, 2));

  return res.status(201).json({ message: "User Registered Succesfully." });
});

// --- Add TimeLog ---
server.post("/timelogs", (req, res) => {
  const { projectId, userId, title, description, date, hours, billable } =
    req.body;

  if (
    [projectId, userId, title, date, hours, billable].some(
      (field) => field === null || field === undefined || field === ""
    )
  ) {
    return res.status(400).json({
      message: "One or more required fields are empty, null, or undefined.",
    });
  }

  if (!userdb.users.find((u) => u.id === userId)) {
    return res.status(400).json({ message: "User does not exist." });
  }

  if (!userdb.projects.find((p) => p.id === projectId)) {
    return res.status(400).json({ message: "Project does not exist." });
  }

  const newTimeLog = {
    id: userdb.timelogs.sort((x, y) => y.id - x.id)[0].id + 1,
    title: title,
    description: description || "",
    date: date,
    projectId: projectId,
    userId: userId,
    hours: hours,
    billable: billable,
  };

  userdb.timelogs.push(newTimeLog);
  fs.writeFileSync("db.json", JSON.stringify(userdb, null, 2));

  return res.status(201).json({ message: "TimeLog Added Succesfully." });
});

// --- Delete TimeLog ---
server.delete("/timelogs", (req, res) => {
  const id = req.body.id;
  console.log(id);

  if (!id) return res.status(401).json({ message: "Invalid UserId." });

  const timeLog = userdb.timelogs.find((x) => x.id === id);
  if (!timeLog)
    return res.status(401).json({ message: "Record does not exist." });

  userdb.timelogs.delete(timeLog);
  return res.status(201).json({ message: "TimeLog Deleted Successfully." });
});

// --- AUTH MIDDLEWARE ---
server.use(/^(?!\/auth).*$/, (req, res, next) => {
  if (!req.headers.authorization)
    return res.status(401).json({ message: "Token Missing" });

  const token = req.headers.authorization.split(" ")[1];

  try {
    verifyToken(token);
    next();
  } catch (err) {
    res
      .status(401)
      .json({ message: err.message || "Invalid or expired token" });
  }
});

// --- JSON SERVER ROUTES ---
server.use(router);

// --- START SERVER ---
const PORT = 3000;
server.listen(PORT);
