const express = require("express");
const app = express();

app.use(express.json());

let rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function defaultPlayerState(side) {
    return {
        player_id: side,
        x: side === 1 ? -2.0 : 2.0,
        y: 0.0,
        z: 0.0,
        rot_y: side === 1 ? 0.0 : 3.14159265359,
        vel_x: 0.0,
        anim: "idle",
        hp: 1000,
        max_hp: 1000,
        state_seq: 0,
        updated_at: Date.now()
    };
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
            p1_state: defaultPlayerState(1),
            p2_state: defaultPlayerState(2)
        };
    }

    if (!room.fight_state.p1_state) {
        room.fight_state.p1_state = defaultPlayerState(1);
    }

    if (!room.fight_state.p2_state) {
        room.fight_state.p2_state = defaultPlayerState(2);
    }
}

function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback) {
    if (value === undefined || value === null) {
        return fallback;
    }
    return String(value);
}

function sanitizeState(raw, forcedPlayerId, previousState) {
    const prev = previousState || defaultPlayerState(forcedPlayerId);
    const src = raw || {};

    const maxHp = Math.max(
        1,
        safeNumber(src.max_hp, prev.max_hp)
    );

    let hp = safeNumber(src.hp, prev.hp);
    hp = Math.max(0, Math.min(hp, maxHp));

    const nextSeq = Math.max(
        safeNumber(src.state_seq, prev.state_seq + 1),
        prev.state_seq
    );

    return {
        player_id: forcedPlayerId,
        x: safeNumber(src.x, prev.x),
        y: safeNumber(src.y, prev.y),
        z: safeNumber(src.z, prev.z),
        rot_y: safeNumber(src.rot_y, prev.rot_y),
        vel_x: safeNumber(src.vel_x, prev.vel_x),
        anim: safeString(src.anim, prev.anim),
        hp: hp,
        max_hp: maxHp,
        state_seq: nextSeq,
        updated_at: Date.now()
    };
}

function shouldAcceptState(incomingRaw, currentState) {
    const currentSeq = safeNumber(currentState?.state_seq, 0);
    const incomingSeq = safeNumber(incomingRaw?.state_seq, currentSeq + 1);

    return incomingSeq >= currentSeq;
}

function makeRole(room, requesterId) {
    const who = String(requesterId || "");
    if (who !== "" && who === room.host) {
        return { is_host: true, assigned_side: 1 };
    }
    if (who !== "" && who === room.guest) {
        return { is_host: false, assigned_side: 2 };
    }
    return { is_host: false, assigned_side: 0 };
}

function makeRoomState(room, requesterId) {
    ensureCharSelect(room);
    ensureFightState(room);

    const both_locked =
        room.char_select.p1_id !== "" &&
        room.char_select.p2_id !== "";

    const role = makeRole(room, requesterId);

    return {
        success: true,
        room_code: room.code,
        status: room.status,
        host_tag: room.host_tag || "Player One",
        guest_tag: room.guest_tag || "Player Two",
        p1_raw: room.char_select.p1_raw,
        p1_id: room.char_select.p1_id,
        p2_raw: room.char_select.p2_raw,
        p2_id: room.char_select.p2_id,
        stage_path: room.char_select.stage_path,
        both_locked: both_locked,
        is_host: role.is_host,
        assigned_side: role.assigned_side,
        p1_state: room.fight_state.p1_state,
        p2_state: room.fight_state.p2_state
    };
}

app.get("/", (_req, res) => {
    res.send("Backend is live");
});

app.post("/create_room", (req, res) => {
    const code = generateCode();
    const hostId = String(req.body.player_id || ("host_" + Date.now()));
    const hostTag = String(req.body.gamertag || "Player One");

    rooms[code] = {
        code: code,
        host: hostId,
        host_tag: hostTag,
        guest: null,
        guest_tag: "Player Two",
        status: "waiting",
        char_select: {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        },
        fight_state: {
            p1_state: defaultPlayerState(1),
            p2_state: defaultPlayerState(2)
        }
    };

    res.json({
        success: true,
        room_code: code,
        host_tag: rooms[code].host_tag,
        guest_tag: rooms[code].guest_tag,
        is_host: true,
        assigned_side: 1,
        message: "Room created"
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const player_id = String(req.body.player_id || ("guest_" + Date.now()));
    const gamertag = String(req.body.gamertag || "Player Two");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];

    if (room.guest !== null && room.guest !== player_id) {
        return res.status(409).json({
            success: false,
            message: "Room full"
        });
    }

    room.guest = player_id;
    room.guest_tag = gamertag;
    room.status = "full";

    res.json({
        success: true,
        room_code: room_code,
        host_tag: room.host_tag,
        guest_tag: room.guest_tag,
        is_host: false,
        assigned_side: 2,
        message: "Joined room"
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    res.json(makeRoomState(room, requester_id));
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    res.json(makeRoomState(room, requester_id));
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const fighter_raw = String(req.body.fighter_raw || "");
    const fighter_id = String(req.body.fighter_id || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureCharSelect(room);

    if (requester_id === room.host) {
        room.char_select.p1_raw = fighter_raw;
        room.char_select.p1_id = fighter_id;
    } else if (requester_id === room.guest) {
        room.char_select.p2_raw = fighter_raw;
        room.char_select.p2_id = fighter_id;
    } else {
        return res.status(403).json({
            success: false,
            message: "Player is not part of this room"
        });
    }

    res.json(makeRoomState(room, requester_id));
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const stage_path = String(req.body.stage_path || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureCharSelect(room);
    room.char_select.stage_path = stage_path;

    res.json(makeRoomState(room, requester_id));
});

app.post("/update_fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const state = req.body.state || {};

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureFightState(room);

    if (requester_id === room.host) {
        const current = room.fight_state.p1_state;
        if (shouldAcceptState(state, current)) {
            room.fight_state.p1_state = sanitizeState(state, 1, current);
        }
    } else if (requester_id === room.guest) {
        const current = room.fight_state.p2_state;
        if (shouldAcceptState(state, current)) {
            room.fight_state.p2_state = sanitizeState(state, 2, current);
        }
    } else {
        return res.status(403).json({
            success: false,
            message: "Player is not part of this room"
        });
    }

    res.json(makeRoomState(room, requester_id));
});

app.post("/fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureFightState(room);
    res.json(makeRoomState(room, requester_id));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
