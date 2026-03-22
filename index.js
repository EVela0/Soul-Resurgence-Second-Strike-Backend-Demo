const express = require("express");
const app = express();
app.use(express.json());

let rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post("/create_room", (req, res) => {
    const code = generateCode();

    rooms[code] = {
        host: req.body.player_id,
        guest: null
    };

    res.json({ room_code: code });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const player_id = req.body.player_id || "guest_player";

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
    rooms[room_code].status = "full";

    res.json({
        success: true,
        room_code: room_code,
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
        status: rooms[room_code].status
    });
});

app.listen(3000, () => console.log("Server running"));
