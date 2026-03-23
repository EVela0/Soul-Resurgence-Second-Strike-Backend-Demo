const express = require("express"); // express server
const app = express(); // app instance

app.use(express.json()); // json body support

let rooms = {}; // in-memory rooms

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

function ensureFightState(room) {
    if (!room.fight_state) {
        room.fight_state = {
            p1_state: {
                player_id: 1,
                x: 0,
                y: 0,
                z: 0,
                rot_y: 0,
                vel_x: 0,
                anim: "idle",
                hp: 1000,
                max_hp: 1000
            },
            p2_state: {
                player_id: 2,
                x: 0,
                y: 0,
                z: 0,
                rot_y: 0,
                vel_x: 0,
                anim: "idle",
                hp: 1000,
                max_hp: 1000
            }
        };
    }
}

function makeRoomState(room) {
    ensureCharSelect(room); // ensure char select exists
    ensureFightState(room); // ensure fight state exists

    const both_locked =
        room.char_select.p1_id !== "" &&
        room.char_select.p2_id !== "";

    return {
        success: true,
        host_tag: room.host_tag || "Player One",
        guest_tag: room.guest_tag || "Player Two",
        host: room.host || null,
        guest: room.guest || null,
        p1_raw: room.char_select.p1_raw,
        p1_id: room.char_select.p1_id,
        p2_raw: room.char_select.p2_raw,
        p2_id: room.char_select.p2_id,
        stage_path: room.char_select.stage_path,
        both_locked: both_locked,
        p1_state: room.fight_state.p1_state,
        p2_state: room.fight_state.p2_state
    };
}

function sanitizeState(raw, forcedPlayerId) {
    return {
        player_id: forcedPlayerId, // force correct side
        x: Number(raw?.x || 0), // x position
        y: Number(raw?.y || 0), // y position
        z: Number(raw?.z || 0), // z position
        rot_y: Number(raw?.rot_y || 0), // facing rotation
        vel_x: Number(raw?.vel_x || 0), // horizontal velocity
        anim: String(raw?.anim || "idle"), // current anim
        hp: Number(raw?.hp || 1000), // current hp
        max_hp: Number(raw?.max_hp || 1000) // max hp
    };
}

app.get("/", (_req, res) => {
    res.send("Backend is live"); // health check
});

app.post("/create_room", (req, res) => {
    const code = generateCode(); // room code

    rooms[code] = {
        host: req.body.player_id || "host_player", // creator id
        host_tag: req.body.gamertag || "Player One", // creator tag
        guest: null, // no guest yet
        guest_tag: null, // no guest tag yet
        status: "waiting", // room waiting
        char_select: {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        },
        fight_state: {
            p1_state: {
                player_id: 1,
                x: 0,
                y: 0,
                z: 0,
                rot_y: 0,
                vel_x: 0,
                anim: "idle",
                hp: 1000,
                max_hp: 1000
            },
            p2_state: {
                player_id: 2,
                x: 0,
                y: 0,
                z: 0,
                rot_y: 0,
                vel_x: 0,
                anim: "idle",
                hp: 1000,
                max_hp: 1000
            }
        }
    };

    res.json({
        success: true,
        room_code: code,
        host_tag: rooms[code].host_tag,
        guest_tag: rooms[code].guest_tag,
        message: "Room created",
        is_host: true,
        assigned_side: 1
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const player_id = req.body.player_id || "guest_player"; // joiner id
    const gamertag = req.body.gamertag || "Player Two"; // joiner tag

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
        is_host: false,
        assigned_side: 2
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

    const room = rooms[room_code]; // room
    const state = makeRoomState(room); // full state

    let is_host = false; // default
    let assigned_side = 0; // unknown

    if (requester_id !== "") {
        if (requester_id === room.host) {
            is_host = true;
            assigned_side = 1;
        } else if (requester_id === room.guest) {
            is_host = false;
            assigned_side = 2;
        }
    }

    res.json({
        success: true,
        room_code: room_code,
        status: room.status,
        host_tag: state.host_tag,
        guest_tag: state.guest_tag,
        host: state.host,
        guest: state.guest,
        p1_raw: state.p1_raw,
        p1_id: state.p1_id,
        p2_raw: state.p2_raw,
        p2_id: state.p2_id,
        stage_path: state.stage_path,
        both_locked: state.both_locked,
        is_host: is_host,
        assigned_side: assigned_side,
        p1_state: state.p1_state,
        p2_state: state.p2_state
    });
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const side = Number(req.body.side || 0); // side
    const fighter_raw = String(req.body.fighter_raw || ""); // display name
    const fighter_id = String(req.body.fighter_id || ""); // fighter id

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // ensure char select exists

    if (side === 1) {
        room.char_select.p1_raw = fighter_raw; // host/P1 display
        room.char_select.p1_id = fighter_id; // host/P1 id
    } else if (side === 2) {
        room.char_select.p2_raw = fighter_raw; // guest/P2 display
        room.char_select.p2_id = fighter_id; // guest/P2 id
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
    const requester_id = String(req.body.player_id || ""); // requester id

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    const state = makeRoomState(room); // room state

    let is_host = false; // default
    let assigned_side = 0; // default

    if (requester_id !== "") {
        if (requester_id === room.host) {
            is_host = true;
            assigned_side = 1;
        } else if (requester_id === room.guest) {
            is_host = false;
            assigned_side = 2;
        }
    }

    res.json({
        ...state,
        is_host: is_host,
        assigned_side: assigned_side
    });
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const stage_path = String(req.body.stage_path || ""); // stage path

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // ensure char select exists
    room.char_select.stage_path = stage_path; // save stage

    res.json(makeRoomState(room));
});

app.post("/update_fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const player_id = String(req.body.player_id || ""); // requester id
    const state = req.body.state || {}; // incoming fighter state

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureFightState(room); // ensure fight state exists

    if (player_id === room.host) {
        room.fight_state.p1_state = sanitizeState(state, 1); // host always writes p1
    } else if (player_id === room.guest) {
        room.fight_state.p2_state = sanitizeState(state, 2); // guest always writes p2
    } else {
        return res.status(403).json({
            success: false,
            message: "Player is not part of this room"
        });
    }

    res.json({
        success: true,
        room_code: room_code,
        p1_state: room.fight_state.p1_state,
        p2_state: room.fight_state.p2_state
    });
});

app.post("/fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const player_id = String(req.body.player_id || ""); // requester id

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code]; // room
    ensureFightState(room); // ensure fight state exists

    let is_host = false; // role flag
    let assigned_side = 0; // side flag

    if (player_id === room.host) {
        is_host = true;
        assigned_side = 1;
    } else if (player_id === room.guest) {
        is_host = false;
        assigned_side = 2;
    }

    res.json({
        success: true,
        room_code: room_code,
        is_host: is_host,
        assigned_side: assigned_side,
        p1_state: room.fight_state.p1_state,
        p2_state: room.fight_state.p2_state
    });
});

const PORT = process.env.PORT || 3000; // port
app.listen(PORT, () => {
    console.log("Server running on port " + PORT); // start log
});
