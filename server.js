const jsonServer = require("json-server");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const shortId = require("shortid");
const { log } = require("console");

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const DB_FILE = "db.json";

// Read DB file
const getDb = () => JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));

// Write DB file
const saveDb = (data) =>
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

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

// Auto ID middleware
server.use((req, res, next) => {
    if (req.method === "POST" && !req.body.id) {
        req.body.id = shortId.generate();
    }
    next();
});

// Reload db.json before GET only
server.use((req, res, next) => {
    if (req.method === "GET") {
        try {
            router.db.setState(JSON.parse(fs.readFileSync("db.json", "UTF-8")));
        } catch (err) {
            console.error("Error reloading db.json:", err);
        }
    }
    next();
});

// --- LOGIN ---
server.post("/auth/login", (req, res) => {
    const { email, password } = req.body;

    const user = getDb().users.find(
        (u) => u.email === email && u.password === password
    );

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const token = createToken({ email: email, id: user.id, expiresIn: expIn });
    res.status(200).json({ token });
});

// --- REGISTER ---
server.post("/auth/register", (req, res) => {
    const { email, password } = req.body;
    const db = getDb();

    if (email === "" || email === null || email === undefined)
        return res
            .status(400)
            .json({ message: "The Email is empty, null, or undefined." });

    if (password === "" || password === null || password === undefined)
        return res
            .status(400)
            .json({ message: "The Password is empty, null, or undefined." });

    if (db.users.find((u) => u.email === email)) {
        return res.status(400).json({ message: "User already exists." });
    }

    const newUser = {
        id: shortId.generate(),
        email: email,
        password: password,
    };

    db.users.push(newUser);
    saveDb(db);

    return res.status(201).json({ message: "User Registered Succesfully." });
});

// --- Add TimeLog ---
server.post("/timelogs", (req, res) => {
    const { projectId, userId, title, description, date, hours, billable } =
        req.body;

    const db = getDb();

    if (
        [projectId, userId, title, date, hours, billable].some(
            (field) => field === null || field === undefined || field === ""
        )
    ) {
        return res.status(400).json({
            message:
                "One or more required fields are empty, null, or undefined.",
        });
    }

    if (!db.users.find((u) => u.id === userId)) {
        return res.status(400).json({ message: "User does not exist." });
    }

    if (!db.projects.find((p) => p.id === projectId)) {
        return res.status(400).json({ message: "Project does not exist." });
    }

    let newTimeLog = {
        id: req.body.id,
        title: title,
        description: description || "",
        date: date,
        projectId: projectId,
        userId: userId,
        hours: hours,
        billable: billable,
    };

    db.timelogs.push(newTimeLog);
    saveDb(db);

    newTimeLog = {
        ...newTimeLog,
        projectName: db.projects.find((p) => p.id === projectId)?.name,
    };

    return res
        .status(200)
        .json({ data: newTimeLog, message: "TimeLog Added Succesfully." });
});

// --- Delete TimeLog ---
server.delete("/timelogs", (req, res) => {
    const id = req.body.id;

    if (!id) return res.status(401).json({ message: "Invalid TimeLogId." });

    const db = getDb();
    const recordIndex = db.timelogs.findIndex((log) => log.id === id);

    if (recordIndex === -1) {
        return res.status(404).json({ error: "Record not found" });
    }

    db.timelogs.splice(recordIndex, 1);
    saveDb(db);

    return res.status(201).json({ message: "TimeLog Deleted Successfully." });
});

//  --- Add Project ---
server.post("/project", (req, res) => {
    const { userId, name } = req.body;

    if (!userId) return res.status(400).json({ message: "Invalid UserId" });

    if (!name || name === "")
        return res.status(400).json({ message: "Invalid ProjectName" });

    const db = getDb();

    if (!db.users.find((x) => x.id === userId))
        return res.status(401).json({ message: "User not Found" });

    if (!db.projects.findIndex((x) => x.name === name))
        return res
            .status(401)
            .json({ message: "Project Name is already exist" });

    const newProject = {
        id: shortId.generate(),
        name: name,
        userId: userId,
    };

    db.projects.push(newProject);
    saveDb(db);

    return res
        .status(200)
        .json({ data: newProject, message: "Project Added Successfully." });
});

// --- Delete Project ---
server.delete("/project", (req, res) => {
    const id = req.body.id;

    if (!id) return res.status(401).json({ message: "Invalid ProjectId." });

    const db = getDb();
    const projectToBeDeleted = db.projects.findIndex((x) => x.id === id);

    db.timelogs.forEach((data) => {
        if (data.projectId === id) {
            let record = db.timelogs.findIndex((x) => x.id === data.id);
            db.timelogs.splice(record, 1);
        }
    });

    if (projectToBeDeleted === -1) {
        return res.status(404).json({ error: "Project not found" });
    }

    db.projects.splice(projectToBeDeleted, 1);
    saveDb(db);

    return res.status(201).json({ message: "Project Deleted Successfully." });
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
        res.status(401).json({
            message: err.message || "Invalid or expired token",
        });
    }
});

// --- USE ROUTER ---
server.use(router);

// --- START SERVER ---
const PORT = 3000;

server.listen(PORT);
