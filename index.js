const express = require("express");
const app = express();

app.use(express.json());

let rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
    ensureCharSelect(room);

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
    res.send("Backend is live");
});

app.post("/create_room", (req, res) => {
    const code = generateCode();

    rooms[code] = {
        host: req.body.player_id || "host_player",
        host_tag: req.body.gamertag || "Player One",
        guest: null,
        guest_tag: null,
        status: "waiting",
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
        message: "Room created"
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const player_id = req.body.player_id || "guest_player";
    const gamertag = req.body.gamertag || "Player Two";

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

    rooms[room_code].guest = player_id;
    rooms[room_code].guest_tag = gamertag;
    rooms[room_code].status = "full";

    res.json({
        success: true,
        room_code: room_code,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        message: "Joined room"
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    const state = makeRoomState(room);

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
        both_locked: state.both_locked
    });
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const side = Number(req.body.side || 0);
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

    if (side === 1) {
        room.char_select.p1_raw = fighter_raw;
        room.char_select.p1_id = fighter_id;
    } else if (side === 2) {
        room.char_select.p2_raw = fighter_raw;
        room.char_select.p2_id = fighter_id;
    } else {
        return res.status(400).json({
            success: false,
            message: "Invalid side"
        });
    }

    res.json(makeRoomState(room));
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    res.json(makeRoomState(rooms[room_code]));
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
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

    res.json(makeRoomState(room));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
