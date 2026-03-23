const express = require("express"); // express
const app = express(); // app

app.use(express.json()); // json bodies

let rooms = {}; // in-memory rooms

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase(); // room code
}

function defaultPlayerState(side) {
    return {
        player_id: side, // side id
        x: side === 1 ? -2.0 : 2.0, // default x
        y: 0.0, // default y
        z: 0.0, // default z
        rot_y: side === 1 ? 0.0 : 3.14159265359, // default facing
        vel_x: 0.0, // horizontal speed
        anim: "idle", // animation
        hp: 1000, // current hp
        max_hp: 1000 // max hp
    };
}

function ensureCharSelect(room) {
    if (!room.char_select) {
        room.char_select = {
            p1_raw: "", // host raw name
            p1_id: "", // host fighter id
            p2_raw: "", // guest raw name
            p2_id: "", // guest fighter id
            stage_path: "" // stage
        };
    }
}

function ensureFightState(room) {
    if (!room.fight_state) {
        room.fight_state = {
            p1_state: defaultPlayerState(1), // p1 state
            p2_state: defaultPlayerState(2) // p2 state
        };
    }

    if (!room.fight_state.p1_state) {
        room.fight_state.p1_state = defaultPlayerState(1); // repair p1
    }

    if (!room.fight_state.p2_state) {
        room.fight_state.p2_state = defaultPlayerState(2); // repair p2
    }
}

function sanitizeState(raw, forcedPlayerId) {
    const src = raw || {}; // incoming state

    return {
        player_id: forcedPlayerId, // force side
        x: Number(src.x ?? 0), // x
        y: Number(src.y ?? 0), // y
        z: Number(src.z ?? 0), // z
        rot_y: Number(src.rot_y ?? 0), // rotation
        vel_x: Number(src.vel_x ?? 0), // horizontal velocity
        anim: String(src.anim ?? "idle"), // animation
        hp: Number(src.hp ?? 1000), // hp
        max_hp: Number(src.max_hp ?? 1000) // max hp
    };
}

function makeRole(room, requesterId) {
    const who = String(requesterId || ""); // requester
    if (who !== "" && who === room.host) {
        return { is_host: true, assigned_side: 1 }; // host role
    }
    if (who !== "" && who === room.guest) {
        return { is_host: false, assigned_side: 2 }; // guest role
    }
    return { is_host: false, assigned_side: 0 }; // unknown
}

function makeRoomState(room, requesterId) {
    ensureCharSelect(room); // char select exists
    ensureFightState(room); // fight state exists

    const both_locked =
        room.char_select.p1_id !== "" &&
        room.char_select.p2_id !== ""; // both fighters picked

    const role = makeRole(room, requesterId); // role for requester

    return {
        success: true, // success
        room_code: room.code, // room code
        status: room.status, // room status
        host_tag: room.host_tag || "Player One", // host tag
        guest_tag: room.guest_tag || "Player Two", // guest tag
        host: room.host || null, // host id
        guest: room.guest || null, // guest id
        p1_raw: room.char_select.p1_raw, // p1 raw name
        p1_id: room.char_select.p1_id, // p1 fighter id
        p2_raw: room.char_select.p2_raw, // p2 raw name
        p2_id: room.char_select.p2_id, // p2 fighter id
        stage_path: room.char_select.stage_path, // stage path
        both_locked: both_locked, // both selected
        is_host: role.is_host, // requester role
        assigned_side: role.assigned_side, // requester side
        p1_state: room.fight_state.p1_state, // p1 live state
        p2_state: room.fight_state.p2_state // p2 live state
    };
}

app.get("/", (_req, res) => {
    res.send("Backend is live"); // health check
});

app.post("/create_room", (req, res) => {
    const code = generateCode(); // room code
    const hostId = String(req.body.player_id || ("host_" + Date.now())); // host id
    const hostTag = String(req.body.gamertag || "Player One"); // host tag

    rooms[code] = {
        code: code, // room code
        host: hostId, // host id
        host_tag: hostTag, // host tag
        guest: null, // guest id
        guest_tag: "Player Two", // guest tag
        status: "waiting", // waiting status
        char_select: {
            p1_raw: "", // p1 raw
            p1_id: "", // p1 id
            p2_raw: "", // p2 raw
            p2_id: "", // p2 id
            stage_path: "" // stage
        },
        fight_state: {
            p1_state: defaultPlayerState(1), // p1 state
            p2_state: defaultPlayerState(2) // p2 state
        }
    };

    res.json({
        success: true, // success
        room_code: code, // code
        host_tag: rooms[code].host_tag, // host tag
        guest_tag: rooms[code].guest_tag, // guest tag
        is_host: true, // creator host
        assigned_side: 1, // creator p1
        message: "Room created" // message
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const player_id = String(req.body.player_id || ("guest_" + Date.now())); // guest id
    const gamertag = String(req.body.gamertag || "Player Two"); // guest tag

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room

    if (room.guest !== null && room.guest !== player_id) {
        return res.status(409).json({
            success: false, // fail
            message: "Room full" // message
        });
    }

    room.guest = player_id; // save guest
    room.guest_tag = gamertag; // save guest tag
    room.status = "full"; // now full

    res.json({
        success: true, // success
        room_code: room_code, // code
        host_tag: room.host_tag, // host tag
        guest_tag: room.guest_tag, // guest tag
        is_host: false, // joiner guest
        assigned_side: 2, // joiner p2
        message: "Joined room" // message
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    res.json(makeRoomState(room, requester_id)); // full state
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    res.json(makeRoomState(room, requester_id)); // full select state
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester
    const fighter_raw = String(req.body.fighter_raw || ""); // raw name
    const fighter_id = String(req.body.fighter_id || ""); // fighter id

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // ensure char select

    if (requester_id === room.host) {
        room.char_select.p1_raw = fighter_raw; // host raw
        room.char_select.p1_id = fighter_id; // host p1
    } else if (requester_id === room.guest) {
        room.char_select.p2_raw = fighter_raw; // guest raw
        room.char_select.p2_id = fighter_id; // guest p2
    } else {
        return res.status(403).json({
            success: false, // fail
            message: "Player is not part of this room" // message
        });
    }

    res.json(makeRoomState(room, requester_id)); // updated state
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester
    const stage_path = String(req.body.stage_path || ""); // stage path

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    ensureCharSelect(room); // ensure char select
    room.char_select.stage_path = stage_path; // save stage

    res.json(makeRoomState(room, requester_id)); // updated state
});

app.post("/update_fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester
    const state = req.body.state || {}; // incoming state

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    ensureFightState(room); // ensure fight state

    if (requester_id === room.host) {
        room.fight_state.p1_state = sanitizeState(state, 1); // host writes p1
    } else if (requester_id === room.guest) {
        room.fight_state.p2_state = sanitizeState(state, 2); // guest writes p2
    } else {
        return res.status(403).json({
            success: false, // fail
            message: "Player is not part of this room" // message
        });
    }

    res.json(makeRoomState(room, requester_id)); // return full state
});

app.post("/fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase(); // room code
    const requester_id = String(req.body.player_id || ""); // requester

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false, // fail
            message: "Room not found" // message
        });
    }

    const room = rooms[room_code]; // room
    ensureFightState(room); // ensure fight state
    res.json(makeRoomState(room, requester_id)); // full fight state
});

const PORT = process.env.PORT || 3000; // port

app.listen(PORT, () => {
    console.log("Server running on port " + PORT); // boot log
});
