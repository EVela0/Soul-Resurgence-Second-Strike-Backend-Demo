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
    const { room_code, player_id } = req.body;

    if (!rooms[room_code]) {
        return res.json({ success: false });
    }

    rooms[room_code].guest = player_id;

    res.json({ success: true });
});

app.listen(3000, () => console.log("Server running"));