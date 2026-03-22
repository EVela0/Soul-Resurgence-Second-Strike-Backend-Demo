const express = require("express");
const app = express();

app.use(express.json());

let rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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

    res.json({
        success: true,
        room_code: room_code,
        status: rooms[room_code].status,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        p1_raw: rooms[room_code].char_select.p1_raw,
        p1_id: rooms[room_code].char_select.p1_id,
        p2_raw: rooms[room_code].char_select.p2_raw,
        p2_id: rooms[room_code].char_select.p2_id,
        stage_path: rooms[room_code].char_select.stage_path
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

    if (side === 1) {
        rooms[room_code].char_select.p1_raw = fighter_raw;
        rooms[room_code].char_select.p1_id = fighter_id;
    } else if (side === 2) {
        rooms[room_code].char_select.p2_raw = fighter_raw;
        rooms[room_code].char_select.p2_id = fighter_id;
    } else {
        return res.status(400).json({
            success: false,
            message: "Invalid side"
        });
    }

    const both_locked =
        rooms[room_code].char_select.p1_id !== "" &&
        rooms[room_code].char_select.p2_id !== "";

    res.json({
        success: true,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        p1_raw: rooms[room_code].char_select.p1_raw,
        p1_id: rooms[room_code].char_select.p1_id,
        p2_raw: rooms[room_code].char_select.p2_raw,
        p2_id: rooms[room_code].char_select.p2_id,
        stage_path: rooms[room_code].char_select.stage_path,
        both_locked: both_locked
    });
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const both_locked =
        rooms[room_code].char_select.p1_id !== "" &&
        rooms[room_code].char_select.p2_id !== "";

    res.json({
        success: true,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        p1_raw: rooms[room_code].char_select.p1_raw,
        p1_id: rooms[room_code].char_select.p1_id,
        p2_raw: rooms[room_code].char_select.p2_raw,
        p2_id: rooms[room_code].char_select.p2_id,
        stage_path: rooms[room_code].char_select.stage_path,
        both_locked: both_locked
    });
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

    rooms[room_code].char_select.stage_path = stage_path;

    const both_locked =
        rooms[room_code].char_select.p1_id !== "" &&
        rooms[room_code].char_select.p2_id !== "";

    res.json({
        success: true,
        host_tag: rooms[room_code].host_tag,
        guest_tag: rooms[room_code].guest_tag,
        p1_raw: rooms[room_code].char_select.p1_raw,
        p1_id: rooms[room_code].char_select.p1_id,
        p2_raw: rooms[room_code].char_select.p2_raw,
        p2_id: rooms[room_code].char_select.p2_id,
        stage_path: rooms[room_code].char_select.stage_path,
        both_locked: both_locked
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
