const express = require("express"); // express server
const app = express(); // app instance

app.use(express.json()); // enable json parsing

let rooms = {}; // in-memory room storage

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase(); // 6-char room code
}

function ensureCharSelect(room) {
    if (!room.char_select) {
        room.char_select = {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        };
    }
}

function makeRoomState(room) {
    ensureCharSelect(room); // ensure select data exists

    const both_locked =
        room.char_select.p1_id !== "" &&
        room.char_select.p2_id !== "";

    return {
        success: true,
        host_tag: room.host_tag || "Player One",
        guest_tag: room.guest_tag || "Player Two",
        p1_raw: room.char_select.p1_raw,
        p1_id: room.char_select.p1_id,
        p2_raw: room.char_select.p2_raw,
        p2_id: room.char_select.p2_id,
        stage_path: room.char_select.stage_path,
        both_locked: both_locked
    };
}

app.get("/", (_req, res) => {
    res.send("Backend is live"); // simple health check
});

app.post("/create_room", (req, res) => {
    const code = generateCode(); // make room code

    rooms[code] = {
        host: String(req.body.player_id || "host_player"), // host player id
        host_tag: req.body.gamertag || "Player One", // host display tag
        guest: null, // guest joins later
        guest_tag: null, // guest tag joins later
        status: "waiting", // waiting until guest joins
        char_select: {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        }
    };

    res.json({
        success: true,
        room_code: code,
        host_tag: rooms[code].host_tag,
        guest_tag: rooms[code].guest_tag,
        message: "Room created",
        is_host: true, // creator is always host
        assigned_side: 1 // creator is always P1
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const player_id = String(req.body.player_id || "guest_player"); // joining player id
    const gamertag = req.body.gamertag || "Player Two"; // joining tag

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    if (rooms[room_code].guest !== null) {
        return res.status(409).json({
            success: false,
            message: "Room full"
        });
    }

    rooms[room_code].guest = player_id; // store guest id
    rooms[room_code].guest_tag = gamertag; // store guest tag
    rooms[room_code].status = "full"; // room now full

    res.json({
        success: true,
        room_code: room_code,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        message: "Joined room",
        is_host: false, // joiner is never host
        assigned_side: 2 // joiner is always P2
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // who is asking

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // current room
    const state = makeRoomState(room); // common room data

    let is_host = false; // requester host flag
    let assigned_side = 0; // requester side

    if (requester_id === room.host) {
        is_host = true; // requester is host
        assigned_side = 1; // host is P1
    } else if (requester_id === room.guest) {
        is_host = false; // requester is guest
        assigned_side = 2; // guest is P2
    }

    res.json({
        success: true,
        room_code: room_code,
        status: room.status,
        host_tag: state.host_tag,
        guest_tag: state.guest_tag,
        p1_raw: state.p1_raw,
        p1_id: state.p1_id,
        p2_raw: state.p2_raw,
        p2_id: state.p2_id,
        stage_path: state.stage_path,
        both_locked: state.both_locked,
        is_host: is_host, // requester role
        assigned_side: assigned_side // requester side
    });
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const side = Number(req.body.side || 0); // selected side
    const fighter_raw = String(req.body.fighter_raw || ""); // shown name
    const fighter_id = String(req.body.fighter_id || ""); // internal id

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // make sure char data exists

    if (side === 1) {
        room.char_select.p1_raw = fighter_raw; // host controls P1
        room.char_select.p1_id = fighter_id; // host character id
    } else if (side === 2) {
        room.char_select.p2_raw = fighter_raw; // guest controls P2
        room.char_select.p2_id = fighter_id; // guest character id
    } else {
        return res.status(400).json({
            success: false,
            message: "Invalid side"
        });
    }

    res.json(makeRoomState(room));
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // who is asking

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    const state = makeRoomState(room); // state

    let is_host = false; // requester host flag
    let assigned_side = 0; // requester side

    if (requester_id === room.host) {
        is_host = true; // requester is host
        assigned_side = 1; // host is P1
    } else if (requester_id === room.guest) {
        is_host = false; // requester is guest
        assigned_side = 2; // guest is P2
    }

    res.json({
        ...state,
        is_host: is_host, // requester role
        assigned_side: assigned_side // requester side
    });
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const stage_path = String(req.body.stage_path || ""); // selected stage

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // ensure char data exists
    room.char_select.stage_path = stage_path; // save stage path

    res.json(makeRoomState(room));
});

const PORT = process.env.PORT || 3000; // server port
app.listen(PORT, () => {
    console.log("Server running on port " + PORT); // startup log
});
